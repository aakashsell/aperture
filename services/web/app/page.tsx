"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchExperiments, createExperiment, startExperiment } from "@/lib/api";

const statusColors: Record<string, string> = {
  draft: "bg-gray-200 text-gray-700",
  running: "bg-green-200 text-green-800",
  paused: "bg-yellow-200 text-yellow-800",
  completed: "bg-blue-200 text-blue-800",
};

export default function Home() {
  const [exps, setExps] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    variants: [
      { key: "control", name: "Control", allocation: 50, is_control: true },
      { key: "treatment", name: "Treatment", allocation: 50 },
    ],
    activation_event: "",
  });

  const load = useCallback(() => fetchExperiments().then(setExps), []);
  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createExperiment(form);
    setShowForm(false);
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Aperture</h1>
          <p className="text-gray-500 text-sm mt-1">Open-source experimentation</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800"
        >
          + New Experiment
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-6 mb-8 space-y-4">
          <h2 className="font-semibold">Create Experiment</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Key</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.key}
                onChange={e => setForm({ ...form, key: e.target.value })}
                placeholder="checkout_v2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Checkout Redesign"
                required
              />
            </div>
          </div>
          <button type="submit" className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium">
            Create
          </button>
        </form>
      )}

      <div className="space-y-3">
        {exps.length === 0 && <p className="text-gray-500 text-sm">No experiments yet.</p>}
        {exps.map((exp: any) => (
          <a
            key={exp.id}
            href={`/experiments/${exp.key}`}
            className="block bg-white border rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{exp.name}</h3>
                <p className="text-gray-500 text-sm">{exp.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[exp.status]}`}>
                  {exp.status}
                </span>
                {exp.status === "draft" && (
                  <button
                    onClick={async e => {
                      e.preventDefault();
                      await startExperiment(exp.key);
                      load();
                    }}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium"
                  >
                    Start
                  </button>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
