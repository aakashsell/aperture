# Integrating Aperture into an unfamiliar application

Use only documented APIs. Do not implement a separate assignment hash or infer exposure from assignment.

## Roll out a real change safely

1. Ask the human to create the rollout in Aperture. Management actions require their dashboard session; never start or expand a rollout with a publishable key.
2. Install and initialize `@aperture/sdk` with the project's API URL and publishable key.
3. In a Chrome extension, ensure the manifest contains the `storage` permission and the Aperture API origin in `host_permissions`. Let `gate(key)` use its persistent anonymous installation ID unless the app already has a better stable allocation unit.
4. Await `gate(key)` before selecting the new or current code path. On a network or SDK error, use the current behavior.
5. After committing to the selected path, await `exposeGate(key, enabled)`. Record exposure for enabled and disabled decisions so health rates have a comparison group.
6. Report relevant failures with `reportGateHealth()`. Use a fresh event ID for a new failure and preserve the same ID when retrying. Do not report unrelated errors just to create activity.
7. Keep the current implementation available as the fallback through the rollout. Do not delete it while the rollout is below 100%.
8. Show the human the changed files and the exact fallback behavior. The human reviews the integration and starts at 5% in the dashboard.
9. Treat “No health flags observed” as an operational signal, not proof of safety. A human reviews exposure counts and failure rates before expanding to 25%, 50%, or 100%.

```ts
const enabled = await aperture.gate('new-sync');
await aperture.exposeGate('new-sync', enabled);
try {
  enabled ? runNewSync() : runCurrentSync();
} catch (error) {
  await aperture.reportGateHealth('new-sync', {
    eventId: crypto.randomUUID(),
    name: 'sync-failed',
    severity: 'error',
  });
  throw error;
}
```

## Run an experiment

1. Build/install the local SDK as described in README. Record the application commit and runtime.
2. In Aperture, create a draft with a clear hypothesis, 50/50 variants, and a primary conversion event. Use the dashboard; publishable keys cannot create experiments.
3. Start the experiment once the integration is ready to receive traffic.
4. Await `getVariant(experimentKey, stableUserID)` before choosing which experience to render. On error, render the application's existing safe default and do not record experiment exposure.
5. After actually displaying the experience, await `expose(experimentKey, stableUserID, displayedVariant)`. Do not expose hidden or unvisited UI. Never assign a new identity just to obtain a different variant.
6. Track the conversion only when it occurs, using the same user ID and a unique event ID. Preserve the event ID for retries. Binary conversion is event presence, not event value.
7. Verify repeated assignments, exact exposure matching, event arrival, fallback behavior, and the application's build/tests.
8. Pause stops new enrollment while preserving existing assignments. After rollout, use returned feature decisions but remove experiment exposure calls.

## Benchmark record

Record repository URL and pinned commit, license, runtime, installer/agent version, exact prompt, files changed, elapsed time, human interventions, build/test results, assignment checks, exposure checks, metric checks, and remaining failures.

Suggested first matrix: a Next.js SSR app, a browser-only React/Vite app, and a Python-rendered app with browser JavaScript. Expand to Supabase and Prisma variants after those pass. These are planned benchmarks, not claimed compatibility results.

## Standard prompt

> Integrate Aperture into this app to test a signup or pricing change, measuring actual conversion. Use only Aperture's README and agent integration instructions. Preserve the existing experience on failures. Report every manual intervention and run the application's existing checks.

Do not claim an automated agent completed dashboard setup if a human performed it. Do not publish simulated results as live experiment evidence.

## Report unhandled exceptions

Use `reportCrash()` for service worker startup errors, unhandled rejections, or exceptions that cannot be reliably tied to an exposed gate. Use `reportGateHealth()` for a failure that belongs to an already exposed rollout decision. Include structured `exception` data instead of putting a stack trace in `properties`.

```ts
self.onunhandledrejection = (event) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  void aperture.reportCrash({
    eventId: crypto.randomUUID(),
    name: 'unhandled-rejection',
    severity: 'fatal',
    exception: { type: error.name, message: error.message, stack: error.stack },
  }).catch(() => {});
};
```

The SDK suppresses an identical exception from the same allocation for five minutes in memory. The server also deduplicates matching reports by installation and five-minute time bucket while increasing an occurrence count. A browser or extension service worker restart clears the SDK's in-memory cache; server grouping still applies. The Event stream supports an installation lookup only through the authenticated dashboard session. Stack traces and exception messages may contain sensitive values, so keep them bounded and scrub secrets before reporting.
