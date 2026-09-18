"use client";

import {
  Metric,
  Result,
  Session,
  archiveExperiment,
  deleteExperiment,
  fetchMetrics,
  linkMetric,
  request,
} from "@/lib/api";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  FlaskConical,
  Pause,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Integration } from "./integration";
import {
  Badge,
  ErrorNotice,
  Summary,
  ago,
  difference,
  message,
  number,
  value,
} from "./shared";
export function Detail({
  result: r,
  session,
  reload,
}: {
  result: Result;
  session: Session;
  reload: () => Promise<void>;
}) {
  const [tab, setTab] = useState("results"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [winner, setWinner] = useState(""),
    [metrics, setMetrics] = useState<Metric[]>([]),
    [metric, setMetric] = useState(""),
    [archivePrompt, setArchivePrompt] = useState(false),
    [deletePrompt, setDeletePrompt] = useState(false),
    [deleteKey, setDeleteKey] = useState("");
  useEffect(() => {
    fetchMetrics()
      .then(setMetrics)
      .catch((e) => setError(message(e)));
  }, []);
  const mutate = async (action: string) => {
    setBusy(true);
    setError("");
    try {
      await request(`/experiments/${r.experiment_key}/${action}`, {});
      await reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const variants = [
    r.metrics[0]?.control,
    ...(r.metrics[0]?.treatments ?? []),
  ].filter(Boolean);
  return (
    <>
      <Link className="back-link" href="/app">
        <ArrowLeft size={15} /> All experiments
      </Link>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">{r.experiment_key}</div>
          <h1>{r.summary.name}</h1>
          <div className="heading-meta">
            <Badge status={r.status} />
            <span>{r.summary.attribution_days}-day outcome window</span>
          </div>
        </div>
        <div className="actions">
          {r.status === "running" ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => mutate("pause")}
            >
              <Pause size={15} /> Pause experiment
            </button>
          ) : r.status === "draft" || r.status === "paused" ? (
            <button
              className="button"
              disabled={busy || !r.metrics.some((m) => m.is_primary)}
              onClick={() => mutate("start")}
            >
              <Play size={15} />
              {r.status === "draft" ? "Start experiment" : "Resume experiment"}
            </button>
          ) : null}
          <button
            className="button secondary danger-button"
            disabled={busy}
            onClick={() => setArchivePrompt(true)}
          >
            Archive experiment
          </button>
          <button
            className="button secondary danger-button"
            disabled={busy || r.status === "running"}
            onClick={() => {
              setDeleteKey("");
              setDeletePrompt(true);
            }}
          >
            Delete permanently
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {r.summary.hypothesis && (
        <div className="hypothesis">
          <span className="eyebrow">THE HYPOTHESIS</span>
          <p>{r.summary.hypothesis}</p>
        </div>
      )}
      <div className="summary-grid">
        <Summary
          label="Assigned users"
          count={number(r.summary.assignments)}
          icon={<FlaskConical size={18} />}
          note="Persisted experiment assignments"
        />
        <Summary
          label="Exposed users"
          count={number(r.summary.exposures)}
          icon={<Activity size={18} />}
          note="People who saw the experience"
        />
        <Summary
          label="Last computed"
          count={ago(r.summary.results_updated_at)}
          icon={<BarChart3 size={18} />}
          note="Results refresh every 30 seconds"
        />
      </div>
      <div className="detail-tabs tabs">
        {["results", "integration", "settings"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "results" ? (
        <>
          <section className="panel metric-panel">
            <div className="metric-heading">
              <div>
                <span className="eyebrow">INTEGRATION HEALTH</span>
                <h2>
                  {r.integrity.status === "needs_review"
                    ? "Investigate before interpreting"
                    : r.integrity.status === "collecting"
                      ? "Collecting diagnostic data"
                      : "No current integrity flags"}
                </h2>
              </div>
            </div>
            {r.integrity.issues.map((issue) => (
              <div className="notice error" key={issue}>
                {issue}
              </div>
            ))}
            <div className="metric-table">
              <div className="metric-row muted">
                <span>Variant</span>
                <span>Assigned</span>
                <span>Exposed</span>
                <span>Coverage</span>
              </div>
              {r.integrity.variants.map((v) => (
                <div className="metric-row" key={v.variant}>
                  <strong>{v.variant}</strong>
                  <span>{number(v.assigned)}</span>
                  <span>{number(v.exposed)}</span>
                  <span>
                    {v.coverage == null
                      ? "—"
                      : `${(v.coverage * 100).toFixed(1)}%`}
                  </span>
                </div>
              ))}
            </div>
            <div className="metric-footnote">
              Coverage compares exposed users with assigned users. Low coverage
              alone is not evidence of bias. No flags does not prove an
              experiment is valid.
            </div>
          </section>

          {r.srm_p_value != null && r.srm_p_value < 0.001 && (
            <div className="notice error">
              Assignment imbalance detected. Investigate the integration before
              interpreting these results.
            </div>
          )}
          {!r.metrics.length ? (
            <section className="panel empty">
              <h2>Choose what success looks like.</h2>
              <p>Link a primary metric in settings before starting.</p>
              <button
                className="button secondary"
                onClick={() => setTab("settings")}
              >
                Choose metric
              </button>
            </section>
          ) : (
            r.metrics.map((m) => (
              <section className="panel metric-panel" key={m.metric_id}>
                <div className="metric-heading">
                  <div>
                    <span className="eyebrow">
                      {m.is_primary ? "PRIMARY METRIC" : "SECONDARY METRIC"}
                    </span>
                    <h2>{m.metric_name}</h2>
                  </div>
                  <span className="metric-type">
                    {m.metric_type === "binary"
                      ? "Conversion rate"
                      : m.metric_type === "count"
                        ? "Events per user"
                        : "Value per user"}
                  </span>
                </div>
                <div className="metric-table">
                  <div className="metric-row muted">
                    <span>Variant</span>
                    <span>Exposed users</span>
                    <span>Mean</span>
                    <span>Absolute change</span>
                  </div>
                  {[m.control, ...(m.treatments ?? [])]
                    .filter(Boolean)
                    .map((v, i) => (
                      <div className="metric-row" key={v!.variant}>
                        <strong>
                          <i
                            className={`variant-dot ${i ? "treatment" : "control"}`}
                          />
                          {v!.variant}
                        </strong>
                        <span>{number(v!.sample_size)}</span>
                        <span>
                          {value(v!.mean, m.metric_type === "binary")}
                        </span>
                        <span>
                          {i
                            ? difference(v!.lift, m.metric_type === "binary")
                            : "Baseline"}
                        </span>
                      </div>
                    ))}
                </div>
                {r.integrity.status === "needs_review" ? (
                  <div className="notice error">
                    Effect intervals are withheld while integrity issues need
                    review. The table shows descriptive observations only.
                  </div>
                ) : (
                  m.treatments?.map((t) => (
                    <Interval
                      key={t.variant}
                      estimate={t}
                      binary={m.metric_type === "binary"}
                    />
                  ))
                )}
                <div className="metric-footnote">
                  Fixed-horizon estimates. Repeated checking and multiple
                  comparisons can increase false positives. An interval alone
                  does not select a winner.
                </div>
              </section>
            ))
          )}
        </>
      ) : tab === "integration" ? (
        <Integration experimentKey={r.experiment_key} session={session} />
      ) : (
        <section className="panel settings-panel">
          <h2>Experiment settings</h2>
          <p>
            Variant allocations and linked metrics freeze when the experiment
            first starts.
          </p>
          {r.status === "draft" ? (
            <>
              <label>
                Primary metric
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                >
                  <option value="">Choose a metric</option>
                  {metrics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button secondary"
                disabled={!metric || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await linkMetric(r.experiment_key, +metric, true);
                    await reload();
                  } catch (e) {
                    setError(message(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save primary metric
              </button>
            </>
          ) : r.status === "completed" ? (
            <div className="notice">
              Rolled out <strong>{r.summary.winner}</strong>. Historical
              assignments are preserved. Outcomes stop at completion; late
              events are accepted into results for 24 hours.
            </div>
          ) : (
            <>
              <h3>Complete & roll out</h3>
              <p>
                New feature decisions will use your selected variant. This ends
                exposure collection and preserves experiment history.
              </p>
              <label>
                Rollout variant
                <select
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value="">Choose a variant</option>
                  {variants.map((v) => (
                    <option key={v!.variant}>{v!.variant}</option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                disabled={!winner || busy}
                onClick={() =>
                  mutate(`rollout?variant_key=${encodeURIComponent(winner)}`)
                }
              >
                Complete & roll out
              </button>
            </>
          )}
        </section>
      )}
      {archivePrompt && (
        <dialog open className="dialog confirm-dialog">
          <div className="dialog-heading">
            <span className="eyebrow">ARCHIVE EXPERIMENT</span>
            <button
              aria-label="Cancel archive"
              onClick={() => setArchivePrompt(false)}
            >
              ×
            </button>
          </div>
          <h2>Archive “{r.summary.name}”?</h2>
          <p>
            It will leave the active experiment list and stop new assignments.
            Existing assignments, exposures, events, and results remain stored
            for reference.
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setArchivePrompt(false)}
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await archiveExperiment(r.experiment_key);
                  window.location.assign("/app");
                } catch (e) {
                  setError(message(e));
                  setBusy(false);
                  setArchivePrompt(false);
                }
              }}
            >
              Confirm archive
            </button>
          </div>
        </dialog>
      )}
      {deletePrompt && (
        <dialog open className="dialog confirm-dialog">
          <div className="dialog-heading">
            <span className="eyebrow">PERMANENT DELETE</span>
            <button
              aria-label="Cancel delete"
              onClick={() => setDeletePrompt(false)}
            >
              ×
            </button>
          </div>
          <h2>Delete “{r.summary.name}” and its results?</h2>
          <p>
            This permanently removes assignments, exposures, variants, linked
            metrics, and calculated results. Project event records remain in the
            event stream. A running experiment must be paused or archived first.
            Type <code>{r.experiment_key}</code> to confirm.
          </p>
          <label>
            Experiment key
            <input
              value={deleteKey}
              onChange={(e) => setDeleteKey(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setDeletePrompt(false)}
            >
              Cancel
            </button>
            <button
              className="button danger-button"
              disabled={busy || deleteKey !== r.experiment_key}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await deleteExperiment(r.experiment_key);
                  window.location.assign("/app");
                } catch (e) {
                  setError(message(e));
                  setBusy(false);
                  setDeletePrompt(false);
                }
              }}
            >
              Delete permanently
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
export function Interval({
  estimate: t,
  binary,
}: {
  estimate: Result["metrics"][number]["control"] & {};
  binary: boolean;
}) {
  if (t.lift_ci_lower == null || t.lift_ci_upper == null)
    return (
      <div className="notice">
        Collecting evidence for {t.variant}. At least 30 exposed users per
        variant and sufficient variation are needed to estimate uncertainty.
      </div>
    );
  const min = Math.min(t.lift_ci_lower, 0),
    max = Math.max(t.lift_ci_upper, 0),
    range = max - min || 1;
  const pos = (v: number) => 8 + (84 * (v - min)) / range;
  return (
    <div className="interval">
      <div>
        <strong>{t.variant}: estimated absolute change</strong>
        <span>
          {difference(t.lift_ci_lower, binary)} to{" "}
          {difference(t.lift_ci_upper, binary)}
        </span>
      </div>
      <svg
        viewBox="0 0 100 12"
        role="img"
        aria-label={`95 percent confidence interval from ${t.lift_ci_lower} to ${t.lift_ci_upper}; zero represents no difference`}
      >
        <line x1="8" x2="92" y1="6" y2="6" stroke="#e8e7e1" strokeWidth=".4" />
        <line
          x1={pos(0)}
          x2={pos(0)}
          y1="1"
          y2="11"
          stroke="#a4a69b"
          strokeWidth=".3"
          strokeDasharray="1 1"
        />
        <line
          x1={pos(t.lift_ci_lower)}
          x2={pos(t.lift_ci_upper)}
          y1="6"
          y2="6"
          stroke="#537b58"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle
          cx={pos(t.lift ?? 0)}
          cy="6"
          r="1.7"
          fill="#264e36"
          stroke="white"
          strokeWidth=".5"
        />
      </svg>
      <small>
        95% interval · Dashed line: no difference ·{" "}
        {t.p_value == null
          ? "Bootstrap estimate"
          : `Exact-test p = ${t.p_value.toPrecision(3)}`}
      </small>
    </div>
  );
}
