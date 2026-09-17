# Aperture

**Ship safely. Learn what works. Trust the result.**

Aperture is open-source developer infrastructure for safely rolling out and experimenting on software. Release a real change to 5% of users, compare its health with the current behavior, and expand it with confidence. Then test whether the change is actually better.

**Built for people. Ready for agents.** Tell your coding agent what to protect, let it integrate the gate and health signals, then review and control every release change yourself.

Open source · Cross-platform by design · TypeScript · Your data in your Postgres

## From a prompt to a safe rollout

> Add rollout protection to the new sync implementation. Start at 5% of installations, keep the current sync as the fallback, and report failures to Aperture.

1. **You define the release:** create a rollout off by default and choose its initial audience.
2. **Your agent connects the app:** follow the [agent integration guide](docs/AGENT_INTEGRATION.md) to install the SDK, gate the new path, and report exposure and failures.
3. **You review and start:** activate at 5%, compare observed health with the current path, then explicitly confirm each increase up to 100%.

Allocation is deterministic: an installation enabled at 5% remains enabled as the rollout expands to 25%, 50%, and 100%. Aperture stores a keyed hash of the allocation ID rather than its raw value. Disabling a rollout makes new server evaluations return the current behavior; SDK decisions are cached for up to 30 seconds.

The dashboard reports **collecting evidence**, **no health flags observed**, or **needs review**. These are operational diagnostics based on explicit exposure and failure signals, not a guarantee that a release is safe.

## Then learn whether it is better

A bigger lift can also mean broken tracking. Aperture shows per-variant exposure coverage, checks assignment balance, and withholds effect intervals when integrity issues need review. These diagnostics flag issues to investigate; they do not guarantee an unbiased experiment. Try `/demo` for healthy and broken scenarios using clearly labeled simulated data.

## One release and experimentation layer, alongside your app

Keep your hosting provider, application database, and coding agent. Connect through the TypeScript SDK and HTTP API; Aperture stores experiment data in Postgres.

**Verified here:** the actual TypeScript SDK → Go API → Postgres → worker/results pipeline, Next.js browser workflows, and assignment/exposure/project-isolation checks. **Not yet benchmarked:** external starter repositories, hosting combinations, and autonomous coding-agent integrations. No third-party compatibility certifications are claimed.

**Alpha install:** the SDK is built and installed from this repository, not yet published to npm. Experiment creation and activation currently require dashboard login.

## Is Aperture for you?

Aperture is for solo builders, vibecoders, and lean teams who want release safety and experimentation to be part of shipping:

- **Ship without breaking everyone:** expose a real code path to a small, stable audience, watch its health, then expand or turn it off.
- **Build with a coding agent:** turn an idea into a clear hypothesis, use the integration guide, and check whether the change helps users.
- **Optimize a product that is getting serious:** measure signup, onboarding, pricing, or checkout improvements without needing a dedicated experimentation team.

A smaller test audience limits exposure to a change; it does not replace software testing. Reliable conclusions still require enough traffic and a planned stopping rule.

## Open-source core, flexible hosting

The core product—the rollout and experiment engines, TypeScript SDK, dashboard, and statistics worker—is open source under the [MIT license](LICENSE), with [instructions to run it yourself](#start-locally). Self-hosting does not require a paid plan.

Our intended offerings include:

| Option | What you manage | Status |
|---|---|---|
| Self-host the open-source core | Aperture and your Postgres database | Available in alpha |
| Full hosting | Your application; we would host Aperture and its experiment database | Planned |
| Hosted Aperture with your database | Your Postgres; we would operate the Aperture service | Planned |
| Custom solutions | Integrations, deployments, and other company-specific work scoped together | Individually scoped |

Hosted offerings are planned. Availability, pricing, and engagement terms will be announced separately; these options do not change the core’s MIT license.

## Start locally

```sh
git clone https://github.com/aakashsell/aperture.git
cd aperture
make dev
```

Requires Docker with Compose. Open http://localhost:3000 for the landing page, `/demo` for a labeled simulation, or `/app` to create an account and workspace. No default project or shared account is seeded. Existing ownerless projects are retained but require an administrator to assign an owner using `scripts/assign-owner.sql` after the owner registers.

## Public deployment with Dokploy

The landing page and product app are separate Compose deployments from this repository, so they can be released and scaled independently while sharing the same codebase:

| Dokploy deployment | Compose file | Services |
|---|---|---|
| `aperture-core` | `docker-compose.production.yml` | App UI, API, Postgres, migrations, and worker |
| `aperture-site` | `docker-compose.site.yml` | Public landing page and interactive demo |

Create both Compose deployments in the same Dokploy project and connect them to the `main` branch of this GitHub repository. Traefik labels route `aperture-app.bazement.net` to the app UI and `aperture.bazement.net` to the landing service, each on port `3000`. Set `POSTGRES_PASSWORD` and a random 32-byte-or-longer `JWT_SECRET` as secrets on the core deployment. Set `APP_URL=https://aperture-app.bazement.net` on the site deployment. Keep the database and API private; only the app UI and landing service are public. A persistent `aperture-data` volume stores Postgres data.

The public landing service serves `/` and `/demo`; app routes sent to it redirect to the separately hosted app. The app service serves `/app` and its management API proxy. Both Compose files build the production Next.js image, while the core's `app` service can be scaled separately from the landing service, API, worker, and database.

For local development without Docker, create a Postgres database named `aperture`, then run `./scripts/dev-local.sh`. Requires Go 1.22+, Node 20+, Python 3.12, and Postgres 15+. The script creates a Python virtual environment and starts all three services.

## Connect an app

Build and install the SDK from your checkout (it is not published to npm yet):

```sh
cd sdks/ts
npm install
npm run build
# From your application directory:
npm install /absolute/path/to/aperture/sdks/ts
```

Create a rollout in `/app`; it starts off with a 5% target. Copy your publishable key from Settings, integrate the gate, then explicitly start it from the rollout detail page.

### Chrome extension rollout

Add `"storage"` to your extension permissions and the Aperture API origin to `host_permissions`. When no allocation unit is passed, the SDK generates an anonymous ID once and persists it in `chrome.storage.local`, so each installation receives a stable decision without requiring your own identity system.

```ts
import { Aperture } from '@aperture/sdk';

const aperture = new Aperture({
  apiUrl: 'https://your-aperture-api.example',
  publishableKey: 'ap_pub_YOUR_PROJECT_KEY',
});

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

Call `exposeGate()` only after the application commits to the selected code path. Report comparable failures for both enabled and current paths; this lets Aperture compare observed installation-level failure rates for the exact configuration version.

Unhandled exceptions can be reported without choosing a gate. `reportCrash()` accepts structured exception details, keeps a short in-memory deduplication window, and the API groups repeated matching reports from the same installation into a five-minute count. Reports are visible in the authenticated workspace Event stream; installation-specific lookup requires a dashboard session.

```ts
self.onerror = (_message, _source, _line, _column, error) => {
  void aperture.reportCrash({
    eventId: crypto.randomUUID(),
    name: 'uncaught',
    severity: 'fatal',
    exception: {
      type: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      stack: error?.stack,
    },
  }).catch(() => {}); // Keep global error handlers best-effort.
};
```

Stack traces are capped at 32 KiB and messages at 4 KiB. Treat exception text and properties as potentially sensitive; avoid attaching tokens or user content.

Server, account, or signed-in clients can pass an explicit allocation unit such as `{ kind: 'installation', id: installationID }`. Browser and extension calls may omit it to use Aperture's persistent anonymous allocation.

### Experiment integration

Create an experiment in `/app`, choose its primary metric, then start it.

```ts
import { Aperture } from '@aperture/sdk';

const ap = new Aperture({
  apiUrl: 'http://localhost:8000',
  publishableKey: 'ap_pub_YOUR_PROJECT_KEY',
  onError: console.error,
});

let variant: string | null = null;
try {
  variant = await ap.getVariant('checkout', user.id);
} catch {
  // Choose your application's safe fallback. Do not record a fallback as an exposure.
}
renderCheckout(variant ?? 'control');
if (variant) await ap.expose('checkout', user.id, variant);

// Only emit purchase when it actually happens. A zero-valued purchase still counts
// as a conversion for binary metrics because binary metrics measure event presence.
await ap.track(crypto.randomUUID(), user.id, 'purchase', 49.99);
```

Await exposure before dependent events. Preserve event IDs when retrying; events are deduplicated per project. Requests reject on HTTP/network errors and time out after 5 seconds by default. `getVariant()` is asynchronous and always checks the server; the SDK remembers the last returned variant only to support exposure validation.

After rollout, assignments return the selected feature variant for everyone. Stop calling `expose()` for completed experiments: rollout decisions are not new experimental exposures.

See [agent integration instructions](docs/AGENT_INTEGRATION.md) for a repeatable integration checklist.

## Guarantees and lifecycle

- **Draft:** no assignments; primary metric required before starting.
- **Running:** persist new assignments, accept matching exposures, collect events.
- **Paused:** existing users keep their assignment; new users receive no assignment. Existing exposures and outcomes continue to count.
- **Completed:** return the rollout variant without changing experiment assignment history. No new exposures. Outcomes are cut off at completion.
- Variant definitions and metric links freeze at first start. Overrides only affect users who have not yet been assigned.
- Management routes require a dashboard session. Publishable keys only permit assignment, exposure, and ingestion; they are not proof that an event originated from a trusted user.
- Creation with an inline primary metric and batch ingestion are transactional. Invalid batches reject entirely.

## Results

Metrics use exposed users, including zeros for users without matching events. Binary metrics count event presence; count metrics count events; continuous metrics sum event values per user. Queries always include the project.

The outcome window starts at first exposure and ends at the earlier of the configured 1–90 day window (default 7) or experiment completion. Late events are incorporated until the first worker aggregation after a 24-hour grace period. Completed cohorts then freeze.

No inferential output is shown below 30 users in either arm. This threshold is an operational safeguard, not a guarantee of adequate statistical power. Binary metrics use Fisher's exact test and conservative intervals formed from simultaneous exact binomial intervals. Continuous/count metrics use deterministic percentile bootstrap intervals and do **not** report a placeholder p-value. Degenerate continuous samples have no interval. MDE is an approximate absolute effect estimate using both arm sizes.

These are fixed-horizon estimates, not sequential stopping rules. There is no multiple-comparison correction or automatic winner selection. Plan your sample size and stopping rule before looking for a winner. SRM compares assignment counts with configured allocation weights; low-count multi-arm SRM may be unavailable. The dashboard also compares per-variant exposure coverage: a gap of at least 5 percentage points with a two-proportion diagnostic p-value below 0.001 (at least 30 assignments per arm) triggers review and withholds effect intervals. This is a heuristic diagnostic, not proof of instrumentation bias; equal low coverage alone does not trigger it.

Statistical references: [SciPy exact tests](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.fisher_exact.html), [exact binomial intervals](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html).

## Architecture

| Component | Responsibility |
|---|---|
| Go API | Authentication, project isolation, immutable assignment, validated ingestion, lifecycle |
| Postgres | Source of truth, transactions, event deduplication, worker coordination |
| Python worker | Set-based aggregation, uncertainty estimates, SRM, heartbeat |
| Next.js | Landing `/`, simulation `/demo`, workspace `/app`, same-origin API proxy |
| TypeScript SDK | Server-authoritative rollout and experiment decisions, stable Chrome/browser identity, and explicit exposure/health/event reporting |

The worker runs every 30 seconds, uses a Postgres advisory lock to prevent overlapping workers, and closes connections even on failures. Event Stream shows its last completed cycle. Aggregation batches in SQL and skips settled cohorts; bootstrap computation still scales with exposed users and should be load-tested for your workload.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | API, worker, migrations | Postgres connection |
| `JWT_SECRET` | API | Required signing secret, minimum 32 characters |
| `APP_ENV` | API | Set `production` for Secure session cookies |
| `PORT` | API | Defaults to 8000 |
| `API_URL` | Next.js | Internal proxy target, defaults to http://localhost:8000; Compose uses http://api:8000 |
| `WORKER_INTERVAL_SECONDS` | Worker | Defaults to 30 |
| `MIGRATIONS_DIR` | Migration runner | Defaults to /migrations |

Compose is a development configuration with a development-only signing secret and exposed database port. Production deployment requires your own strong secret, TLS, Secure cookies, restricted database access, and operational configuration. No production deployment is included here.

## Verification

```sh
make test-api
python3 -m unittest discover -s worker -p 'test_*.py'
# With the web dependencies installed:
services/web/node_modules/.bin/tsc -p sdks/ts/tsconfig.json
node --test sdks/ts/tests/sdk.test.cjs
make test-integration
```

Integration tests create isolated projects and never reset the database. CI checks Go, SDK behavior, worker statistics, the real API/Postgres pipeline, the web production build, and browser workflows. The live SDK test (`node sdks/ts/tests/live.cjs`, with `API_URL` and `DATABASE_URL` set) exercises the actual built SDK through worker results.

## License

MIT
