# Add rollout health and experiment logging

This guide covers the application code that sends useful signals to Aperture. The core rule is to report **what actually happened**: a gate decision is not an exposure, an exposure is not a conversion, and an exception may have no gate at all.

## Initialize the SDK

Build/install the TypeScript SDK from this repository using the steps in the README. In a Chrome extension, add the `storage` permission and the Aperture API origin to `host_permissions`.

```ts
import { Aperture } from "@aperture/sdk";

export const aperture = new Aperture({
  apiUrl: "https://your-aperture-api.example",
  publishableKey: "ap_pub_YOUR_PROJECT_KEY",
  onError: (error) => console.warn("Aperture signal failed", error),
});
```

Use the publishable project key in client code. It can evaluate, expose, and send events; management and support operations require a dashboard login. Do not put dashboard credentials or server secrets in an extension or browser bundle.

## Log a protected rollout

Call `gate()` to choose a path. Keep the current implementation as the fallback if the SDK request fails. Call `exposeGate()` after the application has committed to the selected path; this records both enabled and disabled exposures for comparison. Exposure and health reporting are telemetry and must not block the product path.

```ts
async function showAlerts() {
  const allocation = { kind: "installation", id: installationID } as const;
  let enabled: boolean;
  try {
    enabled = await aperture.gate("enhanced-alerts", allocation);
  } catch {
    // Keep the established experience on network or SDK failure.
    await renderCurrentAlerts();
    return;
  }

  // Record the selected arm, but never delay the experience for telemetry.
  await aperture
    .exposeGate("enhanced-alerts", enabled, allocation)
    .catch(() => {});
  if (enabled) await renderEnhancedAlerts();
  else await renderCurrentAlerts();
}
```

## If Aperture is unavailable

`gate()` waits for the API request and then rejects on a network/server error. The default request timeout is five seconds (`timeoutMs` can override it). If there is no valid in-memory decision, a cold start can therefore wait up to that timeout before the app reaches its fallback. Always catch the evaluation error and run the existing product behavior; if the error is not caught, the SDK does not choose a fallback for you.

Successful decisions are cached in memory until the server-provided expiry, so repeated calls in the same running client can return immediately. Persistent offline reuse is opt-in with `offlineDecisionTtlMs`; when enabled, it still checks the server first and only uses a stored decision after a transient failure. A previously enabled decision may keep a faulty feature enabled while the service is unreachable, so the remote kill switch cannot take effect on that client until it reconnects. A cached disabled decision may keep the new feature off. Choose a short TTL or leave offline reuse disabled when honoring a remote disable quickly matters more than continuity.

Experiments do not use the rollout offline-decision cache. If `getVariant()` fails, render the app's existing safe experience and skip exposure; do not invent an assignment locally. Likewise, catch failures from `exposeGate()`, `reportGateHealth()`, and crash/event reporting so telemetry outages cannot interrupt an already selected product path.

For a browser or Chrome extension, `gate(key)` may omit the allocation. Aperture creates and persists an anonymous allocation ID. `getAnonymousAllocation()` returns that same ID and kind so an app can display a copyable support or beta-enrollment identifier. Treat it as pseudonymous user data, not as a credential. Supply a stable allocation explicitly when the feature belongs to a user, account, or organization. Do not generate a new random ID for each page view or request.

```ts
const allocation = await aperture.getAnonymousAllocation();
showCopyableSupportID(allocation.id);
```

When using this ID in a channel allowlist, select the `anonymous` allocation type. The app must use the same SDK project key when evaluating the gate because the default anonymous ID is persisted per publishable key.

Use `reportGateHealth()` for a failure observed after a matching gate exposure. The SDK verifies that a decision exists and sends its config version and enabled/disabled arm; the API rejects health that does not match a recorded exposure.

```ts
try {
  await runSelectedAlerts();
} catch (error) {
  await aperture.reportGateHealth(
    "enhanced-alerts",
    {
      eventId: crypto.randomUUID(),
      name: "alerts-render-failed",
      severity: "error",
      exception:
        error instanceof Error
          ? { type: error.name, message: error.message, stack: error.stack }
          : { type: "Error", message: String(error) },
    },
    allocation,
  );
  throw error;
}
```

Report comparable failures for both arms. Use a fresh event ID for each new occurrence and reuse that ID only when retrying the same event. Keep event names stable and low-cardinality; put bounded diagnostic details in `properties` and structured exception fields. Never send tokens, secrets, or user content that the operator should not see.

## Log an exception outside a gate

Service-worker startup errors, unhandled rejections, and React error boundaries often cannot be attributed to one rollout. Send those with `reportCrash()` or its convenience wrapper `captureException()`; do not invent a gate key.

```ts
self.onunhandledrejection = (event) => {
  void aperture
    .captureException(event.reason, {
      name: "service-worker-unhandled-rejection",
      severity: "fatal",
      properties: { source: "background" },
    })
    .catch(() => {
      // Crash reporting must not throw from the global handler.
    });
};
```

`captureException()` normalizes both `Error` and non-`Error` values and uses the existing crash endpoint, payload limits, and deduplication. It does not install global handlers, keep a local crash log, or retry forever. Install global handlers only at application boundaries where the product owner intends to report those failures.

The Event stream can filter health signals and crashes by allocation ID. The operator must already have the ID; Aperture stores a keyed hash rather than the raw ID. Exception text and stack traces can contain sensitive data, so scrub them before reporting.

## Measure experiment conversions

An experiment has three separate calls:

1. `getVariant(experimentKey, stableUserID)` asks for the assigned variant.
2. `expose(experimentKey, stableUserID, displayedVariant)` records that the user actually saw it.
3. `track(eventID, stableUserID, eventName, value?)` records the real conversion when it occurs.

Example for a purchase conversion:

```ts
const userID = user.id; // Stable across sessions and requests.
let variant: string | null;

try {
  variant = await aperture.getVariant("checkout-copy", userID);
} catch {
  renderCheckout("control"); // Your fallback; do not record fallback exposure.
  return;
}

if (!variant) {
  renderCheckout("control"); // This user was outside the experiment audience.
  return;
}

renderCheckout(variant);
await aperture.expose("checkout-copy", userID, variant);

// Call this at the actual purchase-success boundary, not on page render.
await aperture.track(crypto.randomUUID(), userID, "purchase", order.total);
```

Use exactly the same user ID for assignment, exposure, and event tracking. Emit conversion events only when the conversion happens. For binary metrics, event presence is the outcome (the numeric value is ignored); for count metrics Aperture counts events; for continuous metrics it sums the supplied numeric value per user. Configure the metric type and event name to match the code.

Await exposure before a conversion that could occur immediately. Keep the event ID stable when retrying an event; Aperture deduplicates it within the project. Do not emit an event on every render or send assignment/exposure events as fake conversions.

## Verify the wiring

After integrating, check the workspace Event stream for the event name and user/allocation identity. For experiments, verify the dashboard shows assignment and exposure counts, then trigger a real conversion and confirm that the linked metric receives it. Test the network-failure fallback, duplicate event retry, and current/control experience. Run the application's existing tests before starting traffic.

The SDK reference and current API boundaries are also summarized in [the README](../README.md) and [agent integration checklist](AGENT_INTEGRATION.md).
