"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchExperiment, pauseExperiment, fetchMetrics, createMetric, linkMetric } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, ArrowLeft, AlertTriangle, Link2, Plus, Loader2 } from "lucide-react";

function fmt(v: number, type: string) {
  if (v == null || isNaN(v)) return "—";
  if (type === "binary") return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(v: number) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function verdict(t: any) {
  if (!t || t.lift == null) return "inconclusive";
  if (t.lift_ci_lower > 0) return "favors_treatment";
  if (t.lift_ci_upper < 0) return "favors_control";
  return "inconclusive";
}

export default function ExperimentDetail() {
  const { key } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [showLinkMetric, setShowLinkMetric] = useState(false);
  const [showCreateMetric, setShowCreateMetric] = useState(false);
  const [newMetric, setNewMetric] = useState({ name: "", event_name: "", metric_type: "binary" });

  const load = async () => {
    if (!key) return;
    setLoading(true);
    const [expData, allMetrics] = await Promise.all([
      fetchExperiment(key as string),
      fetchMetrics(),
    ]);
    setData(expData);
    setMetrics(Array.isArray(allMetrics) ? allMetrics : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [key]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Not found</p>
      </div>
    );
  }

  const expKey = data.experiment_key;
  const status = data.status;
  const srmWarning = data.srm_p_value != null && data.srm_p_value < 0.001;
  const primaryMetric = data.metrics?.find((m: any) => m.is_primary);
  const treatment = primaryMetric?.treatments?.[0];
  const v = verdict(treatment);
  const hasResults = data.metrics?.some((m: any) => m.control?.mean != null);
  const linkedMetricIds = new Set(data.metrics?.map((m: any) => m.metric_id) ?? []);
  const unlinkedMetrics = metrics.filter((m: any) => !linkedMetricIds.has(m.id));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
          <a href="/" className="text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <span className="text-sm font-mono text-slate-400">{expKey}</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{data.experiment_key}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                status === "running" ? "bg-green-100 text-green-700" :
                status === "paused" ? "bg-amber-100 text-amber-700" :
                status === "completed" ? "bg-blue-100 text-blue-700" :
                "bg-slate-100 text-slate-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  status === "running" ? "bg-green-500 animate-pulse" :
                  status === "paused" ? "bg-amber-500" :
                  status === "completed" ? "bg-blue-500" :
                  "bg-slate-400"
                }`} />
                {status}
              </span>
              {hasResults && primaryMetric?.control && (
                <span className="text-xs text-slate-400">
                  {primaryMetric.control.sample_size + (treatment?.sample_size ?? 0)} total users
                </span>
              )}
            </div>
          </div>

          {status === "running" && (
            <Button variant="outline" size="sm" onClick={async () => {
              await pauseExperiment(expKey);
              load();
            }}>
              <Pause className="w-3.5 h-3.5 mr-1.5" />
              Pause
            </Button>
          )}
          {status === "paused" && (
            <Button variant="default" size="sm" onClick={async () => {
              await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/experiments/${expKey}/start`, { method: "POST" });
              load();
            }}>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Resume
            </Button>
          )}
        </div>

        {/* SRM Warning */}
        {srmWarning && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-800">Sample Ratio Mismatch</p>
                <p className="text-xs text-red-600">Variant assignment is unbalanced. Check your randomization logic.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SDK Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SDK Setup</CardTitle>
            <CardDescription>Copy this into your app to wire up this experiment</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto">
{`import { Aperture } from "@aperture/sdk";
const ap = new Aperture({ apiUrl: "http://localhost:8000" });

// Evaluated locally — zero latency
const variant = ap.getVariant("${expKey}", user.id);

if (variant === "treatment") {
  renderNew();
} else {
  renderOld();
}

// Record that user saw the variant
ap.expose("${expKey}", user.id);

// Track the outcome
ap.track(crypto.randomUUID(), user.id, "purchase", 49.99);`}
            </pre>
          </CardContent>
        </Card>

        {/* Results or Empty State */}
        {hasResults && primaryMetric ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{primaryMetric.metric_name}</CardTitle>
                <CardDescription>Primary metric</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {primaryMetric.control && (
                  <div className="bg-slate-50 rounded-lg p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Control</p>
                    <p className="text-4xl font-bold text-slate-900 mt-2">{fmt(primaryMetric.control.mean, primaryMetric.metric_type)}</p>
                    <p className="text-sm text-slate-500 mt-1">{primaryMetric.control.sample_size?.toLocaleString()} users</p>
                    {primaryMetric.control.mde != null && (
                      <p className="text-xs text-slate-400 mt-2">MDE: {fmtPct(primaryMetric.control.mde)}</p>
                    )}
                  </div>
                )}
                {treatment && (
                  <div className="bg-slate-50 rounded-lg p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{treatment.variant}</p>
                    <p className="text-4xl font-bold text-slate-900 mt-2">{fmt(treatment.mean, primaryMetric.metric_type)}</p>
                    <p className="text-sm text-slate-500 mt-1">{treatment.sample_size?.toLocaleString()} users</p>
                  </div>
                )}
              </div>

              {treatment?.lift != null && (
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold ${
                      v === "favors_treatment" ? "text-green-600" :
                      v === "favors_control" ? "text-red-600" :
                      "text-slate-700"
                    }`}>
                      {treatment.lift > 0 ? "+" : ""}{fmtPct(treatment.lift)}
                    </span>
                    <span className="text-sm text-slate-400 font-mono">
                      [{fmtPct(treatment.lift_ci_lower)}, {fmtPct(treatment.lift_ci_upper)}]
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg ${
                      v === "favors_treatment" ? "bg-green-100 text-green-700" :
                      v === "favors_control" ? "bg-red-100 text-red-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {v === "favors_treatment" && "🟢 Likely winner"}
                      {v === "favors_control" && "🔴 Control winning"}
                      {v === "inconclusive" && "🟡 Inconclusive"}
                    </span>
                    {treatment.mde != null && (
                      <span className={`text-xs ${Math.abs(treatment.lift) < treatment.mde ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                        {Math.abs(treatment.lift) < treatment.mde ? "Underpowered" : "Sufficiently powered"}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-500 font-medium">No results yet</p>
              <p className="text-slate-400 text-sm mt-1">
                {data.metrics?.length > 0
                  ? "Events haven't been processed yet. The worker runs every 30 seconds."
                  : "Link a metric and send events to see results."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Secondary Metrics */}
        {data.metrics?.filter((m: any) => !m.is_primary).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Secondary Metrics</h3>
            {data.metrics.filter((m: any) => !m.is_primary).map((m: any) => (
              <Card key={m.metric_id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-sm">{m.metric_name}</span>
                    <span className="text-xs text-slate-400 uppercase">{m.metric_type}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {m.control && (
                      <div>
                        <span className="text-slate-400 text-xs">Control</span>
                        <p className="font-semibold text-slate-900">{fmt(m.control.mean, m.metric_type)}</p>
                      </div>
                    )}
                    {m.treatments?.map((t: any) => (
                      <div key={t.variant}>
                        <span className="text-slate-400 text-xs">{t.variant}</span>
                        <p className="font-semibold text-slate-900">{fmt(t.mean, m.metric_type)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Metric Manager */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metrics</CardTitle>
            <CardDescription>What to measure for this experiment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Create metric */}
            {showCreateMetric ? (
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1.5">Name</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newMetric.name}
                      onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })}
                      placeholder="Purchase Rate"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1.5">Event</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      value={newMetric.event_name}
                      onChange={(e) => setNewMetric({ ...newMetric, event_name: e.target.value })}
                      placeholder="purchase"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase mb-1.5">Type</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={newMetric.metric_type}
                    onChange={(e) => setNewMetric({ ...newMetric, metric_type: e.target.value })}
                  >
                    <option value="binary">Binary (conversion yes/no)</option>
                    <option value="continuous">Continuous (revenue, time)</option>
                    <option value="count">Count (number of actions)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={async () => {
                    const m = await createMetric(newMetric);
                    if (m?.id) {
                      await linkMetric(expKey, m.id, data.metrics?.length === 0);
                      setShowCreateMetric(false);
                      setNewMetric({ name: "", event_name: "", metric_type: "binary" });
                      load();
                    }
                  }}>Create & Link</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateMetric(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowCreateMetric(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Metric
              </Button>
            )}

            {/* Link existing metric */}
            {unlinkedMetrics.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-2">Link existing</p>
                <div className="flex flex-wrap gap-2">
                  {unlinkedMetrics.map((m: any) => (
                    <Button
                      key={m.id}
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await linkMetric(expKey, m.id, data.metrics?.length === 0);
                        load();
                      }}
                    >
                      <Link2 className="w-3 h-3 mr-1.5" />
                      {m.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Linked metrics */}
            {data.metrics?.length > 0 && (
              <div className="space-y-2">
                {data.metrics.map((m: any) => (
                  <div key={m.metric_id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{m.metric_name}</span>
                      {m.is_primary && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Primary</span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">{m.metric_type}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{m.control?.sample_size ?? 0} users</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
