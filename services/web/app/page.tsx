"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchExperiments, createExperiment, startExperiment } from "@/lib/api";

const statusColors: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  draft: { dot: "bg-slate-400", bg: "bg-slate-50", text: "text-slate-600", label: "Draft" },
  running: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700", label: "Running" },
  paused: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
  completed: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Completed" },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || statusColors.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export default function Home() {
  const [exps, setExps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ key: "", name: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchExperiments();
    setExps(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key || !form.name) return;
    const ok = await createExperiment({
      ...form,
      variants: [
        { key: "control", name: "Control", allocation: 50, is_control: true },
        { key: "treatment", name: "Treatment", allocation: 50 },
      ],
      allocated_percentage: 100,
    });
    if (ok) {
      setShowForm(false);
      setForm({ key: "", name: "" });
      load();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-xs">A</div>
            <span className="font-semibold text-slate-900 text-sm">Aperture</span>
          </div>
          <a href="https://github.com/aakashsell/aperture" className="text-xs text-slate-400 hover:text-slate-600 font-medium">GitHub</a>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Experiments</h1>
            <p className="text-slate-500 text-sm mt-1">A/B testing that works. No data team required.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            + New experiment
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Create experiment</h3>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Key</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="checkout_v2"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">Used in your code</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Name</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Checkout Redesign"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">Shown in dashboard</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-800">
                Create
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 px-4 py-2 text-sm hover:text-slate-700">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : exps.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-20 text-center">
            <p className="text-slate-500 font-medium">No experiments yet</p>
            <p className="text-slate-400 text-sm mt-1">Create your first A/B test to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {exps.map((exp: any) => (
              <a
                key={exp.id}
                href={`/experiments/${exp.key}`}
                className="group flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  <StatusBadge status={exp.status} />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">{exp.name}</h3>
                    <p className="text-slate-400 text-xs font-mono mt-0.5">{exp.key}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {exp.status === "draft" && (
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        await startExperiment(exp.key);
                        load();
                      }}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      Start
                    </button>
                  )}
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
