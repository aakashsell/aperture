interface ApertureConfig {
  apiUrl: string;
}

interface AssignResponse {
  experiment_key: string;
  variant: string | null;
  assigned: boolean;
}

interface ExposeResponse {
  exposed: boolean;
  variant?: string;
  reason?: string;
}

interface TrackResponse {
  ingested: boolean;
}

export class Aperture {
  private apiUrl: string;

  constructor(config: ApertureConfig) {
    this.apiUrl = config.apiUrl;
  }

  /**
   * Get the assigned variant for a user in an experiment.
   * Assignment is immutable once created.
   */
  async getVariant(experimentKey: string, userId: string): Promise<string | null> {
    const res = await fetch(`${this.apiUrl}/experiments/${experimentKey}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AssignResponse;
    return data.variant;
  }

  /**
   * Explicitly record that a user was exposed to their assigned variant.
   * Only exposed users count toward experiment results.
   */
  async expose(experimentKey: string, userId: string): Promise<ExposeResponse> {
    const res = await fetch(`${this.apiUrl}/experiments/${experimentKey}/expose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) return { exposed: false };
    return (await res.json()) as ExposeResponse;
  }

  /**
   * Track an event for a user. Idempotent by event_id.
   */
  async track(
    eventId: string,
    userId: string,
    eventName: string,
    value?: number,
    properties?: Record<string, unknown>
  ): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/events/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, user_id: userId, event_name: eventName, value, properties }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TrackResponse;
    return data.ingested;
  }
}

export default Aperture;
