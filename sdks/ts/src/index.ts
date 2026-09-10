interface ApertureConfig {
  apiUrl: string;
}

interface ExperimentConfig {
  key: string;
  status: string;
  allocated_percentage: number;
  variants: { key: string; allocation: number; is_control: boolean }[];
}

interface AssignResponse {
  experiment_key: string;
  variant: string | null;
  assigned: boolean;
}

export class Aperture {
  private apiUrl: string;
  private configCache: Map<string, ExperimentConfig> = new Map();
  private configFetchedAt = 0;

  constructor(config: ApertureConfig) {
    this.apiUrl = config.apiUrl;
  }

  /** Fetch all active experiment configs. Call once at app startup. */
  async init() {
    const res = await fetch(`${this.apiUrl}/experiments`);
    const exps: { key: string }[] = await res.json();
    for (const exp of exps) {
      const c = await fetch(`${this.apiUrl}/experiments/${exp.key}/config`);
      if (c.ok) {
        this.configCache.set(exp.key, await c.json());
      }
    }
    this.configFetchedAt = Date.now();
  }

  /** Get variant — evaluates locally if config cached, falls back to API. */
  getVariant(experimentKey: string, userId: string): string | null {
    const config = this.configCache.get(experimentKey);
    if (config) {
      return this._evalLocal(config, userId);
    }
    return null; // fallback: call API or default to control
  }

  /** Async fallback for when local config isn't available. */
  async getVariantAsync(experimentKey: string, userId: string): Promise<string | null> {
    const config = this.configCache.get(experimentKey);
    if (config) return this._evalLocal(config, userId);

    const res = await fetch(`${this.apiUrl}/experiments/${experimentKey}/assign?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as AssignResponse;
    return data.variant;
  }

  /** Record exposure. Fire-and-forget. */
  expose(experimentKey: string, userId: string): void {
    fetch(`${this.apiUrl}/experiments/${experimentKey}/expose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
      keepalive: true,
    }).catch(() => {});
  }

  /** Track a single event. */
  async track(eventId: string, userId: string, eventName: string, value?: number, properties?: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/events/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, user_id: userId, event_name: eventName, value, properties }),
    });
    return res.ok;
  }

  /** Track batched events. */
  async trackBatch(events: { event_id: string; user_id: string; event_name: string; value?: number; properties?: Record<string, unknown> }[]): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    return res.ok;
  }

  private _evalLocal(config: ExperimentConfig, userId: string): string | null {
    if (config.status !== "running") return null;

    const hash = this._hash(userId + config.key);
    const bucket = hash % 100;
    if (bucket >= config.allocated_percentage) return null;

    const normalized = (bucket / config.allocated_percentage) * 100;
    let cum = 0;
    for (const v of config.variants) {
      cum += v.allocation;
      if (normalized < cum) return v.key;
    }
    return config.variants[config.variants.length - 1]?.key ?? null;
  }

  private _hash(input: string): number {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h + input.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 10000;
  }
}

export default Aperture;
