export interface Experiment {
  id: number;
  key: string;
  name: string;
  status: string;
  hypothesis: string;
  allocated_percentage: number;
  exposures: number;
  results_updated_at: string | null;
}
export interface Metric {
  id: number;
  name: string;
  event_name: string;
  metric_type: string;
}
export interface Estimate {
  variant: string;
  sample_size: number;
  mean?: number;
  lift?: number;
  lift_ci_lower?: number;
  lift_ci_upper?: number;
  p_value?: number;
  mde?: number;
}
export interface Result {
  integrity: {
    status: string;
    issues: string[];
    variants: {
      variant: string;
      assigned: number;
      exposed: number;
      coverage: number | null;
    }[];
  };
  experiment_key: string;
  status: string;
  srm_p_value: number | null;
  summary: {
    name: string;
    hypothesis: string;
    assignments: number;
    exposures: number;
    attribution_days: number;
    results_updated_at: string | null;
    winner: string | null;
  };
  metrics: {
    metric_id: number;
    metric_name: string;
    metric_type: string;
    is_primary: boolean;
    control: Estimate | null;
    treatments: Estimate[] | null;
  }[];
}
export interface Session {
  email: string;
  project_id: number;
  project_name: string;
  publishable_key: string;
}
export interface WorkspaceChoice {
  id: number;
  name: string;
}
const ACTIVE_PROJECT_KEY = "aperture:active-project";
export function setActiveProject(id: number | null) {
  if (typeof window === "undefined") return;
  if (id === null) window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
  else window.localStorage.setItem(ACTIVE_PROJECT_KEY, String(id));
}
function workspaceHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
  return id ? { "X-Aperture-Project": id } : {};
}
export interface Diagnostics {
  worker_updated_at: string | null;
  events: {
    event_id: string;
    user_id: string;
    event_name: string;
    value: number | null;
    timestamp: string;
  }[];
}
export interface GateSummary {
  id: number;
  key: string;
  name: string;
  description: string;
  status: "off" | "running" | "archived";
  rollout_basis_points: number;
  allocation_kind: string;
  config_version: number;
  evaluations: number;
  exposures: number;
  errors_24h: number;
  created_at: string;
  updated_at: string;
}
export interface Channel {
  key: string;
  name: string;
  allocation_kind: string;
  fill_basis_points: number;
  config_version: number;
  members: number;
}
export interface GateChange {
  config_version: number;
  status: string;
  rollout_basis_points: number;
  changed_at: string;
}
export interface GateDetail {
  key: string;
  name: string;
  description: string;
  status: "off" | "running" | "archived";
  rollout_percentage: number;
  allocation_kind: string;
  channel_key: string | null;
  config_version: number;
  evaluations: number;
  exposures: number;
  enabled_exposures: number;
  disabled_exposures: number;
  enabled_errors: number;
  disabled_errors: number;
  health_status: "collecting" | "no_flags" | "needs_review";
  changes: GateChange[];
}
export interface CrashReport {
  event_id: string;
  allocation_kind: string;
  allocation_id_hash: string;
  gate_key: string | null;
  config_version: number | null;
  name: string;
  severity: string;
  exception_type: string | null;
  exception_message: string | null;
  exception_stack: string | null;
  properties: Record<string, unknown> | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...workspaceHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new APIError(
      res.status,
      data.error || "Request failed. Please try again.",
    );
  return data as T;
}
export async function deleteResource<T = { deleted: boolean }>(
  path: string,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: workspaceHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new APIError(
      res.status,
      data.error || "Delete failed. Please try again.",
    );
  return data as T;
}
export const fetchWorkspaces = () =>
  request<WorkspaceChoice[]>("/auth/workspaces");
export const createWorkspace = (name: string) =>
  request<WorkspaceChoice>("/auth/workspaces", { name });
export const fetchExperiments = () => request<Experiment[]>("/experiments");
export const fetchExperiment = (key: string) =>
  request<Result>(`/results/${encodeURIComponent(key)}`);
export const fetchMetrics = () => request<Metric[]>("/metrics");
export const createExperiment = (data: unknown) =>
  request<{ key: string }>("/experiments", data);
export const createMetric = (data: unknown) =>
  request<Metric>("/metrics", data);
export const linkMetric = (key: string, metricId: number, isPrimary: boolean) =>
  request(`/experiments/${encodeURIComponent(key)}/metrics`, {
    metric_id: metricId,
    is_primary: isPrimary,
  });
export const startExperiment = (key: string) =>
  request(`/experiments/${encodeURIComponent(key)}/start`, {});
export const pauseExperiment = (key: string) =>
  request(`/experiments/${encodeURIComponent(key)}/pause`, {});
export const archiveExperiment = (key: string) =>
  request(`/experiments/${encodeURIComponent(key)}/archive`, {});
export const deleteExperiment = (key: string) =>
  deleteResource(`/experiments/${encodeURIComponent(key)}`);
export const fetchGates = () => request<GateSummary[]>("/gates");
export const fetchChannels = () => request<Channel[]>("/channels");
export const createChannel = (data: unknown) =>
  request<{ key: string }>("/channels", data);
export const updateChannelFill = (
  key: string,
  fillPercentage: number,
  expectedVersion: number,
) =>
  request(`/channels/${encodeURIComponent(key)}/fill`, {
    fill_percentage: fillPercentage,
    expected_version: expectedVersion,
  });
export const replaceChannelMembers = (
  key: string,
  allocationIDs: string[],
  expectedVersion: number,
) =>
  request(`/channels/${encodeURIComponent(key)}/members`, {
    allocation_ids: allocationIDs,
    expected_version: expectedVersion,
  });
export const fetchGate = (key: string) =>
  request<GateDetail>(`/gates/${encodeURIComponent(key)}`);
export const createGate = (data: unknown) =>
  request<{ key: string }>("/gates", data);
export const updateGateRollout = (
  key: string,
  rolloutPercentage: number,
  expectedVersion: number,
) =>
  request(`/gates/${encodeURIComponent(key)}/rollout`, {
    rollout_percentage: rolloutPercentage,
    expected_version: expectedVersion,
  });
export const disableGate = (key: string, expectedVersion: number) =>
  request(`/gates/${encodeURIComponent(key)}/disable`, {
    expected_version: expectedVersion,
  });
export const archiveGate = (key: string, expectedVersion: number) =>
  request(`/gates/${encodeURIComponent(key)}/archive`, {
    expected_version: expectedVersion,
  });
export const deleteGate = (key: string) =>
  deleteResource(`/gates/${encodeURIComponent(key)}`);
export const inspectGateOverride = (
  key: string,
  allocation: { id: string; kind: string },
) =>
  request<{
    override: boolean | null;
    config_version: number;
    history: { action: string; config_version: number; changed_at: string }[];
  }>(`/gates/${encodeURIComponent(key)}/overrides/inspect`, { allocation });
export const explainAllocation = (
  allocation: { id: string; kind: string },
  gateKeys: string[],
) =>
  request<{
    decisions: {
      gate_key: string;
      enabled: boolean;
      reason: string;
      config_version: number;
    }[];
  }>("/debug/allocation/evaluate", { allocation, gate_keys: gateKeys });
export const setGateOverride = (
  key: string,
  allocation: { id: string; kind: string },
  enabled: boolean,
  expectedVersion: number,
) =>
  request<{ override: boolean; config_version: number }>(
    `/gates/${encodeURIComponent(key)}/overrides`,
    { allocation, enabled, expected_version: expectedVersion },
  );
export const removeGateOverride = (
  key: string,
  allocation: { id: string; kind: string },
  expectedVersion: number,
) =>
  request<{ override: null; config_version: number }>(
    `/gates/${encodeURIComponent(key)}/overrides/remove`,
    { allocation, expected_version: expectedVersion },
  );
export const queryCrashReports = (data: {
  allocation_id?: string;
  allocation_kind?: string;
  limit?: number;
}) => request<CrashReport[]>("/crashes/query", data);
