const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function get(path: string) {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchExperiments() {
  return get("/experiments") ?? [];
}

export async function fetchExperiment(key: string) {
  return get(`/results/${key}`);
}

export async function createExperiment(data: unknown) {
  const res = await fetch(`${API}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function startExperiment(key: string) {
  return fetch(`${API}/experiments/${key}/start`, { method: "POST" });
}

export async function pauseExperiment(key: string) {
  return fetch(`${API}/experiments/${key}/pause`, { method: "POST" });
}
