const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchExperiments() {
  const res = await fetch(`${API}/experiments`, { next: { revalidate: 5 } });
  return res.json();
}

export async function fetchExperiment(key: string) {
  const res = await fetch(`${API}/results/${key}`, { cache: "no-store" });
  return res.json();
}

export async function createExperiment(data: unknown) {
  return fetch(`${API}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function startExperiment(key: string) {
  return fetch(`${API}/experiments/${key}/start`, { method: "POST" });
}

export async function pauseExperiment(key: string) {
  return fetch(`${API}/experiments/${key}/pause`, { method: "POST" });
}
