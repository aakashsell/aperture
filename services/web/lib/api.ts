const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function get(path: string) {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? await res.json() : null;
}

export const fetchExperiments = async () => get("/experiments") ?? [];
export const fetchExperiment = async (key: string) => get(`/results/${key}`);
export const createExperiment = async (data: unknown) => post("/experiments", data);
export const startExperiment = async (key: string) => fetch(`${API}/experiments/${key}/start`, { method: "POST" });
export const pauseExperiment = async (key: string) => fetch(`${API}/experiments/${key}/pause`, { method: "POST" });
export const fetchMetrics = async () => get("/metrics") ?? [];
export const createMetric = async (data: unknown) => post("/metrics", data);
export const linkMetric = async (expKey: string, metricId: number, isPrimary: boolean) =>
  post(`/experiments/${expKey}/metrics`, { metric_id: metricId, is_primary: isPrimary });
