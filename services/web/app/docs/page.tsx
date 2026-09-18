import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Code2,
  Radio,
  Rocket,
  Users,
} from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Beta groups & rollouts — Aperture Docs",
  description:
    "Set up a beta group, connect it to a rollout, and ship a gated change safely.",
};

const steps = [
  {
    icon: Code2,
    title: "Configure the app once",
    body: "The developer adds the Aperture API URL and publishable key to the app build. Beta testers do not need an Aperture account or setup screen.",
  },
  {
    icon: Users,
    title: "Choose who is in beta",
    body: "Use a stable account or installation ID for named testers, or choose a deterministic random slice for a canary group.",
  },
  {
    icon: Radio,
    title: "Create a channel",
    body: "In Settings & setup → Channels, choose the matching allocation type. Add tester IDs with 0% random fill, or set random fill for a canary.",
  },
  {
    icon: Rocket,
    title: "Attach and start a rollout",
    body: "Create a rollout, select the channel, and choose the share of eligible people who should receive the change. Start it only after reviewing the integration.",
  },
];

export default function DocsPage() {
  return (
    <div className="docs-page">
      <header className="docs-nav">
        <Link href="/" className="docs-brand">
          <span className="brand-mark">a</span> aperture <span>DOCS</span>
        </Link>
        <nav aria-label="Documentation navigation">
          <Link href="/">Home</Link>
          <a href="https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md">
            SDK integration <ArrowUpRight size={14} />
          </a>
          <Link className="button small" href="/app">
            Open workspace <ArrowRight size={14} />
          </Link>
        </nav>
      </header>

      <div className="docs-main-content">
        <section className="docs-hero">
          <Link href="/" className="docs-back">
            <ArrowLeft size={14} /> Aperture home
          </Link>
          <span className="eyebrow">
            <BookOpen size={14} /> START HERE
          </span>
          <h1>Beta groups and rollouts, explained.</h1>
          <p>
            A <strong>channel</strong> chooses who is eligible for a change. A{" "}
            <strong>rollout</strong> decides whether the gated code is enabled
            for those people.
          </p>
          <div className="docs-hero-note">
            <CircleHelp size={18} /> A channel alone does not turn a feature on.
            You also create and start a rollout.
          </div>
        </section>

        <section className="docs-content" id="beta-group">
          <div className="docs-main">
            <div className="docs-section-heading">
              <span className="eyebrow">THE FIRST BETA</span>
              <h2>Set up a group of beta testers</h2>
              <p>
                For a closed beta, the app owner does the Aperture setup.
                Testers simply use the app or extension as usual.
              </p>
            </div>
            <div className="docs-steps">
              {steps.map(({ icon: Icon, title, body }, index) => (
                <article className="docs-step" key={title}>
                  <span className="docs-step-number">0{index + 1}</span>
                  <div className="docs-step-icon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="docs-example">
              <div>
                <span className="eyebrow">NAMED BETA EXAMPLE</span>
                <h3>Enable a change for every listed tester</h3>
                <p>
                  Create a channel with the tester IDs and 0% random fill. Link
                  the rollout to that channel and set the rollout audience to
                  100%. The gate still starts off; explicitly start it after
                  checking the integration.
                </p>
              </div>
              <div
                className="docs-equation"
                aria-label="Channel and rollout relationship"
              >
                <div>
                  <small>CHANNEL</small>
                  <strong>Beta testers</strong>
                  <span>Who is eligible</span>
                </div>
                <b>+</b>
                <div>
                  <small>ROLLOUT</small>
                  <strong>100% · Started</strong>
                  <span>Turns on the new code</span>
                </div>
              </div>
            </div>

            <section className="docs-section" id="allocation-id">
              <span className="eyebrow">MAKE IDENTITIES MATCH</span>
              <h2>Use the same ID your app sends</h2>
              <p>
                The channel’s allocation type and ID must exactly match the
                value used by the app when it calls the gate. Don’t use an
                email, a newly invented ID, or a database hash.
              </p>
              <div className="docs-identity-grid">
                <div>
                  <strong>Using the SDK default?</strong>
                  <p>
                    <code>gate(key)</code> creates a persistent anonymous ID in
                    Chrome storage. Use <code>getAnonymousAllocation()</code> to
                    display a copyable beta/support ID in your app, and choose
                    the <code>anonymous</code> channel type.
                  </p>
                </div>
                <div>
                  <strong>Already have an install or account ID?</strong>
                  <p>
                    Pass that stable ID into <code>gate(key, allocation)</code>
                    and add the exact same ID under the matching type, such as{" "}
                    <code>installation</code> or <code>user</code>.
                  </p>
                </div>
              </div>
              <pre className="docs-code">{`const allocation = await aperture.getAnonymousAllocation();
showCopyableBetaID(allocation.id);

const enabled = await aperture.gate("libre-cgm");
await renderSelectedExperience(enabled ? "libre" : "current");
await aperture.exposeGate("libre-cgm", enabled);`}</pre>
              <p className="docs-caption">
                Only record exposure after the experience is actually shown or
                selected. Keep the existing feature as the fallback.
              </p>
            </section>

            <section className="docs-section" id="percentages">
              <span className="eyebrow">TWO PERCENTAGES, TWO JOBS</span>
              <h2>Channel fill is not rollout percentage</h2>
              <div className="docs-compare">
                <article>
                  <span>1 · CHANNEL RANDOM FILL</span>
                  <h3>Chooses the eligible group</h3>
                  <p>
                    An allowlist selects specific IDs. Random fill selects a
                    stable random share of other matching IDs.
                  </p>
                </article>
                <article>
                  <span>2 · ROLLOUT AUDIENCE</span>
                  <h3>Controls who gets the enabled decision</h3>
                  <p>
                    100% enables the feature for everyone eligible through that
                    channel. 10% enables it for about 10% of the channel group.
                  </p>
                </article>
              </div>
              <p>
                For a named beta, use allowlisted IDs with 0% fill and a 100%
                rollout. For a random canary, use random fill to choose the
                group; don’t promise an exact headcount from a random
                percentage.
              </p>
            </section>

            <section className="docs-section" id="expand">
              <span className="eyebrow">AFTER THE BETA</span>
              <h2>Expand when the evidence supports it</h2>
              <p>
                The current rollout stays attached to its channel. To make every
                matching installation eligible, raise that channel’s random fill
                to 100%. This broadens every rollout attached to the channel, so
                verify its impact before saving. You can also lower the rollout
                percentage first to continue a gradual release.
              </p>
              <div className="docs-callout">
                <Check size={18} />
                <span>
                  “No health flags observed” means Aperture has not received a
                  reported issue. It is not proof that the feature is safe.
                </span>
              </div>
            </section>

            <section className="docs-section" id="common-questions">
              <span className="eyebrow">COMMON QUESTIONS</span>
              <h2>Quick answers</h2>
              <details>
                <summary>
                  Do I have to create a rollout after a channel?
                </summary>
                <p>
                  Yes. The channel only selects who is eligible. Create a
                  rollout, attach the channel, and start the rollout to enable
                  the gated code.
                </p>
              </details>
              <details>
                <summary>Do beta testers need an Aperture account?</summary>
                <p>
                  No. The developer configures Aperture once in the app. The
                  publishable key is intended for client code; never bundle
                  dashboard credentials or server secrets.
                </p>
              </details>
              <details>
                <summary>
                  Does Aperture download the new feature into Chrome?
                </summary>
                <p>
                  No. Package the feature in the reviewed extension build.
                  Aperture returns a decision that selects between code paths
                  already shipped in your app.
                </p>
              </details>
            </section>
            <section className="docs-section" id="sdk-setup">
              <span className="eyebrow">SDK QUICKSTART</span>
              <h2>Connect an app in a few lines</h2>
              <p>
                The alpha SDK is built from the open-source checkout (it is not
                published to npm yet). Create a project in your Aperture
                workspace, copy its publishable key, and configure both values
                in the app build. Keep dashboard credentials on the server.
              </p>
              <pre className="docs-code">{`# In the Aperture checkout\ncd sdks/ts\nnpm install\nnpm run build\n\n# In your app: install the local SDK package\nnpm install /path/to/aperture/sdks/ts`}</pre>
              <pre className="docs-code">{`import { Aperture } from "@aperture/sdk";\n\nexport const aperture = new Aperture({\n  apiUrl: "https://your-aperture-host/api",\n  publishableKey: "ap_pub_YOUR_PROJECT_KEY",\n});`}</pre>
              <p>
                In an extension, declare Chrome storage and API host
                permissions. Bundle both old and new feature code in the
                reviewed extension package; Aperture sends a decision and never
                downloads executable code.
              </p>
              <a
                className="text-button"
                href="https://github.com/aakashsell/aperture/blob/main/README.md"
              >
                Installation and self-hosting in the README{" "}
                <ArrowUpRight size={14} />
              </a>
            </section>
            <section className="docs-section" id="agent-workflow">
              <span className="eyebrow">
                BUILT FOR PEOPLE, READY FOR AGENTS
              </span>
              <h2>Make experiments part of how you build</h2>
              <p>
                Tell your coding agent what you want to change and what you want
                to learn. The agent can inspect the app, install Aperture from
                the checkout, add the gate and real exposure/conversion signals,
                and run the app’s checks. You choose the audience, review the
                code, and explicitly start or expand the rollout.
              </p>
              <pre className="docs-code">{`"Use Aperture to test the new pricing page.\nKeep the current page as the fallback.\nTrack checkout completion as the conversion.\nAdd exposure only after the selected page renders,\nand show me the files and checks before starting."`}</pre>
              <p>
                Aperture is a first-class release and measurement layer in the
                workflow: gates protect the change, exposures record what was
                shown, and events capture the outcome. An agent must not start
                or widen a live rollout without your approval.
              </p>
              <a
                className="text-button"
                href="https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md"
              >
                Agent integration checklist <ArrowUpRight size={14} />
              </a>
            </section>
            <section className="docs-section" id="health-events">
              <span className="eyebrow">HEALTH AND EXPERIMENT EVENTS</span>
              <h2>Log what actually happened</h2>
              <p>
                A gate decision is not exposure, exposure is not conversion, and
                a crash may have no gate. Keep those signals separate so the
                dashboard can explain what users experienced. Never send glucose
                readings, health records, tokens, or other sensitive user
                content as telemetry; send only the minimum operational signal
                your privacy disclosures cover.
              </p>
              <div className="docs-identity-grid">
                <div>
                  <strong>Rollout health</strong>
                  <p>
                    Call <code>exposeGate()</code> after selecting and showing
                    the path. Report a failure tied to that decision with{" "}
                    <code>reportGateHealth()</code>.
                  </p>
                </div>
                <div>
                  <strong>Unhandled crashes</strong>
                  <p>
                    Use <code>captureException()</code> or{" "}
                    <code>reportCrash()</code> when an error has no gate
                    attribution. Scrub personal data from messages and stacks.
                  </p>
                </div>
                <div>
                  <strong>Experiment conversion</strong>
                  <p>
                    Assign with <code>getVariant()</code>, expose after
                    rendering with <code>expose()</code>, and call{" "}
                    <code>track()</code> at the actual conversion boundary.
                  </p>
                </div>
                <div>
                  <strong>Verify the signal</strong>
                  <p>
                    Check Events for the expected name and allocation, then
                    verify matching exposure and metric counts before sending
                    real traffic.
                  </p>
                </div>
              </div>
              <pre className="docs-code">{`// Gate-independent service-worker exception\nself.onunhandledrejection = (event) => {\n  void aperture.captureException(event.reason, {\n    name: "service-worker-unhandled-rejection",\n    severity: "fatal",\n  }).catch(() => {});\n};\n\n// Send only when the purchase succeeds\nawait aperture.track(crypto.randomUUID(), user.id, "purchase", order.total);`}</pre>
              <a
                className="text-button"
                href="https://github.com/aakashsell/aperture/blob/main/docs/TELEMETRY_GUIDE.md"
              >
                Full health and event guide <ArrowUpRight size={14} />
              </a>
            </section>
            <section className="docs-section" id="workspace-operations">
              <span className="eyebrow">WORKSPACES AND CLEANUP</span>
              <h2>Keep projects separate and manageable</h2>
              <p>
                A workspace owns its rollouts, experiments, channels, events,
                metrics, and publishable SDK key. Switch workspaces from the
                dashboard sidebar; configure each deployed app with the key for
                the intended workspace.
              </p>
              <p>
                Archive a rollout or experiment to stop active use while
                preserving its history. Permanent deletion removes
                resource-owned data and requires typing the exact key. Stop a
                running rollout or experiment before deleting it.
              </p>
              <div className="docs-identity-grid">
                <a href="https://github.com/aakashsell/aperture/blob/main/docs/WORKSPACES.md">
                  <strong>Workspace access and switching</strong>
                  <p>
                    Project boundaries, keys, and current account ownership.
                  </p>
                </a>
                <a href="https://github.com/aakashsell/aperture/blob/main/docs/RESOURCE_LIFECYCLE.md">
                  <strong>Archive and delete</strong>
                  <p>
                    What each action stops, preserves, and permanently removes.
                  </p>
                </a>
              </div>
            </section>
            <section className="docs-next">
              <div>
                <span className="eyebrow">KEEP GOING</span>
                <h2>Integrate the SDK and wire up real health signals.</h2>
              </div>
              <a
                className="button"
                href="https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md"
              >
                Agent integration guide <ArrowUpRight size={15} />
              </a>
            </section>
          </div>
          <aside className="docs-toc">
            <strong>ON THIS PAGE</strong>
            <a href="#beta-group">Set up a beta group</a>
            <a href="#sdk-setup">Connect the SDK</a>
            <a href="#agent-workflow">Use a coding agent</a>
            <a href="#allocation-id">Choose the right ID</a>
            <a href="#percentages">Understand the percentages</a>
            <a href="#health-events">Health and events</a>
            <a href="#expand">Expand after beta</a>
            <a href="#workspace-operations">Workspaces and cleanup</a>
            <a href="#common-questions">Quick answers</a>
          </aside>
        </section>
      </div>
      <footer className="docs-footer">
        <Link href="/">← Back to Aperture</Link>
        <span>Ship safely. Learn what works.</span>
        <a href="https://github.com/aakashsell/aperture">Open source ↗</a>
      </footer>
    </div>
  );
}
