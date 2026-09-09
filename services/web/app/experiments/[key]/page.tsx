"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchExperiment, pauseExperiment } from "@/lib/api";

function fmtVal(v: number, type: string) {
  if (v == null) return "—";
  if (type === "binary") return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(v: number) {
  if (v == null) return "—";
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

  useEffect(() => {
    if (key) fetchExperiment(key as string).then(setData);
  }, [key]);

  if (!data) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto p-8">
      <a href="/" className="text-sm text-gray-500 hover:text-gray-800">← Back</a>
      <div className="flex items-center justify-between mt-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">{data.experiment_key}</h1>
          <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full ${
            data.status === "running" ? "bg-green-200 text-green-800" :
            data.status === "paused" ? "bg-yellow-200 text-yellow-800" :
            data.status === "completed" ? "bg-blue-200 text-blue-800" :
            "bg-gray-200 text-gray-700"
          }`}>
            {data.status}
          </span>
        </div>
        {data.status === "running" && (
          <button
            onClick={async () => {
              await pauseExperiment(data.experiment_key);
              fetchExperiment(data.experiment_key).then(setData);
            }}
            className="text-sm bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium"
          >
            Pause
          </button>
        )}
      </div>

      <div className="space-y-6">
        {data.metrics?.map((m: any) => (
          <div key={m.metric_id} className="bg-white border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold">{m.metric_name}</h2>
              {m.is_primary && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Primary</span>
              )}
              <span className="text-xs text-gray-400 uppercase">{m.metric_type}</span>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              {m.control && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Control</p>
                  <p className="text-2xl font-bold">{fmtVal(m.control.mean, m.metric_type)}</p>
                  <p className="text-sm text-gray-500">{m.control.sample_size?.toLocaleString()} users</p>
                </div>
              )}
              {m.treatments?.map((t: any) => (
                <div key={t.variant} className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">{t.variant}</p>
                  <p className="text-2xl font-bold">{fmtVal(t.mean, m.metric_type)}</p>
                  <p className="text-sm text-gray-500">{t.sample_size?.toLocaleString()} users</p>
                  {t.lift != null && (
                    <div className="mt-2">
                      <p className={`text-lg font-semibold ${t.lift > 0 ? "text-green-600" : t.lift < 0 ? "text-red-600" : "text-gray-600"}`}>
                        {t.lift > 0 ? "+" : ""}{fmtPct(t.lift)} lift
                      </p>
                      <p className="text-xs text-gray-500">[{fmtPct(t.lift_ci_lower)}, {fmtPct(t.lift_ci_upper)}]</p>
                      {t.p_value != null && (
                        <p className="text-xs text-gray-400 mt-1">p = {t.p_value.toFixed(3)}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {m.is_primary && m.treatments?.[0] && (
              <div className={`text-sm font-medium px-4 py-2.5 rounded-lg ${
                verdict(m.treatments[0]) === "favors_treatment" ? "bg-green-100 text-green-800" :
                verdict(m.treatments[0]) === "favors_control" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-700"
              }`}>
                {verdict(m.treatments[0]) === "favors_treatment" && "🟢 Evidence favors treatment"}
                {verdict(m.treatments[0]) === "favors_control" && "🔴 Evidence favors control"}
                {verdict(m.treatments[0]) === "inconclusive" && "🟡 Inconclusive"}
              </div>
            )}
          </div>
        ))}

        {(!data.metrics || data.metrics.length === 0) && (
          <p className="text-gray-500 text-sm">No metrics linked. Link a metric to see results.</p>
        )}
      </div>
    </div>
  );
}
