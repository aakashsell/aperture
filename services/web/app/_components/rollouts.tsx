"use client";

import {
  GateDetail,
  GateSummary,
  Channel,
  Session,
  archiveGate,
  deleteGate,
  createGate,
  disableGate,
  explainAllocation,
  fetchChannels,
  inspectGateOverride,
  removeGateOverride,
  setGateOverride,
  updateGateRollout,
} from "@/lib/api";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Power,
  Rocket,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorNotice, ago, message, number } from "./shared";

export function RolloutsView({
  gates,
  create,
}: {
  gates: GateSummary[];
  create: () => void;
}) {
  const running = gates.filter((g) => g.status === "running").length;
  return (
    <>
      <div className="page-heading rollout-heading">
        <div>
          <div className="eyebrow">SHIP SAFELY. LEARN IN PRODUCTION.</div>
          <h1>
            Start small.
            <br />
            <span>Expand with confidence.</span>
          </h1>
          <p>
            Release a real change to a few installations, watch its health, then
            expand it.
          </p>
        </div>
        <button className="button" onClick={create}>
          <Plus size={17} /> New rollout
        </button>
      </div>
      <div className="summary-grid">
        <SummaryCard
          label="Running rollouts"
          value={running}
          icon={<Rocket size={18} />}
        />
        <SummaryCard
          label="Installations observed"
          value={gates.reduce((n, g) => n + Number(g.exposures), 0)}
          icon={<Activity size={18} />}
        />
        <SummaryCard
          label="Health flags · 24h"
          value={gates.reduce((n, g) => n + Number(g.errors_24h), 0)}
          icon={<ShieldCheck size={18} />}
        />
      </div>
      <section className="panel rollouts-panel">
        <div className="panel-toolbar">
          <div>
            <strong>Your rollouts</strong>
            <p>Current release controls and observed traffic.</p>
          </div>
        </div>
        {gates.length ? (
          <div className="rollout-list">
            {gates.map((gate) => (
              <Link
                href={`/app/rollouts/${gate.key}`}
                className="rollout-row"
                key={gate.id}
              >
                <span className={`rollout-icon ${gate.status}`}>
                  <Rocket size={18} />
                </span>
                <div>
                  <strong>{gate.name}</strong>
                  <small>{gate.key}</small>
                </div>
                <div className="rollout-percent">
                  <strong>
                    {gate.status === "running"
                      ? `${gate.rollout_basis_points / 100}%`
                      : "Off"}
                  </strong>
                  <small>enabled</small>
                </div>
                <div>
                  <strong>{number(gate.exposures)}</strong>
                  <small>observed</small>
                </div>
                <span className={`status-pill ${gate.status}`}>
                  {gate.status === "running" ? "Running" : "Off"}
                </span>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty rollout-empty">
            <span className="empty-icon">
              <Rocket size={30} />
            </span>
            <h2>Protect your next release.</h2>
            <p>
              Start with 5% of installations and keep the rest on the current
              behavior.
            </p>
            <button className="button secondary" onClick={create}>
              Create your first rollout <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <section className="summary-card">
      <div>
        {label}
        <span>{icon}</span>
      </div>
      <strong>{number(value)}</strong>
      <small>Across current rollout versions</small>
    </section>
  );
}

export function CreateRolloutDialog({
  close,
  saved,
}: {
  close: () => void;
  saved: (key: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
    rollout_percentage: 5,
    allocation_kind: "anonymous",
    channel_key: "",
  });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    document.querySelector<HTMLDialogElement>("#create-rollout")?.showModal();
    void fetchChannels()
      .then(setChannels)
      .catch((e) => setError(message(e)));
  }, []);
  return (
    <dialog
      id="create-rollout"
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="dialog-heading">
        <span className="eyebrow">NEW ROLLOUT</span>
        <button aria-label="Close" onClick={close}>
          <X size={19} />
        </button>
      </div>
      <h2>Release the change gradually.</h2>
      <p>
        Create it off, add the SDK integration, then start it when you are
        ready.
      </p>
      <ErrorNotice error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const gate = await createGate(form);
            saved(gate.key);
          } catch (e) {
            setError(message(e));
            setBusy(false);
          }
        }}
      >
        <label>
          Rollout name
          <input
            autoFocus
            required
            value={form.name}
            placeholder="Safer sync engine"
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
                key: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, ""),
              })
            }
          />
        </label>
        <label>
          Rollout key
          <input
            required
            pattern="[a-zA-Z0-9_-]{1,100}"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
        </label>
        <label>
          What is changing?
          <textarea
            rows={3}
            value={form.description}
            placeholder="Use the new sync path while keeping the current path as a fallback."
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {channels.length > 0 && (
          <label>
            Release channel
            <select
              value={form.channel_key}
              onChange={(e) => {
                const channel = channels.find(
                  (item) => item.key === e.target.value,
                );
                setForm({
                  ...form,
                  channel_key: e.target.value,
                  allocation_kind: channel?.allocation_kind ?? "anonymous",
                });
              }}
            >
              <option value="">All allocations</option>
              {channels.map((channel) => (
                <option key={channel.key} value={channel.key}>
                  {channel.name} · {channel.allocation_kind}
                </option>
              ))}
            </select>
            <small>
              The channel chooses who is eligible. This rollout chooses what
              share of them gets the enabled decision. A channel alone does
              not turn the feature on.
            </small>
          </label>
        )}
        <label>
          {form.channel_key ? "Share of eligible channel" : "Share of installations"}
          <strong>
            {form.rollout_percentage}% of {channels.find((channel) => channel.key === form.channel_key)?.name ?? "installations"}
          </strong>
          <input
            type="range"
            min="1"
            max="100"
            value={form.rollout_percentage}
            onChange={(e) =>
              setForm({ ...form, rollout_percentage: Number(e.target.value) })
            }
          />
        </label>
        <input type="hidden" value={form.allocation_kind} readOnly />
        <div className="notice">
          {form.channel_key ? (
            `This rollout uses ${form.allocation_kind} IDs. To enable the feature for every beta tester in the channel, set this to 100% and start the rollout.`
          ) : (
            <>
              Aperture creates a persistent anonymous installation ID in{" "}
              <code>chrome.storage.local</code>. No account system is required.
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy && <Loader2 className="spin" size={16} />} Create rollout
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function RolloutDetailView({
  gate,
  session,
  reload,
}: {
  gate: GateDetail;
  session: Session;
  reload: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState<number | "off" | "archive" | null>(
    null,
  );
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [deleteKey, setDeleteKey] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const enabledRate = gate.enabled_exposures
    ? gate.enabled_errors / gate.enabled_exposures
    : 0;
  const disabledRate = gate.disabled_exposures
    ? gate.disabled_errors / gate.disabled_exposures
    : 0;
  const exposureCoverage = gate.evaluations
    ? Math.min(100, (gate.exposures / gate.evaluations) * 100)
    : 0;
  const runChange = async () => {
    if (pending === null) return;
    setBusy(true);
    setError("");
    try {
      if (pending === "archive") {
        await archiveGate(gate.key, gate.config_version);
        window.location.assign("/app");
      } else if (pending === "off")
        await disableGate(gate.key, gate.config_version);
      else await updateGateRollout(gate.key, pending, gate.config_version);
      setPending(null);
      await reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const snippet = `const enabled = await aperture.gate("${gate.key}");\nawait aperture.exposeGate("${gate.key}", enabled);\n\ntry {\n  enabled ? runNewSync() : runCurrentSync();\n} catch (error) {\n  await aperture.reportGateHealth("${gate.key}", {\n    eventId: crypto.randomUUID(),\n    name: "sync-failed",\n    severity: "error"\n  });\n  throw error;\n}`;
  return (
    <>
      <div className="rollout-detail-heading">
        <div>
          <Link href="/app">← All rollouts</Link>
          <span className="eyebrow">
            ROLLOUT
            {gate.channel_key
              ? ` · CHANNEL ${gate.channel_key.toUpperCase()}`
              : ""}
          </span>
          <h1>{gate.name}</h1>
          <p>{gate.description || `Controlled by ${gate.key}.`}</p>
        </div>
        <span className={`status-pill ${gate.status}`}>
          {gate.status === "running"
            ? `${gate.rollout_percentage}% live`
            : gate.status === "archived"
              ? "Archived"
              : "Off"}
        </span>
      </div>
      <ErrorNotice error={error} />
      <section className={`health-banner ${gate.health_status}`}>
        {gate.health_status === "needs_review" ? (
          <AlertTriangle size={24} />
        ) : gate.health_status === "no_flags" ? (
          <CheckCircle2 size={24} />
        ) : (
          <Activity size={24} />
        )}
        <div>
          <strong>
            {gate.health_status === "needs_review"
              ? "Needs review before expanding"
              : gate.health_status === "no_flags"
                ? "No health flags observed"
                : "Collecting health evidence"}
          </strong>
          <p>
            {gate.health_status === "collecting"
              ? "Aperture needs at least 30 observed installations in both enabled and current groups."
              : gate.health_status === "no_flags"
                ? "Failure rates do not currently show a material regression. Review the evidence before expanding."
                : "The enabled group is reporting a higher failure rate. Keep this rollout limited or turn it off."}
          </p>
        </div>
      </section>
      <div className="rollout-detail-grid">
        <section className="panel rollout-control">
          <span className="eyebrow">RELEASE CONTROL</span>
          <h2>
            {gate.status === "running"
              ? `${gate.rollout_percentage}% of ${gate.channel_key ? `${gate.channel_key} eligible allocations` : "installations"} enabled`
              : gate.status === "archived"
                ? "This rollout is archived"
                : "The new behavior is off"}
          </h2>
          <div className="rollout-meter">
            <i
              style={{
                width: `${gate.status === "running" ? gate.rollout_percentage : 0}%`,
              }}
            />
          </div>
          <div className="rollout-presets">
            {[5, 25, 50, 100].map((value) => (
              <button
                key={value}
                className={
                  gate.status === "running" && gate.rollout_percentage === value
                    ? "active"
                    : ""
                }
                onClick={() => setPending(value)}
                disabled={gate.status === "archived"}
              >
                {value}%
              </button>
            ))}
          </div>
          <button
            className="button secondary danger-button"
            onClick={() => setPending("off")}
            disabled={gate.status !== "running"}
          >
            <Power size={16} /> Turn off rollout
          </button>
          <button
            className="button secondary"
            disabled={gate.status === "archived"}
            onClick={() => setPending("archive")}
          >
            Archive rollout
          </button>
          <button
            className="button secondary danger-button"
            disabled={busy || gate.status === "running"}
            onClick={() => {
              setDeleteKey("");
              setDeletePrompt(true);
            }}
          >
            Delete permanently
          </button>
          <small>
            Changing the percentage creates a new configuration version.
            Existing installations keep stable allocation as the audience
            expands.
          </small>
        </section>
        <section className="panel health-evidence">
          <span className="eyebrow">
            CURRENT VERSION · {gate.config_version}
          </span>
          <h2>Observed health</h2>
          <div className="coverage-line">
            <span>{number(gate.evaluations)} decisions evaluated</span>
            <strong>{exposureCoverage.toFixed(1)}% exposure coverage</strong>
          </div>
          <div className="evidence-columns">
            <div>
              <span>ENABLED</span>
              <strong>{number(gate.enabled_exposures)}</strong>
              <small>installations observed</small>
              <b>{(enabledRate * 100).toFixed(1)}% failure rate</b>
            </div>
            <div>
              <span>CURRENT</span>
              <strong>{number(gate.disabled_exposures)}</strong>
              <small>installations observed</small>
              <b>{(disabledRate * 100).toFixed(1)}% failure rate</b>
            </div>
          </div>
          <p>
            Health is based on explicit exposures and unique installations
            reporting error or fatal signals for this configuration.
          </p>
        </section>
      </div>
      <AllocationOverridePanel gate={gate} reload={reload} />
      <section className="panel rollout-history">
        <div>
          <span className="eyebrow">AUDIT TRAIL</span>
          <h2>Release history</h2>
        </div>
        <div>
          {gate.changes.map((change) => (
            <article key={change.config_version}>
              <i />
              <div>
                <strong>
                  {change.status === "running"
                    ? `Released to ${change.rollout_basis_points / 100}%`
                    : change.status === "off"
                      ? "Turned off"
                      : "Archived"}
                </strong>
                <small>
                  Version {change.config_version} · {ago(change.changed_at)}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel rollout-integration">
        <div>
          <span className="eyebrow">CHROME EXTENSION INTEGRATION</span>
          <h2>One gate around the real change.</h2>
          <p>
            Add <code>storage</code> permission and your Aperture API origin to{" "}
            <code>host_permissions</code>. The SDK persists an anonymous
            installation ID and never sends it to the dashboard.
          </p>
        </div>
        <div className="code-block">
          <button
            aria-label="Copy integration"
            onClick={() => navigator.clipboard.writeText(snippet)}
          >
            <Copy size={15} />
          </button>
          <pre>{snippet}</pre>
        </div>
        <small>Publishable key: {session.publishable_key}</small>
      </section>
      {pending !== null && (
        <dialog open className="dialog confirm-dialog">
          <div className="dialog-heading">
            <span className="eyebrow">CONFIRM RELEASE CHANGE</span>
            <button
              aria-label="Close confirmation"
              onClick={() => setPending(null)}
            >
              <X size={18} />
            </button>
          </div>
          <h2>
            {pending === "archive"
              ? "Archive this rollout?"
              : pending === "off"
                ? "Turn the new behavior off?"
                : `Release to ${pending}% of installations?`}
          </h2>
          <p>
            {pending === "archive"
              ? "This stops new evaluations, removes the rollout from the active list, and preserves its history and telemetry."
              : pending === 100
                ? "Every evaluated installation will receive the new behavior. Confirm that you reviewed the health evidence above."
                : pending === "off"
                  ? "New evaluations will use the current behavior."
                  : "The audience will expand deterministically; installations already enabled stay enabled."}
          </p>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button className="button" onClick={runChange} disabled={busy}>
              {busy && <Loader2 className="spin" size={16} />} Confirm change
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
              <X size={18} />
            </button>
          </div>
          <h2>Delete this rollout and its records?</h2>
          <p>
            This permanently removes its decisions, exposures, health signals,
            overrides, and audit trail. A running rollout must be turned off or
            archived first. Type <code>{gate.key}</code> to confirm.
          </p>
          <label>
            Rollout key
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
              disabled={busy || deleteKey !== gate.key}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await deleteGate(gate.key);
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

function AllocationOverridePanel({
  gate,
  reload,
}: {
  gate: GateDetail;
  reload: () => Promise<void> | void;
}) {
  const [allocationID, setAllocationID] = useState("");
  const [override, setOverride] = useState<boolean | null>(null);
  const [inspected, setInspected] = useState(false);
  const [decision, setDecision] = useState<{
    enabled: boolean;
    reason: string;
  } | null>(null);
  const [history, setHistory] = useState<
    { action: string; config_version: number; changed_at: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allocation = { id: allocationID.trim(), kind: gate.allocation_kind };
  const inspect = async () => {
    setError("");
    setInspected(false);
    setDecision(null);
    setBusy(true);
    try {
      const result = await inspectGateOverride(gate.key, allocation);
      setOverride(result.override);
      setHistory(result.history);
      setInspected(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const explain = async () => {
    setError("");
    setBusy(true);
    setDecision(null);
    try {
      const result = await explainAllocation(allocation, [gate.key]);
      const item = result.decisions[0];
      setDecision({ enabled: item.enabled, reason: item.reason });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const change = async (enabled: boolean | null) => {
    setError("");
    setBusy(true);
    try {
      if (enabled === null)
        await removeGateOverride(gate.key, allocation, gate.config_version);
      else
        await setGateOverride(
          gate.key,
          allocation,
          enabled,
          gate.config_version,
        );
      setOverride(enabled);
      setInspected(true);
      await reload();
      const latest = await inspectGateOverride(gate.key, allocation);
      setHistory(latest.history);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel allocation-override">
      <div>
        <span className="eyebrow">SUPPORT TOOL</span>
        <h2>Override one installation</h2>
        <p>
          Force this allocation on or off while debugging a support issue.
          Changes are audited and apply on its next evaluation.
        </p>
      </div>
      <div className="override-controls">
        <label htmlFor="allocation-override-id">
          {gate.allocation_kind} ID
        </label>
        <input
          id="allocation-override-id"
          value={allocationID}
          onChange={(e) => {
            setAllocationID(e.target.value);
            setInspected(false);
            setOverride(null);
            setHistory([]);
            setDecision(null);
          }}
          placeholder="Paste the ID shared by the user"
          autoComplete="off"
        />
        <button
          className="button secondary"
          disabled={busy || !allocation.id}
          onClick={inspect}
        >
          {busy ? "Checking…" : "Check override"}
        </button>
        <button
          className="button secondary"
          disabled={busy || !allocation.id}
          onClick={explain}
        >
          What would this ID get?
        </button>
      </div>
      {inspected && (
        <p className="override-state">
          {override === null
            ? "No support override is set."
            : `This installation is forced ${override ? "on" : "off"}.`}
        </p>
      )}
      {history.length > 0 && (
        <div className="override-history">
          <strong>Override audit</strong>
          {history.map((item, index) => (
            <small key={`${item.config_version}-${index}`}>
              {item.action.replaceAll("_", " ")} · version {item.config_version}{" "}
              · {ago(item.changed_at)}
            </small>
          ))}
        </div>
      )}
      {decision && (
        <p className="override-state">
          Would receive{" "}
          <strong>{decision.enabled ? "enabled" : "current"}</strong> ·{" "}
          {decision.reason.replaceAll("_", " ")}
        </p>
      )}
      {error && <ErrorNotice error={error} />}
      <div className="override-actions">
        <button
          className="button secondary"
          disabled={busy || !allocation.id || gate.status !== "running"}
          onClick={() => change(true)}
        >
          Force on
        </button>
        <button
          className="button secondary"
          disabled={busy || !allocation.id || gate.status !== "running"}
          onClick={() => change(false)}
        >
          Force off
        </button>
        <button
          className="button secondary"
          disabled={
            busy ||
            !allocation.id ||
            override === null ||
            gate.status !== "running"
          }
          onClick={() => change(null)}
        >
          Remove override
        </button>
      </div>
      <small>
        Only the keyed hash is stored. Overrides require a running rollout and
        take effect on the next server evaluation; decisions may remain cached
        for up to 30 seconds.
      </small>
    </section>
  );
}
