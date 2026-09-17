export interface ApertureConfig {
  apiUrl: string;
  publishableKey: string;
  timeoutMs?: number;
  onError?: (error: Error) => void;
}

export interface AllocationUnit {
  id: string;
  kind:
    | "anonymous"
    | "user"
    | "installation"
    | "device"
    | "account"
    | "organization"
    | "host";
}

export interface GateHealthSignal {
  eventId: string;
  name: string;
  severity: "info" | "warning" | "error" | "fatal";
  properties?: Record<string, unknown>;
  exception?: ExceptionDetails;
  timestamp?: string;
}

export interface ExceptionDetails {
  type: string;
  message: string;
  stack?: string;
}

export interface CrashSignal {
  eventId: string;
  name: string;
  severity: "info" | "warning" | "error" | "fatal";
  exception?: ExceptionDetails;
  properties?: Record<string, unknown>;
  timestamp?: string;
  gateKey?: string;
  configVersion?: number;
}

export interface Event {
  event_id: string;
  user_id: string;
  event_name: string;
  value?: number;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

interface GateDecision {
  enabled: boolean;
  config_version: number;
  expires_at: string;
  allocation: AllocationUnit;
}

interface ChromeLocalStorage {
  get(key: string, callback?: (items: Record<string, unknown>) => void): Promise<Record<string, unknown>> | void;
  set(items: Record<string, unknown>, callback?: () => void): Promise<void> | void;
}

/** Server-authoritative rollouts and experiments with explicit exposure. */
export class Aperture {
  private assignments = new Map<string, string>();
  private gateDecisions = new Map<string, GateDecision>();
  private anonymousIdentity: Promise<AllocationUnit> | null = null;
  private recentCrashes = new Map<string, number>();

  constructor(private config: ApertureConfig) {}

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
    try {
      const response = await fetch(`${this.config.apiUrl.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": this.config.publishableKey },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Aperture request failed (${response.status}): ${await response.text()}`);
      }
      return (await response.json()) as T;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.config.onError?.(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private decisionKey(gateKey: string, allocation: AllocationUnit): string {
    return JSON.stringify([gateKey, allocation.kind, allocation.id]);
  }

  private chromeStorage(): ChromeLocalStorage | null {
    const root = globalThis as unknown as { chrome?: { storage?: { local?: ChromeLocalStorage } } };
    return root.chrome?.storage?.local ?? null;
  }

  private async readChromeStorage(storage: ChromeLocalStorage, key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (items: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        resolve(typeof items[key] === "string" ? (items[key] as string) : null);
      };
      try {
        const result = storage.get(key, finish);
        if (result && typeof result.then === "function") result.then(finish, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async writeChromeStorage(storage: ChromeLocalStorage, key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      try {
        const result = storage.set({ [key]: value }, finish);
        if (result && typeof result.then === "function") result.then(finish, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private createID(): string {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) throw new Error("Secure random identity generation is unavailable");
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  private async loadAnonymousAllocation(): Promise<AllocationUnit> {
    const storageKey = `aperture:allocation:${this.config.publishableKey}`;
    const chromeStorage = this.chromeStorage();
    if (chromeStorage) {
      let id = await this.readChromeStorage(chromeStorage, storageKey);
      if (!id) {
        id = this.createID();
        await this.writeChromeStorage(chromeStorage, storageKey, id);
      }
      return { kind: "anonymous", id };
    }
    if (typeof window !== "undefined" && window.localStorage) {
      let id = window.localStorage.getItem(storageKey);
      if (!id) {
        id = this.createID();
        window.localStorage.setItem(storageKey, id);
      }
      return { kind: "anonymous", id };
    }
    throw new Error("gate() requires an allocation unit outside a browser or Chrome extension");
  }

  private anonymousAllocation(): Promise<AllocationUnit> {
    if (!this.anonymousIdentity) {
      this.anonymousIdentity = this.loadAnonymousAllocation().catch((error) => {
        this.anonymousIdentity = null;
        throw error;
      });
    }
    return this.anonymousIdentity;
  }

  /** Evaluate a rollout. Browser clients may omit a persistent allocation ID. */
  async gate(gateKey: string, allocation?: AllocationUnit, options: { refresh?: boolean } = {}): Promise<boolean> {
    const unit = allocation ?? (await this.anonymousAllocation());
    const key = this.decisionKey(gateKey, unit);
    const cached = this.gateDecisions.get(key);
    if (cached && !options.refresh && Date.parse(cached.expires_at) > Date.now()) return cached.enabled;
    const result = await this.request<{ enabled: boolean; config_version: number; expires_at: string }>(
      `/gates/${encodeURIComponent(gateKey)}/evaluate`,
      { allocation: unit },
    );
    this.gateDecisions.set(key, { ...result, allocation: unit });
    return result.enabled;
  }

  /** Record the gate decision actually used, whether enabled or disabled. */
  async exposeGate(gateKey: string, enabled: boolean, allocation?: AllocationUnit): Promise<boolean> {
    const unit = allocation ?? (await this.anonymousAllocation());
    const decision = this.gateDecisions.get(this.decisionKey(gateKey, unit));
    if (!decision || decision.enabled !== enabled) {
      throw new Error("Exposure must match a gate decision from this SDK instance");
    }
    await this.request(`/gates/${encodeURIComponent(gateKey)}/expose`, {
      allocation: unit,
      enabled,
      config_version: decision.config_version,
    });
    return true;
  }

  /** Report a health observation against the gate decision used by this client. */
  async reportGateHealth(
    gateKey: string,
    signal: GateHealthSignal,
    allocation?: AllocationUnit,
  ): Promise<boolean> {
    const unit = allocation ?? (await this.anonymousAllocation());
    const decision = this.gateDecisions.get(this.decisionKey(gateKey, unit));
    if (!decision) throw new Error("Evaluate the gate before reporting health");
    await this.request(`/gates/${encodeURIComponent(gateKey)}/health`, {
      allocation: unit,
      enabled: decision.enabled,
      config_version: decision.config_version,
      event_id: signal.eventId,
      name: signal.name,
      severity: signal.severity,
      properties: signal.properties,
      exception: signal.exception,
      timestamp: signal.timestamp,
    });
    return true;
  }

  /** Report an exception even when the failing code has no known gate. */
  async reportCrash(signal: CrashSignal, allocation?: AllocationUnit): Promise<boolean> {
    const unit = allocation ?? (await this.anonymousAllocation());
    const message = signal.exception?.message ?? "";
    const fingerprint = JSON.stringify([
      unit.kind,
      unit.id,
      signal.name,
      signal.exception?.type ?? "",
      message,
    ]);
    const now = Date.now();
    for (const [key, seenAt] of this.recentCrashes) {
      if (now - seenAt >= 5 * 60 * 1000) this.recentCrashes.delete(key);
    }
    const previous = this.recentCrashes.get(fingerprint);
    if (previous !== undefined && now - previous < 5 * 60 * 1000) return true;
    await this.request("/crashes/ingest", {
      allocation: unit,
      event_id: signal.eventId,
      gate_key: signal.gateKey,
      config_version: signal.configVersion,
      name: signal.name,
      severity: signal.severity,
      exception: signal.exception,
      properties: signal.properties,
      timestamp: signal.timestamp,
    });
    this.recentCrashes.delete(fingerprint);
    this.recentCrashes.set(fingerprint, now);
    while (this.recentCrashes.size > 20) {
      const oldest = this.recentCrashes.keys().next().value;
      if (oldest === undefined) break;
      this.recentCrashes.delete(oldest);
    }
    return true;
  }

  /** Null means no experiment assignment; errors reject for an explicit fallback. */
  async getVariant(experimentKey: string, userId: string): Promise<string | null> {
    const result = await this.request<{ variant: string | null }>(
      `/experiments/${encodeURIComponent(experimentKey)}/assign`,
      { user_id: userId },
    );
    const key = JSON.stringify([experimentKey, userId]);
    if (result.variant) this.assignments.set(key, result.variant);
    else this.assignments.delete(key);
    return result.variant;
  }

  getVariantAsync(experimentKey: string, userId: string) {
    return this.getVariant(experimentKey, userId);
  }

  async expose(experimentKey: string, userId: string, variant?: string): Promise<boolean> {
    const displayed = variant ?? this.assignments.get(JSON.stringify([experimentKey, userId]));
    if (!displayed) throw new Error("Fetch an assignment before recording exposure");
    await this.request(`/experiments/${encodeURIComponent(experimentKey)}/expose`, {
      user_id: userId,
      variant: displayed,
    });
    return true;
  }

  async track(
    eventId: string,
    userId: string,
    eventName: string,
    value?: number,
    properties?: Record<string, unknown>,
  ): Promise<boolean> {
    await this.request("/events/track", { event_id: eventId, user_id: userId, event_name: eventName, value, properties });
    return true;
  }

  async trackBatch(events: Event[]): Promise<boolean> {
    await this.request("/events/batch", { events });
    return true;
  }
}

export default Aperture;
