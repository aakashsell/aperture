"use client";

import {
  Channel,
  CrashReport,
  Diagnostics,
  Session,
  createWorkspace,
  createChannel,
  fetchChannels,
  queryCrashReports,
  replaceChannelMembers,
  updateChannelFill,
} from "@/lib/api";
import { Activity, AlertTriangle, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { CopyButton, ErrorNotice, ago, message, number } from "./shared";
export function Settings({
  session,
  onWorkspaceCreated,
}: {
  session: Session;
  onWorkspaceCreated: (id: number) => Promise<void>;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelName, setChannelName] = useState("");
  const [channelKey, setChannelKey] = useState("");
  const [allocationKind, setAllocationKind] = useState("anonymous");
  const [fillPercentage, setFillPercentage] = useState(0);
  const [allocationIDs, setAllocationIDs] = useState("");
  const [memberEdits, setMemberEdits] = useState<Record<string, string>>({});
  const [channelError, setChannelError] = useState("");
  const [channelBusy, setChannelBusy] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const reloadChannels = async () => setChannels(await fetchChannels());
  useEffect(() => {
    void reloadChannels().catch((e) => setChannelError(message(e)));
  }, []);
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
        <form
          className="workspace-create-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setWorkspaceBusy(true);
            setWorkspaceError("");
            try {
              const created = await createWorkspace(workspaceName);
              setWorkspaceName("");
              await onWorkspaceCreated(created.id);
            } catch (e) {
              setWorkspaceError(message(e));
            } finally {
              setWorkspaceBusy(false);
            }
          }}
        >
          <label>
            Create another workspace
            <input
              maxLength={80}
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Mobile app"
            />
          </label>
          <button className="button secondary" disabled={workspaceBusy}>
            {workspaceBusy ? "Creating…" : "Create workspace"}
          </button>
          <ErrorNotice error={workspaceError} />
        </form>
        <p>
          This key permits assignment and event ingestion only. Keep your
          dashboard session private.
        </p>
      </section>
      <section className="panel channels-panel">
        <span className="eyebrow">ROLLOUT AUDIENCES</span>
        <h2>Channels</h2>
        <p>
          Use channels for dev, beta, canary, or production audiences.
          Allowlisted IDs are stored only as keyed hashes; random fill is a
          deterministic share of other IDs. A channel only selects who is
          eligible; create and start a rollout to enable the feature.
        </p>
        <a
          className="text-button"
          href="https://aperture.bazement.net/docs/#beta-group"
          target="_blank"
          rel="noreferrer"
        >
          How beta groups work <Activity size={14} />
        </a>
        <ErrorNotice error={channelError} />
        <form
          className="channel-create"
          onSubmit={async (event) => {
            event.preventDefault();
            setChannelBusy(true);
            setChannelError("");
            try {
              await createChannel({
                key: channelKey,
                name: channelName,
                allocation_kind: allocationKind,
                fill_percentage: fillPercentage,
                allocation_ids: allocationIDs
                  .split("\n")
                  .map((id) => id.trim())
                  .filter(Boolean),
              });
              setChannelName("");
              setChannelKey("");
              setAllocationIDs("");
              await reloadChannels();
            } catch (e) {
              setChannelError(message(e));
            } finally {
              setChannelBusy(false);
            }
          }}
        >
          <label>
            Channel name
            <input
              required
              value={channelName}
              onChange={(e) => {
                setChannelName(e.target.value);
                setChannelKey(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
              }}
              placeholder="Beta testers"
            />
          </label>
          <label>
            Key
            <input
              required
              pattern="[a-zA-Z0-9_-]{1,100}"
              value={channelKey}
              onChange={(e) => setChannelKey(e.target.value)}
              placeholder="beta"
            />
          </label>
          <label>
            Allocation type
            <select
              value={allocationKind}
              onChange={(e) => setAllocationKind(e.target.value)}
            >
              {[
                "installation",
                "anonymous",
                "user",
                "device",
                "account",
                "organization",
                "host",
              ].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            Random fill %
            <input
              type="number"
              min="0"
              max="100"
              value={fillPercentage}
              onChange={(e) => setFillPercentage(Number(e.target.value))}
            />
          </label>
          <label className="channel-members-input">
            Allowlisted IDs, one per line
            <textarea
              rows={3}
              value={allocationIDs}
              onChange={(e) => setAllocationIDs(e.target.value)}
              placeholder="Paste installation IDs to include explicitly"
            />
          </label>
          <button className="button" disabled={channelBusy}>
            {channelBusy ? "Saving…" : "Create channel"}
          </button>
        </form>
        <div className="channel-list">
          {channels.map((channel) => (
            <article key={channel.key}>
              <div>
                <strong>{channel.name}</strong>
                <small>
                  {channel.key} · {channel.allocation_kind} · {channel.members}{" "}
                  allowlisted · {channel.fill_basis_points / 100}% random fill
                </small>
              </div>
              <label>
                New random fill %
                <input
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={channel.fill_basis_points / 100}
                  id={`fill-${channel.key}`}
                />
              </label>
              <button
                className="button secondary small"
                disabled={channelBusy}
                onClick={async () => {
                  const input = document.getElementById(
                    `fill-${channel.key}`,
                  ) as HTMLInputElement | null;
                  if (!input) return;
                  const nextFill = Number(input.value);
                  if (
                    nextFill >= 100 &&
                    channel.fill_basis_points < 10000 &&
                    !window.confirm(
                      `Set ${channel.name} to 100% random fill? Every matching allocation becomes eligible for every rollout attached to this channel.`,
                    )
                  ) {
                    return;
                  }
                  setChannelBusy(true);
                  setChannelError("");
                  try {
                    await updateChannelFill(
                      channel.key,
                      nextFill,
                      channel.config_version,
                    );
                    await reloadChannels();
                  } catch (e) {
                    setChannelError(message(e));
                  } finally {
                    setChannelBusy(false);
                  }
                }}
              >
                Save fill
              </button>
              <label className="channel-members-input">
                Replace allowlist
                <textarea
                  rows={2}
                  value={memberEdits[channel.key] ?? ""}
                  onChange={(e) =>
                    setMemberEdits({
                      ...memberEdits,
                      [channel.key]: e.target.value,
                    })
                  }
                  placeholder="Enter the complete new allowlist, one ID per line"
                />
              </label>
              <button
                className="button secondary small"
                disabled={channelBusy}
                onClick={async () => {
                  setChannelBusy(true);
                  setChannelError("");
                  try {
                    await replaceChannelMembers(
                      channel.key,
                      (memberEdits[channel.key] ?? "")
                        .split("\n")
                        .map((id) => id.trim())
                        .filter(Boolean),
                      channel.config_version,
                    );
                    setMemberEdits({ ...memberEdits, [channel.key]: "" });
                    await reloadChannels();
                  } catch (e) {
                    setChannelError(message(e));
                  } finally {
                    setChannelBusy(false);
                  }
                }}
              >
                Replace IDs
              </button>
            </article>
          ))}
        </div>
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
              <AlertTriangle size={15} /> Health signals and crashes
            </strong>
            <p>
              Global crashes and gate health events, searchable by the
              installation ID supplied by a user.
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
              <h2>No health signals found.</h2>
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
