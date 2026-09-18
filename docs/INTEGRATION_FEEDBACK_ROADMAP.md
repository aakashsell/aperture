# Integration feedback: status and architecture

This plan reconciles the Chrome extension integration feedback with the code in this repository. “Implemented” means there is a working SDK/API/dashboard path in this checkout; it does not claim the extension integration or an external benchmark has been completed.

## Status against the ten requests

| #   | Request                             | Status                                                                                                                 | Follow-up                                                                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Gate-optional crash reporting       | Implemented: `Aperture.reportCrash()` posts to `/crashes/ingest` without a gate key.                                   | None for the core API.                                                                |
| 2   | Structured exception field          | Implemented for gate health and standalone crashes; the workspace renders exception details separately.                | Keep payload limits and sensitive-data guidance.                                      |
| 3   | Per-allocation dashboard override   | Implemented for running gates, with keyed-hash storage, audit rows, and gate-version changes.                          | Validate migration and operator workflow against Postgres in integration tests.       |
| 4   | Named channels                      | Implemented: dashboard setup for allowlists and deterministic random fill; gates can be scoped to a channel.           | Validate overlap and percentage behavior in live database tests before alpha release. |
| 5   | “What would this ID get?” debug API | Implemented as a dashboard-only evaluator using the production decision function.                                      | Add request throttling and broader authorization tests before exposing publicly.      |
| 6   | Installation-scoped health query    | Implemented through authenticated `POST /crashes/query`, including standalone crashes and all gate health events.      | Add pagination and time filters if support volume requires them.                      |
| 7   | Product event tracking              | Implemented: `track()` and `trackBatch()` feed the experiment event pipeline.                                          | Improve discoverability in integration docs and dashboard metric setup.               |
| 8   | Client crash deduplication          | Implemented: bounded in-memory SDK suppression plus server-side five-minute grouping by installation.                  | Preserve the server-side layer; SDK memory resets on process restart.                 |
| 9   | Sticky offline gate decisions       | Implemented as opt-in persistent reuse for up to 24 hours after transient failures; exposes a stale-decision callback. | Keep disabled by default and verify storage behavior in each supported runtime.       |
| 10  | Built-in `captureException()`       | Implemented as a thin adapter over `reportCrash()`.                                                                    | Framework hooks and local persistence remain separate opt-in adapters.                |

## Delivery order

### P0 — Support an existing installation safely (implemented)

The rollout detail page lets a dashboard operator select a gate, allocation kind and installation ID, then force enabled or disabled (or remove the override). Mutations require a dashboard session, project-scope the gate, record who changed what and when, accept an expected config version, and increment the gate version. Gate evaluation checks an active override before percentage bucketing and returns the winning reason. Version changes invalidate cached decisions on the next evaluation; the SDK also has an explicit `refresh` option. Override writes are unavailable to publishable keys.

Define override precedence explicitly: archived/off gate remains off; otherwise a matching active support override wins; otherwise channel eligibility and the configured percentage decide. If product requirements later need “force on even when globally off,” make that a separately named emergency action with stronger confirmation and audit semantics.

### P1 — Explain decisions and organize release audiences (implemented)

Named channels are project-scoped and have stable keys, an allocation kind, a hashed allowlist, and optional percentage fill. A gate may either use its current default allocation or select a channel. Membership and random fill first select the eligible audience; the gate’s own stable percentage bucket then determines the rollout within that audience. A support override has precedence over channel eligibility for a running gate. Fill or allowlist changes increment the channel version and attached gate versions; changing a channel never changes an unrelated gate’s salt.

`POST /debug/allocation/evaluate` is dashboard-authenticated and accepts an allocation plus up to 20 gate keys. It returns that allocation’s decision and reason (`gate_off`, `support_override`, `channel_allowlist`, `channel_percentage`, `percentage_bucket`, or `channel_not_eligible`) and config version. It reuses production evaluation, does not persist a decision, and is unavailable to publishable keys. It does not return allocation hashes or project secrets.

### P2 — Complete telemetry workflows and offline behavior

The installation query now includes standalone crashes and all gate health events, behind dashboard authentication and keyed allocation hashes. Pagination/time filters remain follow-up work.

Document the existing event-to-metric path next to the `track()` example: assignment, exposure, conversion event, linked metric, and results. Make it clear that a decision is not an exposure, and an event contributes to experiment results only for an eligible exposed user in the metric window.

Persistent offline decisions are opt-in through `offlineDecisionTtlMs` (maximum 24 hours). The SDK stores gate key, allocation, decision, config version, server expiry, and local save time in browser/extension storage. It uses the stored decision only after a transient request failure and invokes `onStaleDecision`; it does not silently convert an authentication or validation error into stale success. A stale allow can continue exposing a broken feature, while a stale deny can interrupt an in-progress experience. The application chooses its policy; Aperture does not imply a universally safe choice.

### P3 — Convenience API

`captureException(error, context)` is a thin adapter over `reportCrash()`. It normalizes `Error` and non-Error rejection values, accepts an optional name/properties/gate association, and honors existing deduplication and `onError` behavior. The server continues to bound message/stack size. Local persistence, framework hooks, automatic global handlers, and retry queues remain opt-in adapters rather than hidden SDK side effects.

## Architecture boundaries

```text
Application / coding agent
        │ SDK: gate, exposure, health, crash, track
        ▼
Publishable-key API ── evaluation + validated ingestion
        │                       │
        ▼                       ▼
  Postgres source          keyed allocation hashes
  of truth                 and deduplicated telemetry
        ▲
        │ dashboard-session API: configure, override,
        │ explain, query, inspect
        ▼
  Workspace UI
```

Keep runtime evaluation and telemetry ingestion separate from administrative control. Publishable keys can evaluate gates and submit bounded telemetry; dashboard sessions can mutate rollout configuration, set support overrides, explain decisions, and query installation records. Project scoping is mandatory at every boundary. Support overrides, channel definitions, and gate configuration changes are versioned and audited. The SDK cache is advisory and short-lived; the server remains authoritative.

## Acceptance checks for the new work

- An authenticated operator can force one existing installation on/off, see the audit entry, remove the override, and verify another installation is unaffected.
- A cached decision changes after a configuration-version update or explicit refresh; exposure and health still refer to the exact evaluated version.
- Allowlisted, percentage-filled, excluded, and overridden allocations receive deterministic decisions with a human-readable reason from the same evaluator used in production.
- Publishable-key requests cannot mutate overrides, enumerate installation health, or call administrative explain endpoints.
- Offline behavior tests cover expiry, process restart, explicit refresh, and both stale allow/deny policies before any persistent cache is enabled by default.
- `captureException()` uses the existing crash ingestion path and does not bypass payload limits or deduplication.

## Production-readiness gate

The feature work is present in this checkout, but it is not production-ready until the database-backed and deployed behavior is verified. The remaining release gate is:

- Run clean-install and existing-database upgrade tests for migrations 006–007; test channel membership/fill changes, support override set/remove, expected-version conflicts, project isolation, and audit records against Postgres.
- Run the browser suite against the real API/database stack, including the channel → rollout → override → refresh/remove support path and installation health lookup. The current environment cannot run local listeners or Docker Compose, so that end-to-end verification is still outstanding here.
- Review and load-test API limits and query costs, especially crash/event ingestion and channel lists; verify dashboard-only routes reject publishable-key requests.
- Exercise deployment from a pinned commit in staging, apply migrations, test backup and restore, confirm monitoring/alerts and secret rotation, and dogfood the Chrome extension rollout before claiming production readiness.

Planning estimate: **about 2–4 focused engineering weeks** for one engineer to finish those integration/security/operations checks and resolve findings, assuming staging access and no major migration or load issues. This is an estimate, not a release date; the browser extension dogfood and restore drill are the key evidence gates.
