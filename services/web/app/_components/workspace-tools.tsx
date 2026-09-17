"use client";

import {
  CrashReport,
  Diagnostics,
  Session,
  queryCrashReports,
} from "@/lib/api";
import { Activity, AlertTriangle, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { CopyButton, ErrorNotice, ago, message, number } from "./shared";
export function Settings({ session }: { session: Session }) {
  return (
    <>
      <div className="section-heading">
        <span className="eyebrow">MAKE YOURSELF AT HOME</span>
        <h1>Workspace settings</h1>
        <p>Your project identity and integration credentials.</p>
      </div>
      <section className="panel settings-panel">
        <h2>{session.project_name}</h2>
        <label>
          Signed in as
          <input readOnly value={session.email} />
        </label>
        <label>
          Publishable integration key
          <input readOnly value={session.publishable_key} />
        </label>
        <CopyButton text={session.publishable_key} />
        <p>
          This key permits assignment and event ingestion only. Keep your
          dashboard session private.
        </p>
      </section>
    </>
  );
}
export function EventStream({
  diagnostics: d,
  refresh,
}: {
  diagnostics: Diagnostics | null;
  refresh: () => void;
}) {
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [allocationID, setAllocationID] = useState("");
  const [allocationKind, setAllocationKind] = useState("anonymous");
  const [crashError, setCrashError] = useState("");
  const [loadingCrashes, setLoadingCrashes] = useState(false);
  const loadCrashes = async (filter = "") => {
    setLoadingCrashes(true);
    setCrashError("");
    try {
      setCrashes(
        await queryCrashReports({
          allocation_id: filter || undefined,
          allocation_kind: filter ? allocationKind : undefined,
          limit: 50,
        }),
      );
    } catch (e) {
      setCrashError(message(e));
    } finally {
      setLoadingCrashes(false);
    }
  };
  useEffect(() => {
    void loadCrashes();
  }, []);
  return (
    <>
      <div className="section-heading">
        <span className="eyebrow">A WINDOW INTO YOUR PRODUCT</span>
        <h1>Event stream</h1>
        <p>Check that the right events are arriving with the right user IDs.</p>
      </div>
      <section className="panel crash-panel">
        <div className="panel-toolbar crash-toolbar">
          <div>
            <strong>
              <AlertTriangle size={15} /> Exceptions and crashes
            </strong>
            <p>
              Global reports and gate linked exceptions, with installation IDs
              kept private.
            </p>
          </div>
          <form
            className="crash-search"
            onSubmit={(e) => {
              e.preventDefault();
              void loadCrashes(allocationID.trim());
            }}
          >
            <select
              aria-label="Allocation kind"
              value={allocationKind}
              onChange={(e) => setAllocationKind(e.target.value)}
            >
              {[
                "anonymous",
                "installation",
                "user",
                "device",
                "account",
                "organization",
                "host",
              ].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
            <input
              aria-label="Filter by allocation ID"
              value={allocationID}
              onChange={(e) => setAllocationID(e.target.value)}
              placeholder="Filter by installation ID"
            />
            <button
              className="button secondary small"
              disabled={loadingCrashes}
            >
              <Search size={14} /> Search
            </button>
          </form>
        </div>
        <ErrorNotice error={crashError} />
        {crashes.length ? (
          <div className="crash-list">
            {crashes.map((crash) => (
              <article key={`${crash.event_id}-${crash.last_seen_at}`}>
                <div className="crash-summary">
                  <span className={`crash-severity ${crash.severity}`}>
                    {crash.severity}
                  </span>
                  <div>
                    <strong>
                      {crash.exception_type || crash.name}:{" "}
                      {crash.exception_message || crash.name}
                    </strong>
                    <small>
                      {crash.gate_key
                        ? `Gate ${crash.gate_key} · `
                        : "Global · "}
                      {crash.allocation_kind} · installation{" "}
                      {crash.allocation_id_hash.slice(0, 10)}…
                    </small>
                  </div>
                  <div>
                    <strong>
                      {number(crash.occurrence_count)} occurrence
                      {crash.occurrence_count === 1 ? "" : "s"}
                    </strong>
                    <small>Last seen {ago(crash.last_seen_at)}</small>
                  </div>
                </div>
                {crash.exception_stack && (
                  <details>
                    <summary>Show stack trace</summary>
                    <pre>{crash.exception_stack}</pre>
                  </details>
                )}
              </article>
            ))}
          </div>
        ) : (
          !loadingCrashes && (
            <div className="empty compact-empty">
              <h2>No exception reports found.</h2>
              <p>
                Reports from the SDK will appear here. You can filter by an
                allocation ID when investigating a support case.
              </p>
            </div>
          )
        )}
      </section>
      <section className="panel">
        <div className="panel-toolbar">
          <strong>
            <span className="live-dot" /> Recent events
          </strong>
          <button className="button secondary small" onClick={refresh}>
            Refresh
          </button>
        </div>
        {d?.events.length ? (
          <div className="events-table">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>User</th>
                  <th>Value</th>
                  <th>Event timestamp</th>
                </tr>
              </thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.event_id}>
                    <td>
                      <strong>{e.event_name}</strong>
                      <small>{e.event_id}</small>
                    </td>
                    <td>{e.user_id}</td>
                    <td>{number(e.value)}</td>
                    <td>{new Date(e.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <Activity size={30} />
            <h2>Listening for your first event.</h2>
            <p>
              Connect the SDK and trigger an action in your product. The latest
              30 events appear here.
            </p>
          </div>
        )}
      </section>
      <div className="notice">
        Worker last completed a cycle: {ago(d?.worker_updated_at)}. This page
        refreshes every 30 seconds.
      </div>
    </>
  );
}
