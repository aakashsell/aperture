"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchExperiments, createExperiment, startExperiment } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, Plus, Play, ArrowRight, Loader2 } from "lucide-react";

const statusConfig: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  draft: { dot: "bg-slate-400", bg: "bg-slate-50", text: "text-slate-600", label: "Draft" },
  running: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700", label: "Running" },
  paused: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "Paused" },
  completed: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", label: "Completed" },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusConfig[status] || statusConfig.draft;
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
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-slate-900" />
            <span className="font-semibold text-slate-900 text-sm">Aperture</span>
          </div>
          <a href="https://github.com/aakashsell/aperture" className="text-xs text-slate-400 hover:text-slate-600 font-medium">GitHub</a>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Experiments</h1>
            <p className="text-slate-500 text-sm mt-1">A/B testing that actually works</p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New experiment
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-800 mb-4">Create experiment</h3>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Key</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Checkout Redesign"
                      required
                    />
                    <p className="text-xs text-slate-400 mt-1">Shown in dashboard</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button type="submit">Create</Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="py-6">
                  <div className="animate-pulse flex items-center gap-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 rounded w-48" />
                      <div className="h-3 bg-slate-100 rounded w-32" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : exps.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <FlaskConical className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">No experiments yet</p>
              <p className="text-slate-400 text-sm mt-1 mb-4">Create your first A/B test to get started</p>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create experiment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {exps.map((exp: any) => (
              <a
                key={exp.id}
                href={`/experiments/${exp.key}`}
                className="group block bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={exp.status} />
                    <div>
                      <h3 className="font-semibold text-slate-900">{exp.name}</h3>
                      <p className="text-slate-400 text-xs font-mono mt-0.5">{exp.key}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {exp.status === "draft" && (
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={async (e) => {
                          e.preventDefault();
                          await startExperiment(exp.key);
                          load();
                        }}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Start
                      </Button>
                    )}
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
