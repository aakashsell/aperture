# Draft: Beta groups and rollouts

**Purpose:** agree on the user journey and wording before building a public documentation page on the landing site.

**Audience:** solo developers, vibe coders, and lean teams who want a small group to try a change before everyone else.

**Proposed page:** `https://aperture.bazement.net/docs/` with a “Guides” link in the landing page navigation and footer. The page must say if a feature is not available in the currently deployed app; documentation cannot make an undeployed feature appear.

## The explanation users need first

> A **channel** chooses who is eligible for a change. A **rollout** decides whether the gated code is enabled for those people.

A channel by itself changes nothing in the app. A rollout by itself can target everyone or a channel. For a named beta group, put those testers in a channel, attach the rollout to it, and start the rollout. Set the rollout to 100% when every beta member should receive the change.

## User journey

### 1. The app owner configures Aperture once

The product developer initializes the SDK with the API URL and publishable key in the app build. Beta testers do not install Aperture, create dashboard accounts, or paste credentials into a settings screen.

```ts
const aperture = new Aperture({
  apiUrl: APERTURE_API_URL,
  publishableKey: APERTURE_PUBLISHABLE_KEY,
});
```

For a browser extension, the build pipeline can inject these public values into the extension bundle. A publishable key is intentionally client-visible; it is not an admin credential. The app must fail safely to its current behavior if a gate request fails.

### 2. Choose the kind of test group

First ask one plain question:

- **Specific people/devices:** use an allowlist of their stable allocation IDs.
- **A random canary slice:** use random fill, such as 5% or 10%, without listing individuals.

These are different promises. “Beta testers” usually means a named allowlist. Random fill means a stable random fraction of the eligible population, not a hand-picked list.

### 3. Make sure the app has a stable identity

The channel must use the exact allocation kind and ID the app sends when it evaluates the gate. Examples:

| App sends to Aperture | Channel allocation type | Value to add to allowlist |
| --- | --- | --- |
| `{ kind: "user", id: account.id }` | `user` | That same account ID |
| `{ kind: "installation", id: installId }` | `installation` | That same installation ID |
| SDK-generated persistent identity from `gate(key)` with no ID argument | `anonymous` | The exact SDK identity, if the app can surface it |

Do not use an email address unless the app itself sends that exact value as its allocation ID. Do not paste a newly invented ID or a hashed ID.

**Known usability gap to resolve before publishing this as an easy workflow:** Aperture’s SDK creates a persistent anonymous ID by default, but the public client API does not currently give the developer a clear way to retrieve it. A named beta allowlist is awkward unless an app already displays its own stable ID or explicitly passes one to Aperture. The docs should offer random fill as the alternative and should not pretend this ID-discovery problem is solved.

### 4. Create the channel

In the app, open **Settings & setup → Channels**:

1. Name the group, for example `Beta testers`.
2. Pick the allocation type that matches the app integration.
3. For named testers, paste their stable IDs, one per line, and set **Random fill** to `0%`.
4. For a random canary, leave the allowlist empty and set the desired random fill.
5. Create the channel.

The server hashes allowlisted IDs for storage. Developers enter the original IDs from their app; they should never try to calculate or paste Aperture’s hashes.

### 5. Connect the rollout to the channel

In **Rollouts → New rollout**:

1. Name the change and describe the new code path and its safe fallback.
2. Select the channel under **Release channel**.
3. Set the rollout audience percentage.
   - `100%` means all allocations eligible through the channel receive the enabled decision.
   - `10%` means only about 10% of the channel-eligible allocations receive it.
4. Create the rollout. It remains off until a person starts it.

The two percentages do separate jobs: channel random fill selects an eligible population; rollout percentage selects the enabled share inside that population.

### 6. Start and verify

The app integration should call the gate before choosing the new or existing path, keep the existing path as fallback, and record exposure after committing to the path. Report comparable health for both paths.

The operator reviews the gate, starts the rollout, then checks assignment/exposure and health in Aperture. A beta channel is not a substitute for automated tests, and “no health flags” is not a guarantee of safety.

### 7. Expand after beta

The current product binds a rollout to the selected channel. To extend that same rollout to all allocations, increase that channel’s **Random fill** to `100%`; at 100% fill, every allocation of the matching kind is channel-eligible. Keep rollout at 100% to enable for all, or keep rollout lower to continue a gradual release. Explain this carefully in the UI before changing fill because it can broaden the release to the full population.

## Proposed docs page layout

1. **Top summary:** “Channel = who is eligible. Rollout = whether the change is enabled.”
2. **Make a beta group:** short numbered steps for IDs → channel → rollout → start.
3. **Two percentages, one example:** channel fill versus rollout percentage with a concrete cohort illustration.
4. **Which ID do I use?:** identity type table and the default-anonymous limitation.
5. **After the beta:** how broadening channel fill affects the rollout.
6. **What to check:** the integration uses a fallback, records exposure, reports health, and the operator verifies evidence.
7. **Related guides:** SDK integration, crash/health logging, and experiments.

The first paragraph and a small “Channel vs rollout” explanation should also appear near the corresponding setup controls in the product, because many users will not open external docs while creating a rollout.

## Decisions to review before implementation

- Is `https://aperture.bazement.net/docs/` the right route, or should docs live on GitHub Pages / in the repo and be linked from the landing page?
- Should the SDK add a documented method to read its default anonymous allocation ID, or should examples encourage apps to pass their own stable user/installation ID for named beta groups?
- Is expanding the channel’s random fill to 100% the intended production rollout path, or should a rollout be re-targetable to another channel / all allocations?
- Should the UI explain that the channel only makes a user eligible and the rollout must still be started?

## Feedback from Daia: extension onboarding implications

Daia is a consumer Chrome extension preparing a 10–20 person beta. Its testers are non-technical, so the intended flow must configure Aperture once in the extension build. Testers should never paste an API URL or publishable key into the extension's settings. Include a build-time configuration example and state plainly that the publishable key is safe to bundle while admin secrets are not.

The feedback also identifies product work beyond the docs page:

| Feedback | Implication for onboarding / product | Draft treatment |
| --- | --- | --- |
| Tester setup requires manual URL/key entry | Remove tester-side configuration; configure the SDK in the app build once. | Make this step first and explicit. |
| A beta group is only 10–20 people | The exact allowlist needs stable installation IDs that the developer can collect. | Name the allocation ID discovery gap; don't claim docs solve it. |
| Default extension identity is persisted in `chrome.storage.local` | The SDK owns an anonymous ID, but integrations need a practical way to surface/copy it for support and allowlisting. | Decide whether the app supplies its own installation ID or the SDK adds a safe identity inspection API. |
| Publishable key is too broad across products | A key is currently tied to one Aperture project/workspace, but allows all gates in that project; it does not restrict gate prefixes. | Use separate workspaces/projects as today's boundary; record per-app or per-gate key scopes as future access-control work. |
| SDK is reported as ~10 KB gzipped | A docs page should not claim it is negligible. Measure the built artifact and consider an evaluate-only entry point if size is confirmed. | Add bundle-size measurement to product validation, not the first beta instructions. |
| Ramps do not update until cache expiry | SDK supports explicit `refresh`; the server config version is authoritative when the client next evaluates. Push updates or a shorter default TTL are later responsiveness work. | Document manual refresh only if the app needs immediate reevaluation; don't promise live push. |
| Built-in health metric templates | Templates may ease setup but require domain-neutral definitions and clear semantics. | Keep the beta guide focused on reporting real failures and exposures; evaluate templates separately. |
| Hosted CDN and pricing interest | A single integration report is useful demand evidence, not a launch commitment. | Keep hosting roadmap and pricing claims separate from the setup guide. |

### Extension-specific safety rule

Do not make an `extension` mode automatically expose every gate evaluation. Evaluating a gate does not prove that a user saw or used the feature. Keep exposure explicit and record it after the gated experience is actually shown or committed. An extension mode could later supply Chrome storage, an appropriate refresh policy, and offline configuration, but it must preserve that distinction.

## Source guides to incorporate

- [Agent integration guide](AGENT_INTEGRATION.md)
- [Telemetry guide](TELEMETRY_GUIDE.md)
- [Workspace guide](WORKSPACES.md)
- [Resource lifecycle guide](RESOURCE_LIFECYCLE.md)
- [Integration feedback roadmap](INTEGRATION_FEEDBACK_ROADMAP.md)
