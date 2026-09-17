"use client";

import {
  APIError,
  Diagnostics,
  Experiment,
  GateDetail,
  GateSummary,
  Result,
  Session,
  fetchExperiment,
  fetchExperiments,
  fetchGate,
  fetchGates,
  request,
} from "@/lib/api";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Loader2,
  LogOut,
  Plus,
  Radio,
  Rocket,
  Search,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge, ErrorNotice, Summary, ago, message, number } from "./shared";

import { Auth } from "./auth-form";
import { CreateDialog } from "./experiment-create";
import { Detail } from "./experiment-detail";
import {
  CreateRolloutDialog,
  RolloutDetailView,
  RolloutsView,
} from "./rollouts";
import { EventStream, Settings } from "./workspace-tools";
export default function Workspace({
  experimentKey,
  gateKey,
}: {
  experimentKey?: string;
  gateKey?: string;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [experiments, setExperiments] = useState<Experiment[]>([]),
    [gates, setGates] = useState<GateSummary[]>([]),
    [gate, setGate] = useState<GateDetail | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [view, setView] = useState(experimentKey ? "experiments" : "rollouts"),
    [creating, setCreating] = useState(false),
    [creatingRollout, setCreatingRollout] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    setError("");
    try {
      const current = await request<Session>("/auth/session");
      setSession(current);
      const [exps, rolloutList, diag] = await Promise.all([
        fetchExperiments(),
        fetchGates(),
        request<Diagnostics>("/diagnostics"),
      ]);
      setExperiments(exps);
      setGates(rolloutList);
      setDiagnostics(diag);
      if (experimentKey) setResult(await fetchExperiment(experimentKey));
      if (gateKey) setGate(await fetchGate(gateKey));
    } catch (e) {
      if (e instanceof APIError && e.status === 401) setSession(null);
      else setError(message(e));
    } finally {
      setReady(true);
    }
  }, [experimentKey, gateKey]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  if (!ready)
    return (
      <div className="loading">
        <Loader2 className="spin" /> Opening your workspace…
      </div>
    );
  if (!session) return <Auth onSuccess={load} initialError={error} />;
  const active = experiments.filter((e) => e.status === "running").length;
  const filtered = experiments.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (e.name + " " + e.key).toLowerCase().includes(search.toLowerCase()),
  );
  const healthy =
    diagnostics?.worker_updated_at &&
    Date.now() - Date.parse(diagnostics.worker_updated_at) < 120000;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/app" className="brand">
          <span className="brand-mark">a</span> aperture
          <span className="beta">BETA</span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {session.project_name[0].toUpperCase()}
          </span>
          <div>
            <strong>{session.project_name}</strong>
            <small>Shipping workspace</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          <Link
            className={view === "rollouts" ? "selected" : ""}
            href="/app"
            onClick={() => setView("rollouts")}
          >
            <Rocket size={18} /> Rollouts{" "}
            <span className="nav-count">{gates.length}</span>
          </Link>
          <Link
            className={view === "experiments" ? "selected" : ""}
            href="/app"
            onClick={() => setView("experiments")}
          >
            <FlaskConical size={18} /> Experiments{" "}
            <span className="nav-count">{experiments.length}</span>
          </Link>
          <button
            className={view === "activity" ? "selected" : ""}
            onClick={() => setView("activity")}
          >
            <Activity size={18} /> Event stream
          </button>
          <button
            className={view === "settings" ? "selected" : ""}
            onClick={() => setView("settings")}
          >
            <Settings2 size={18} /> Settings & setup
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="system-state">
            <i className={healthy ? "online" : "offline"} />
            {healthy ? "Worker connected" : "Worker awaiting update"}
          </div>
          <div className="account">
            <span className="workspace-avatar">
              {session.email[0].toUpperCase()}
            </span>
            <span>{session.email}</span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await request("/auth/logout", {});
                  setSession(null);
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span>
            {session.project_name} <ChevronRight size={14} />{" "}
            {view === "activity"
              ? "Event stream"
              : view === "settings"
                ? "Settings"
                : gateKey
                  ? "Rollout detail"
                  : view === "rollouts"
                    ? "Rollouts"
                    : experimentKey
                      ? "Experiment detail"
                      : "Experiments"}
          </span>
          <span className="topbar-note">
            <span className="live-dot" /> Ship safely. Learn what works.
          </span>
        </header>
        <div className="content">
          <ErrorNotice error={error} />
          {view === "activity" ? (
            <EventStream diagnostics={diagnostics} refresh={load} />
          ) : view === "settings" ? (
            <Settings session={session} />
          ) : gateKey ? (
            gate ? (
              <RolloutDetailView gate={gate} session={session} reload={load} />
            ) : (
              <div className="empty">
                <h2>Unable to load rollout</h2>
                <button className="button" onClick={load}>
                  Try again
                </button>
              </div>
            )
          ) : view === "rollouts" ? (
            <RolloutsView
              gates={gates}
              create={() => setCreatingRollout(true)}
            />
          ) : experimentKey ? (
            result ? (
              <Detail result={result} session={session} reload={load} />
            ) : (
              <div className="empty">
                <h2>Unable to load experiment</h2>
                <button className="button" onClick={load}>
                  Try again
                </button>
              </div>
            )
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BUILD. MEASURE. LEARN.</div>
                  <h1>
                    Small changes.
                    <br />
                    <span>Better decisions.</span>
                  </h1>
                  <p>Turn your next big idea into something you can measure.</p>
                </div>
                <button className="button" onClick={() => setCreating(true)}>
                  <Plus size={17} /> New experiment
                </button>
              </div>
              <div className="summary-grid">
                <Summary
                  label="Running experiments"
                  count={number(active)}
                  icon={<Radio size={18} />}
                  note="Ideas learning in the wild"
                />
                <Summary
                  label="People exposed"
                  count={number(
                    experiments.reduce((n, e) => n + Number(e.exposures), 0),
                  )}
                  icon={<Activity size={18} />}
                  note="Across all your experiments"
                />
                <Summary
                  label="Completed experiments"
                  count={number(
                    experiments.filter((e) => e.status === "completed").length,
                  )}
                  icon={<CheckCircle2 size={18} />}
                  note="Decisions put into practice"
                />
              </div>
              <section className="panel experiments-panel">
                <div className="panel-toolbar">
                  <div
                    className="tabs"
                    role="group"
                    aria-label="Filter experiments"
                  >
                    {["all", "running", "draft", "completed"].map((s) => (
                      <button
                        key={s}
                        className={filter === s ? "active" : ""}
                        onClick={() => setFilter(s)}
                      >
                        {s === "all" ? "All experiments" : s}
                        <span>
                          {s === "all"
                            ? experiments.length
                            : experiments.filter((e) => e.status === s).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search experiments"
                      placeholder="Search experiments…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {filtered.length ? (
                  <div className="experiment-list">
                    <div className="list-heading">
                      <span>EXPERIMENT</span>
                      <span>STATUS</span>
                      <span>EXPOSURES</span>
                      <span>RESULTS UPDATED</span>
                      <span />
                    </div>
                    {filtered.map((e) => (
                      <Link
                        href={`/app/experiments/${e.key}`}
                        key={e.id}
                        className="experiment-row"
                      >
                        <div className="experiment-title">
                          <span className={`experiment-icon ${e.status}`}>
                            <FlaskConical size={19} />
                          </span>
                          <div>
                            <strong>{e.name}</strong>
                            <small>{e.key}</small>
                          </div>
                        </div>
                        <Badge status={e.status} />
                        <span className="tabular">{number(e.exposures)}</span>
                        <span className="muted">
                          {ago(e.results_updated_at)}
                        </span>
                        <ArrowUpRight size={17} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <span className="empty-icon">
                      <FlaskConical size={30} />
                    </span>
                    <h2>
                      {experiments.length
                        ? "No matching experiments"
                        : "Your next insight starts here"}
                    </h2>
                    <p>
                      {experiments.length
                        ? "Try a different search or status."
                        : "Test a hypothesis, measure what matters, and learn what works."}
                    </p>
                    {!experiments.length && (
                      <button
                        className="button secondary"
                        onClick={() => setCreating(true)}
                      >
                        Create your first experiment <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div className="bottom-cards">
                <section className="learning-card">
                  <span className="eyebrow">FROM IDEA TO EVIDENCE</span>
                  <h2>Make your first experiment count.</h2>
                  <p>
                    Start with one clear hypothesis and one metric that matters.
                    Keep everything else consistent.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setCreating(true)}
                  >
                    Put an idea to the test <ArrowRight size={15} />
                  </button>
                </section>
                <section className="learning-card subtle">
                  <span className="eyebrow">A CLEARER PICTURE</span>
                  <h2>Know what your data is doing.</h2>
                  <p>
                    Check incoming events and confirm your integration before
                    interpreting results.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setView("activity")}
                  >
                    Open event stream <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          <footer>
            Aperture <span>Ship safely. Learn what works.</span>
            <a href="https://github.com/aakashsell/aperture">
              Open source <ArrowUpRight size={12} />
            </a>
          </footer>
        </div>
      </main>
      {creating && (
        <CreateDialog
          close={() => setCreating(false)}
          saved={(key) => {
            setCreating(false);
            window.location.assign(`/app/experiments/${key}`);
          }}
        />
      )}
      {creatingRollout && (
        <CreateRolloutDialog
          close={() => setCreatingRollout(false)}
          saved={(key) => {
            setCreatingRollout(false);
            window.location.assign(`/app/rollouts/${key}`);
          }}
        />
      )}
    </div>
  );
}
