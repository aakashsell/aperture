# Aperture v0: MVP readiness and ship plan

**Status:** execution in progress. The local checkout now includes a public docs hub, SDK support identity access, clarified beta-channel controls, and channel integration coverage. Dokploy lists the Aperture project and both Compose deployments as successfully deployed, but the current checkout has not been pushed and the public routes could not be verified from this runner.

**MVP promise:** *I can ship a real change in my Chrome extension to a small, deliberate group, see whether it is healthy, and confidently expand it or turn it off.*

**First customer/use case:** Daia’s Libre CGM support beta, with 10–20 testers. The Aperture repo does not contain Daia’s extension, so extension integration, privacy review, and Chrome Web Store submission require a separate checkout and an owner from that project.

## Recommendation

Ship a **closed, instrumented alpha** around one real extension rollout before promoting Aperture as a production hosted service. Keep the scope to one app, one workspace/project, one gated feature, stable allocation, explicit exposure, health reporting, operator-controlled rollout, and a proven off switch.

Do not make the first ship depend on statistical experiment workflows, billing, multiple SDKs, WebSocket push, gate-prefix key ACLs, a hosted CDN, or automatic rollback. The beta cohort is too small to establish that a feature is safe or statistically better; this alpha demonstrates that the integration, telemetry, and operational controls work.

## What “shipped” means

The release is ready for the first beta only when all of these are true:

- The extension owner configures Aperture once in the extension build. Testers never paste an API URL or publishable key.
- The Libre code is already packaged inside the reviewed extension. Aperture changes a decision; it does not deliver or execute new code.
- A known beta allocation is identified by the same stable kind/ID the SDK sends. If selecting 10–20 specific installations, the integration can read/copy those IDs without asking testers to use the Aperture dashboard.
- With the rollout off, every tester uses the established code path. After start, exactly the intended beta group can reach the new code path. The operator can disable it and verify the fallback.
- Exposure is recorded only after the new or current path is actually selected. Comparable failure health is reported for both paths.
- The operator can identify the beta allocation in Aperture, inspect its decision and health, and remove or change any support override.
- Migrations work from both an empty database and a copy of the current database. Backups are stored outside the application host, and a restore has been demonstrated.
- Chrome Web Store privacy, distribution, and permissions declarations are reviewed for the extension’s handling of health data.

## Current repository baseline

The working tree already contains most of the product flow, but that is not the same as a deployed, verified release:

| Area | Present in this checkout | Still needed for MVP evidence |
| --- | --- | --- |
| Rollout product | Gates, deterministic allocation, manual percentage changes/off, exposure, health, support overrides, evaluation explanation, and channels are implemented. | Run channel/override/workspace flows against Postgres and the deployed API. Confirm UI language and production commit. |
| SDK | TypeScript gate and explicit exposure; Chrome storage-backed anonymous identity; health/crash/events; decision refresh and opt-in stale-decision behavior. | Confirm Daia passes the expected allocation kind/ID, measures packaged size, and behaves correctly through service-worker restart, network timeout, and gate-off. |
| Dashboard | Rollouts, experiments, workspace settings, channels, health, and deletion flows are present. | Run the UI flows against Postgres and check keyboard/mobile behavior in a browser. |
| Tests | GitHub Actions runs Go tests/vet/build, worker tests, SDK tests, migrations, API/Postgres integration, Next build, and Playwright. | Add a direct API integration contract for channel allowlist/fill and override/version boundaries. Require the full Actions run on the release commit; local sandbox cannot start the Playwright listener. |
| Deployment | Dokploy read-only project listing shows `Aperture` with `Aperture Core` and `Aperture Site` in `done` status. The checked-in Compose files keep the site and app stacks separate. | Dokploy detail calls currently fail with an invalid endpoint URL; public DNS lookup from this runner also fails. Verify the running commit/domains, then add external backups, restore evidence, monitoring/alert ownership, and release/rollback notes. |
| Distribution | README still says the SDK is built from this checkout and is not published to npm. | For Daia’s bundled extension, pin/build the SDK from a tagged commit. Decide on npm publication only if outside integrators are part of this alpha. |
| Documentation | The landing site now links to a `/docs` hub covering SDK setup, beta groups, identity matching, rollout percentages, health/crash/event logging, workspace boundaries, and archive/delete behavior. Detailed guides remain linked from the page. | Browser-test the docs page, verify the deployed route, and keep examples aligned with the checked-in SDK and actual product behavior. |

Before shipping, reconcile the release docs: [README](../README.md) describes production Compose instructions, while [MVP audit](MVP_AUDIT.md) says production deployment is not complete. State what is actually deployed and tested, by commit and environment, rather than using “production” as a configuration-file label.

**Secret-alert work in this checkout:** the source review found fixed, non-production database/JWT/test password values in CI, local Compose defaults, and test fixtures; the production Compose file requires Dokploy-provided values. The local CI/dev/test defaults now use run-scoped or generated credentials, and database initialization fails if `DATABASE_URL` is absent. This does not remove historical Git history or prove the exact GitGuardian alert is resolved; confirm the finding and disposition in GitGuardian before declaring the incident closed.

## Release path

### Phase 0 — Freeze scope and close release hygiene

**Effort:** 0.5–1 engineering day.

1. Pin the target Aperture commit, API URL, Dokploy deployments, workspace/project, gate key, and Daia extension version. Verify the landing domain and app domain serve the intended surfaces.
2. Resolve the previously reported GitGuardian “Generic Password” alert. Establish whether the value was a real credential; revoke and rotate it if it could authenticate anywhere. Scan the repository and deployment configuration without printing or copying secret values. Enable GitHub push protection where available; it blocks recognized secrets before they enter future pushes ([GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)).
3. Name the release owner and backup operator. Record who may start, expand, disable, and restore the beta.
4. Freeze v0 scope to the rollout promise above. Park experiments, billing, multi-region hosting, and external starter-repository benchmarks.

**Exit:** exact code/environment are known, the credential alert has a documented disposition, and the team agrees on who owns the live switch.

### Phase 1 — Make Daia’s integration tester-proof

**Effort:** 1–3 engineering days, depending on the Daia code and ID availability.

1. Initialize the SDK in the extension build with one API URL and one project publishable key. Inject configuration at build time if the app needs environment-specific endpoints. The publishable key is client-visible; no dashboard password, JWT secret, database credential, or telemetry secret goes into the extension.
2. Confirm that the SDK’s `chrome.storage.local` identity is persisted across extension service-worker restarts. Chrome may stop an idle extension service worker, so state required after restart must live in extension storage, not a global variable ([service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)).
3. Inspect Daia’s existing “copy installation ID” diagnostic value. Prove it is exactly the allocation ID and kind sent to Aperture. If not, either:
   - explicitly pass Daia’s stable installation ID to `gate()`, and use that same value for the channel; or
   - add a safe “copy Aperture allocation ID” diagnostic affordance to the extension.
4. Create one gate such as `libre-cgm`. Default/off behavior must remain the currently supported CGM path. On an Aperture timeout, invalid response, or offline request, keep that same fallback. Never let a rollout failure suppress the existing feature.
5. Call `exposeGate()` after the code path is committed/visible, for both enabled and disabled decisions. Send health for actual relevant failures only. Do not treat gate evaluation as exposure.
6. Do not send glucose values, CGM history, Dexcom/Libre credentials, access tokens, or raw user content to Aperture. Send only the allocation identifier needed for assignment and bounded operational signals (event name, severity, and scrubbed diagnostic detail).
7. Measure the packed extension size before/after adding the SDK. Daia reports about 10 KB gzipped; verify this against the actual minified, packaged artifact before deciding whether a smaller entry point is necessary.

Chrome Manifest V3 prohibits remotely hosted executable code: all gate-controlled behavior must already be in the extension package; Aperture returns configuration/decisions only ([Manifest V3 overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)). The extension should request only the permissions it needs. Chrome documents `storage` for extension storage and host permissions for extension-origin `fetch()` calls ([permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)). Confirm the manifest asks for `storage` and only the Aperture API host it needs.

**Exit:** one release candidate runs without tester-side setup, survives service-worker restart, uses a known stable identity, falls back safely, and produces matching decision/exposure/health events.

### Phase 2 — Prove the channel and operator workflow

**Effort:** 1–3 engineering days.

Add and run DB-backed checks for:

- Allowlisted IDs are matched only when both allocation kind and ID match; random fill is deterministic; channel and gate percentages compose as documented.
- A channel allowlist/fill update changes the configuration version, and an old client decision is refreshed on its next eligible evaluation.
- A project cannot read or mutate another project’s channels, gates, overrides, crashes, or events. SDK publishable keys cannot call dashboard operations.
- Support override set/inspect/remove is scoped to one allocation, audited, and respects off/archived gate precedence.
- Two concurrent updates with the same expected version result in one success and one conflict.
- New migrations 006–007 apply cleanly to a fresh database and safely upgrade a production-shaped copy. Never use the test compose volume for a production restore test.
- Browser flow: create channel → add tester IDs → create rollout linked to channel → start → observe status → disable. Add a high-visibility note in both channel and rollout UI: **channel = eligible audience; rollout = enables the change**.
- The “create and switch workspaces” flow selects the correct API key and never shows previous workspace data after switching.

Run the repository’s full CI pipeline on the pinned candidate. It already covers Go, SDK, worker, Postgres integration, production web build, and Playwright; a green local typecheck/build alone does not replace the full job.

**Exit:** CI is green on the release commit; clean-install and upgrade migrations pass; dashboard and API use the same tested channel semantics.

### Phase 3 — Make alpha operations recoverable

**Effort:** 1–2 engineering days.

1. Verify TLS for both public hostnames, `APP_ENV=production`, Secure/HttpOnly/SameSite session cookie flags, and that Postgres and the API have no public route. Confirm required secrets exist only in the deployment secret store.
2. Set a backup objective for this alpha. Schedule an encrypted `pg_dump` outside the Dokploy host, define retention, alert on missed backups, and perform a restore into an isolated database. A persistent Docker volume protects against some container replacements; it is not a backup. PostgreSQL documents `pg_dump` as a consistent live logical backup and discusses when continuous WAL archiving is needed for point-in-time recovery ([pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html), [backup approaches](https://www.postgresql.org/docs/16/backup.html)).
3. Add alerts/ownership for API health, database storage, migration failure, worker age, and backup failure. Run a test alert and recovery drill.
4. Check auth abuse controls and API resource bounds. Auth routes are rate-limited, but confirm rate limiting for public evaluation and telemetry ingestion before making the API broadly discoverable. Keep payload limits, event limits, and an operator response path for abuse.
5. Check session security in production through the browser and proxy. OWASP recommends secure transport for the full session and `Secure`, `HttpOnly`, and explicit `SameSite` protections for session cookies ([OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).
6. Agree on data retention and deletion for identifiers, events, crash messages, and stack traces. Treat exception payloads as potentially sensitive; the extension must scrub them before reporting.
7. Reconcile current user-facing limitations: no shared team workspaces, no password reset/email recovery, SDK not on npm, and no automatic rollback. For a known 10–20 tester alpha, give the operator an account-recovery procedure and say these features are not available; do not imply a broad self-serve hosted plan is generally ready.

**Exit:** there is a tested restore path, working alerts, a live operator, no unresolved real secret exposure, and written retention/recovery procedures.

### Phase 4 — Private extension beta and controlled rollout

**Effort:** 1 day of engineering/operator work plus Chrome review and tester availability, which can add calendar time.

1. Choose extension distribution separately from Aperture gating. Chrome Web Store supports **Private** distribution to named Google accounts or groups, and **Unlisted** distribution by direct link. Both still go through the same policy review. For a true 10–20-person closed group, use Private distribution if the testers can be listed; an unlisted URL is not an access-controlled tester list. If publishing a parallel test item, Chrome asks developers to label its name/description as a beta/testing build ([distribution options and test versions](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)).
2. Complete the store privacy declarations and review a public privacy policy. Chrome treats health information as sensitive user data, requires disclosure even for local-only handling, and requires secure transmission for sensitive data ([Chrome Web Store user-data requirements](https://developer.chrome.com/docs/webstore/user_data)). Daia’s CGM integration needs its own privacy/compliance review; this plan does not determine which health-data laws apply.
3. If the 10–20 IDs are known, create a `Beta testers` channel with the exact allocation kind, explicit IDs, and 0% random fill. Attach the `libre-cgm` rollout and set its audience to 100% if all listed testers should get the feature. Start it only after the release owner confirms the code, fallback, and telemetry.
4. If exact IDs are not available, do not call a random 2–4% fill “the 10–20 beta testers.” It is a sampled canary whose realized size varies. First expose a stable ID in the extension’s diagnostics, or use a distribution strategy that restricts who has the candidate extension installed.
5. Run a controlled preflight with a developer installation and at least one tester-like installation: off/fallback, on/beta, repeated assignment, exposure, a synthetic failure, and disable. Confirm API evaluation latency and disable propagation from the tester’s region; measure actual p50/p95 rather than promising a CDN or sub-50 ms response.
6. Keep the operator dashboard open during initial activation. Watch assignment and exposure coverage, enabled-versus-disabled health, API/worker health, and support reports. For any unexplained severe regression or missing telemetry, disable and investigate. Do not use a group of 10–20 to claim statistical safety or product improvement.

Chrome’s extension update cycle is not the rollout switch: Chrome checks for extension updates periodically and can defer installation while an extension is active. The Aperture gate can disable already-installed code, but cannot deliver a missing fix into an extension package. Make that distinction clear to the operator ([extension update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)).

**Exit:** the invited group has the expected extension build; only the intended group sees Libre support; telemetry can diagnose an issue; the operator has exercised disable and confirmed the existing path returns.

### Phase 5 — Review evidence, then widen

After the first beta window, review:

- number of beta installations evaluated and exposed;
- exposure coverage by decision and extension build;
- reported failures in the new path compared with the current path;
- timeout/offline fallback counts and evaluation latency percentiles;
- crashes, support reports, missing IDs, and operator intervention time;
- whether users understood the beta and privacy disclosures.

If the rollout remains healthy under the pre-agreed observation window, widen deliberately. The current gate is bound to its selected channel: raising that channel’s random fill broadens its eligible audience; `100%` fill makes all matching allocation IDs eligible. Confirm this broadening in the UI before applying it. Use smaller steps if expected exposure or support capacity warrants it. Preserve the ability to disable at every step.

**Success for this alpha** is operational: the release reached the intended group, assignment stayed stable, exposures and health were observable, the fallback and kill switch worked, and no protected data was sent to Aperture. It is not a conclusion that Libre support is clinically safe or that the beta established statistical efficacy.

## Immediate blockers versus later product work

### Block the first beta

- Unknown or unstable allocation identity for the target testers.
- Tester-facing setup requires pasting Aperture credentials.
- Fallback does not reliably preserve the current path.
- Channels/overrides migrations or project isolation not verified with Postgres.
- No successful disable test or no one on call during activation.
- Real secret alert not resolved; sensitive data appears in Aperture telemetry without disclosure/review.
- No recoverable database backup for the hosted alpha.
- No public setup guide explaining channel vs rollout, identity, and how to start/disable.

### Ship later, after MVP evidence

- Publish npm SDK after packaging/export and reproducible install checks.
- Multi-app/gate-prefix publishable-key ACLs. Today use a separate workspace/project for a hard product boundary; a project key is not a gate-prefix permission system.
- Smaller tree-shaken/evaluate-only SDK entry point after bundle measurement.
- SDK convenience to retrieve a generated anonymous ID; prefer using Daia’s own stable install ID if that is already available and appropriate.
- Real-time push updates; current client refresh/expiry behavior needs a measured target first.
- Built-in metric templates, automatic pause/rollback, more SDKs, billing, multi-region/CDN and OSS compatibility claims.
- Broad self-serve hosted launch, until account recovery, retention/deletion, abuse controls, support, backup restore, and deployment ownership are in place.

## Schedule estimate

Assuming the Daia extension is available, one engineer can get the code and test evidence for a closed alpha in **about 5–10 focused engineering days**, followed by Chrome Web Store review and a beta observation window whose calendar length is outside Aperture’s control. This depends on the identity being discoverable and staging/Dokploy access being available.

A **public hosted MVP** is a larger gate: estimate **2–4 focused engineering weeks** after the closed-alpha path, subject to findings from database-backed tests, operational drills, account recovery, and public privacy/support readiness. These are planning estimates, not commitments. The first release should be the bounded beta; the public launch follows evidence rather than a date.

## Research notes and primary sources

Research checked 17 September 2026. Chrome policies apply to the extension developer; confirm the exact current policy and distribution choices in the Web Store dashboard before submission.

- Chrome Web Store, [distribution visibility and beta/testing releases](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
- Chrome Web Store, [user data, health information, privacy policy, and secure handling](https://developer.chrome.com/docs/webstore/user_data).
- Chrome Extensions, [Manifest V3 and remotely hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).
- Chrome Extensions, [extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) and [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Chrome Extensions, [minimum permissions and API host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).
- Chrome Extensions, [extension update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle).
- GitHub, [push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).
- PostgreSQL 16, [pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html) and [backup and restore choices](https://www.postgresql.org/docs/16/backup.html).
- OWASP, [session management cookie and transport guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
