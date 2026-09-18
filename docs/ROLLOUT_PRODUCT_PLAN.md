# Aperture rollout product plan

## Product direction

Aperture is the feedback and safety layer between writing software and exposing it to users.

The first job is a safe, understandable rollout:

> Ship this change to 5% of users, observe what happens, then expand it or turn it off.

The second job is experimentation:

> Compare experiences and learn whether the change is better.

Rollouts and experiments share identity, allocation, exposure, events, project isolation, and diagnostics. They remain separate product concepts because their guarantees differ.

## Implementation status — September 2026

The v0 foundation, SDK, dashboard, landing page, and documentation in milestones 1–3 are implemented. The repository verifies the actual TypeScript SDK through a 5% rollout, exposure capture, deterministic expansion to 100%, and the existing experiment pipeline against Go, Postgres, and the statistics worker.

The remaining dogfood step is to apply the documented integration to the real Chrome extension feature and run it against a deployed Aperture environment. The extension source and public deployment are outside this repository, so no live-user rollout or compatibility claim is recorded yet. Promotion from a rollout into an experiment, hosted alpha operations, and external compatibility benchmarks remain later milestones.

The integration feedback features are now implemented in the working tree: audited per-allocation overrides, channel-scoped rollout eligibility, dashboard evaluation explanations, complete allocation health lookup, opt-in stale offline decisions, and `captureException()`. Migrations 006–007 and the browser flow still need database-backed integration verification before these are treated as production-proven.

The exact status and release gates are tracked in [the integration feedback roadmap and architecture](INTEGRATION_FEEDBACK_ROADMAP.md).

## Product contract

### Gates and rollouts

A gate answers whether a stable allocation unit receives a feature.

```ts
const enabled = await aperture.gate("new-sync");
```

- A gate starts off and can be set from 0% to 100%.
- The same gate, allocation unit, and project always produce the same bucket.
- Increasing the percentage adds users without removing users already included.
- Decreasing the percentage removes only users above the new threshold.
- Turning a gate off returns `false` for every allocation unit.
- A decision is not an exposure. Exposure is recorded only after the gated experience is actually used or shown.
- The first release uses manual percentage changes and manual disable. Automatic expansion and rollback come later.

### Allocation identity

Browser clients may omit an allocation ID. The SDK creates a random installation ID once and persists it in local storage.

Advanced clients can provide a stable allocation unit explicitly:

```ts
await aperture.gate("new-sync", { id: user.id, kind: "user" });
await aperture.gate("team-billing", {
  id: organization.id,
  kind: "organization",
});
```

- Supported kinds begin as `anonymous`, `user`, `installation`, `device`, `account`, `organization`, and `host`.
- The kind is part of the allocation key so IDs from different namespaces cannot collide.
- Server-side callers must provide an allocation unit. The SDK must not create one shared anonymous server identity.
- Clearing browser storage creates a new anonymous installation and may change the decision. This is documented behavior.
- Applications should move from an anonymous ID to a user or account ID only at a deliberate identity boundary; automatic identity merging is deferred.

### Experiments

Experiments continue to preserve immutable assignments, explicit exposures, metric windows, integrity diagnostics, and fixed-horizon statistical output.

A gate may later be promoted into an experiment, but promotion must create a new experiment definition and preserve the rollout history. Changing a gate percentage must never silently mutate an experiment allocation.

## Architecture

### Shared evaluation layer

Create one internal evaluation package used by gates and experiments:

- canonical input: project, entity type, entity key, allocation unit kind, allocation unit ID;
- SHA-256 bucketing with a versioned canonical byte format;
- integer buckets from 0 to 999,999;
- server-authoritative decisions in the first release;
- test vectors shared by Go and TypeScript so future local evaluation cannot drift.

### Gate data model

Add these tables in a forward-only migration:

`gates`

- project ID, key, name, description;
- status: `off`, `running`, or `archived`;
- rollout percentage in basis points (`0..10000`);
- allocation kind and immutable salt;
- created, updated, and archived timestamps.

`gate_decisions`

- gate ID, allocation kind, allocation ID hash, enabled decision;
- gate configuration version and evaluation timestamp;
- unique by gate, allocation kind, allocation ID hash, and configuration version.

Decision rows provide diagnostics and an audit trail. The decision itself remains deterministic and does not require a write to remain sticky.

`gate_exposures`

- gate ID, allocation kind, allocation ID hash;
- configuration version and actual decision shown;
- first exposure time and most recent exposure time;
- idempotent within a documented exposure window.

`gate_health_events`

- gate ID, allocation identity hash, event ID, health event name, severity, timestamp, and limited properties;
- project-scoped event deduplication;
- first supported health events: `error`, `crash`, and a custom failure event.

`gate_overrides` stores per-allocation support decisions using the same keyed allocation hash, with `gate_override_changes` as the operator audit trail. Channels and their hashed members live in `channels`, `channel_members`, and append-only change tables. Gates may reference one channel; changing its membership or fill increments the versions of attached gates so SDK cache entries expire against the new configuration.

Store a keyed hash of allocation IDs in gate telemetry rather than raw IDs. The API can evaluate using the submitted ID, then discard the raw value after hashing. The project secret used for hashing must be separate from the public SDK key.

### API surface

SDK routes, authenticated with the publishable project key:

- `POST /gates/:key/evaluate`
- `POST /gates/:key/expose`
- `POST /gates/:key/health`

Management routes, authenticated with a dashboard session:

- `GET /gates`
- `POST /gates`
- `GET /gates/:key`
- `POST /gates/:key/rollout`
- `POST /gates/:key/disable`
- `POST /gates/:key/archive`
- `POST /gates/:key/overrides/inspect`, `POST /gates/:key/overrides`, `POST /gates/:key/overrides/remove`
- `POST /debug/allocation/evaluate`
- `GET /channels`, `POST /channels`, `POST /channels/:key/fill`, `POST /channels/:key/members`

Every management mutation validates the expected current configuration version to prevent two tabs or agents from overwriting each other.

### SDK surface

```ts
const aperture = new Aperture({
  apiUrl,
  publishableKey,
});

const enabled = await aperture.gate("new-sync");
if (enabled) {
  await aperture.exposeGate("new-sync", true);
  runNewSync();
}

await aperture.reportGateHealth("new-sync", {
  eventId: crypto.randomUUID(),
  name: "error",
  severity: "error",
});
```

The SDK must:

- persist an anonymous browser allocation ID when no ID is supplied;
- require an explicit ID outside a browser;
- time out and reject on network or HTTP failure;
- let the application choose the safe fallback;
- cache decisions briefly without extending beyond a returned expiry;
- include the evaluated configuration version in exposure and health calls;
- reject exposure when no matching decision was evaluated;
- never claim that a fallback decision came from Aperture.

## User experience

### Workspace navigation

The workspace starts with:

1. **Rollouts** — the default home and primary creation action.
2. **Experiments** — the existing measured comparison workflow.
3. **Activity** — gate evaluations, exposures, health events, and experiment events.
4. **Settings** — project keys, integration instructions, and deployment information.

### Create a rollout

The initial flow asks only:

1. What change are you shipping?
2. What percentage should receive it? Default: 5%.
3. How should users be allocated? Default: anonymous installation for browser apps.
4. Which failure event should Aperture watch? Optional in the first release.

The confirmation screen provides an SDK snippet and an agent-ready prompt. The user reviews the integration and explicitly starts the rollout.

### Rollout detail

Show:

- current percentage and status;
- evaluated units and actual exposures;
- exposure coverage;
- health-event rate for enabled and disabled units when available;
- recent configuration changes;
- clear actions: disable, increase, decrease, and set to 100%;
- a notice that limited exposure reduces blast radius but does not prove safety.

No “safe” badge appears merely because error counts are low. The first release reports observations and integrity issues; it does not automatically approve expansion.

### Landing page

Lead with:

> Ship safely. Learn what works.

Show the 5% rollout before the experiment demo:

1. Tell your coding agent what to protect.
2. Agent adds `aperture.gate()` and health reporting.
3. Aperture verifies decision and exposure wiring.
4. Human reviews and starts at 5%.
5. Human expands, disables, or turns the rollout into an experiment.

Keep the audience section for solo builders, vibecoders, indie hackers, and lean teams. Keep self-hosted core, planned full hosting, planned hosting with a customer database, and custom solutions clearly separated by availability.

## Delivery milestones

### Milestone 1 — Gate foundation

- Add gate schema and versioned evaluation package.
- Implement create/list/detail/evaluate/update/disable APIs.
- Add authorization and project-isolation tests.
- Add deterministic bucketing and monotonic percentage tests.
- Add concurrency tests for configuration updates.

Acceptance: a gate can move from 0% to 5%, 25%, 100%, and off while stable allocation units receive deterministic decisions and projects cannot cross-read or mutate data.

### Milestone 2 — SDK and anonymous allocation

- Add `gate()`, `exposeGate()`, and `reportGateHealth()`.
- Persist an anonymous installation ID in browsers.
- Require explicit identity on servers.
- Return configuration version and cache expiry from evaluation.
- Add browser, Node, timeout, retry, and identity-boundary tests.

Acceptance: the same browser installation keeps its decision across reloads, increasing traffic is monotonic, a Node client without identity fails clearly, and exposure cannot disagree with the evaluated decision.

### Milestone 3 — Rollout dashboard

- Make Rollouts the default workspace view.
- Add the four-step creation flow and agent prompt.
- Build rollout detail with percentage controls, activity, exposure coverage, and health observations.
- Require explicit human confirmation for start, disable, and 100% rollout.
- Add responsive browser tests for the complete flow.

Acceptance: a new user can create a 5% rollout, copy a working integration, verify incoming telemetry, increase it, and disable it without touching the database.

### Milestone 4 — Dogfood integration

- Integrate a real Chrome extension or equivalent browser product.
- Allocate by persisted installation ID.
- Report a concrete error or failure event.
- Run at 5%, verify events, then manually expand or disable.
- Record every intervention and update the agent integration guide.

Acceptance: one real feature completes the path from code change to limited exposure and a documented human decision.

### Milestone 5 — Connect rollouts and experiments

- Add “Create experiment from rollout.”
- Snapshot the gate definition into an immutable experiment.
- Preserve rollout history and experiment assignments independently.
- Add UI explaining rollout safety observations versus experiment outcome evidence.

Acceptance: promoting a rollout cannot rewrite prior decisions or contaminate experiment assignments.

### Milestone 6 — Alpha operations and distribution

- Publish the TypeScript package or provide a one-command installer with versioned artifacts.
- Add deployment documentation for the open-source core.
- Deploy one hosted alpha environment.
- Benchmark at least one unfamiliar Next.js app, one browser-only app, and one non-Next server-rendered app using the same agent prompt.
- Publish only compatibility claims supported by recorded results.

Acceptance: a stranger can install the SDK, complete a rollout, and understand failures from public documentation without private guidance.

## Explicit non-goals for the first rollout release

- automatic rollback or automatic percentage increases;
- targeting rules beyond percentage and stable allocation kind;
- identity merging across anonymous and authenticated users;
- multi-region local evaluation;
- Firebase, Python, mobile, or server-specific SDKs;
- billing and plan enforcement;
- claims that low observed errors prove safety;
- claims of compatibility with untested stacks or coding agents.

## Quality gates

Before calling the rollout feature complete:

- Go unit and static checks pass.
- SDK unit and real API/Postgres tests pass.
- Browser tests cover anonymous persistence, creation, start, percentage update, disable, and mobile layout.
- A migration test succeeds from the existing experiment schema and from an empty database.
- The SDK and API share published bucketing test vectors.
- Invalid exposure, stale configuration, duplicate health event, cross-project access, and concurrent update tests pass.
- README, landing page, dashboard copy, and agent instructions describe the same actual behavior.

## Product metrics

Primary activation metric:

> Weekly valid rollouts and experiments.

A rollout or experiment is valid only when it has a decision, a matching exposure, and no unresolved critical integrity issue.

Retention signal:

> A project completes a second valid rollout or experiment within 30 days.

Supporting metrics include time to first valid rollout, percent of integrations needing manual correction, percentage of rollouts with health telemetry, and percentage of started rollouts that reach an explicit expand, disable, or experiment decision.
