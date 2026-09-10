"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchExperiment, pauseExperiment } from "@/lib/api";

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

  useEffect(() => {
    if (key) {
      setLoading(true);
      fetchExperiment(key as string).then((d) => {
        setData(d);
        setLoading(false);
      });
    }
  }, [key]);

  if (loading) return <div className="max-w-4xl mx-auto p-8 text-slate-400 text-sm">Loading...</div>;
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-slate-500">Not found</div>;

  const expKey = data.experiment_key;
  const status = data.status;
  const srmWarning = data.srm_p_value != null && data.srm_p_value < 0.001;
  const primaryMetric = data.metrics?.find((m: any) => m.is_primary);
  const treatment = primaryMetric?.treatments?.[0];
  const v = verdict(treatment);
  const hasResults = data.metrics?.some((m: any) => m.control?.mean != null);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-xs">A</div>
            <span className="font-semibold text-slate-900 text-sm">Aperture</span>
          </a>
          <span className="text-xs text-slate-400">{expKey}</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{expKey}</h1>
            <span className={`inline-block mt-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              status === "running" ? "bg-green-100 text-green-700" :
              status === "paused" ? "bg-amber-100 text-amber-700" :
              status === "completed" ? "bg-blue-100 text-blue-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              {status}
            </span>
          </div>
          {status === "running" && (
            <button
              onClick={async () => {
                await pauseExperiment(expKey);
                fetchExperiment(expKey).then(setData);
              }}
              className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700"
            >
              Pause
            </button>
          )}
        </div>

        {srmWarning && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
            <p className="font-semibold text-sm">⚠️ Sample Ratio Mismatch</p>
            <p className="text-xs mt-1">Randomization looks broken. Check your hash function.</p>
          </div>
        )}

        {/* Code setup */}
        <div className="bg-white border border-slate-200 rounded-xl mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">SDK</span>
            <span className="text-xs text-slate-400">npm install @aperture/sdk</span>
          </div>
          <pre className="p-5 text-xs font-mono bg-slate-950 text-slate-100 overflow-x-auto leading-relaxed">
{`import { Aperture } from "@aperture/sdk";

const ap = new Aperture({ apiUrl: "http://localhost:8000" });

// 1. Get variant (zero latency)
const variant = ap.getVariant("${expKey}", user.id);

// 2. Use it
if (variant === "treatment") renderNew();

// 3. Record exposure
ap.expose("${expKey}", user.id);

// 4. Track conversion
ap.track(evtId, user.id, "purchase", 49.99);`}
          </pre>
        </div>

        {/* Results */}
        {primaryMetric && (
          <div className="bg-white border border-slate-200 rounded-xl mb-6">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <h2 className="font-semibold text-slate-800">{primaryMetric.metric_name}</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Primary</span>
            </div>

            <div className="p-5 grid grid-cols-2 gap-6">
              {primaryMetric.control && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Control</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{fmt(primaryMetric.control.mean, primaryMetric.metric_type)}</p>
                  <p className="text-sm text-slate-500 mt-1">{primaryMetric.control.sample_size?.toLocaleString()} users</p>
                  {primaryMetric.control.mde != null && (
                    <p className="text-xs text-slate-400 mt-2">MDE: {fmtPct(primaryMetric.control.mde)}</p>
                  )}
                </div>
              )}
              {treatment && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{treatment.variant}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{fmt(treatment.mean, primaryMetric.metric_type)}</p>
                  <p className="text-sm text-slate-500 mt-1">{treatment.sample_size?.toLocaleString()} users</p>
                </div>
              )}
            </div>

            {treatment?.lift != null && (
              <div className="px-5 pb-5">
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-baseline gap-3">
                    <span className={`text-2xl font-bold ${
                      v === "favors_treatment" ? "text-green-600" :
                      v === "favors_control" ? "text-red-600" :
                      "text-slate-600"
                    }`}>
                      {treatment.lift > 0 ? "+" : ""}{fmtPct(treatment.lift)}
                    </span>
                    <span className="text-sm text-slate-400">
                      [{fmtPct(treatment.lift_ci_lower)}, {fmtPct(treatment.lift_ci_upper)}]
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
                      v === "favors_treatment" ? "bg-green-100 text-green-700" :
                      v === "favors_control" ? "bg-red-100 text-red-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {v === "favors_treatment" && "Likely winner"}
                      {v === "favors_control" && "Control winning"}
                      {v === "inconclusive" && "Inconclusive"}
                    </span>
                    {treatment.mde != null && (
                      <span className={`text-xs ${Math.abs(treatment.lift) < treatment.mde ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                        {Math.abs(treatment.lift) < treatment.mde ? "Underpowered" : "Powered"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasResults && (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-slate-500 text-sm font-medium">No data yet</p>
            <p className="text-slate-400 text-xs mt-1">Wire up the SDK and send events. Results appear after the worker runs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
