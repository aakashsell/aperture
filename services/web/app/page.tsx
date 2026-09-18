import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitBranch,
  Rocket,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Landing() {
  return (
    <div className="landing">
      <nav className="marketing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">a</span> aperture
        </Link>
        <div>
          <a href="#for-you">Is it for you?</a>
          <a href="#how">How it works</a>
          <a href="#open-source">Open source</a>
          <Link href="/docs">Docs</Link>
          <Link href="/demo">Explore the demo</Link>
          <a href="https://github.com/aakashsell/aperture">
            GitHub <ArrowUpRight size={13} />
          </a>
        </div>
        <Link className="button small secondary" href="/app">
          Open workspace <ArrowRight size={14} />
        </Link>
      </nav>
      <main>
        <section className="marketing-hero">
          <div className="hero-tag">
            <span className="live-dot" /> BUILT FOR PEOPLE. READY FOR AGENTS.
          </div>
          <h1>
            A/B testing your coding agent can actually get right.
            <br />
            <em>Ship safely. Learn what works.</em>
          </h1>
          <p>
            Add trustworthy experiments to any app in minutes. Aperture handles
            assignment, exposure, and measurement—and catches broken experiments
            before they lead you to the wrong decision.
          </p>
          <div className="hero-actions">
            <Link href="/app" className="button">
              Protect your next release <ArrowRight size={16} />
            </Link>
            <Link href="/demo" className="button secondary">
              Try the demo
            </Link>
          </div>
          <small>
            Open-source core · Cross-platform by design · TypeScript · Run it
            yourself or choose hosting
          </small>
        </section>
        <section className="marketing-section audience-section" id="for-you">
          <div className="section-intro">
            <span className="eyebrow">
              SOLO BUILDERS. VIBECODERS. LEAN TEAMS.
            </span>
            <h2>
              Is Aperture for you?
              <br />
              If you’re shipping, start learning.
            </h2>
            <p>
              You don’t need a dedicated experimentation team to ask better
              questions about your product. Start with one change and one thing
              you want to improve.
            </p>
          </div>
          <div className="feature-grid">
            <article>
              <Rocket size={23} />
              <span>SHIPPING A REAL CHANGE?</span>
              <h3>Don’t make everyone your first tester.</h3>
              <p>
                Release a new sync engine, onboarding flow, or checkout to 5% of
                users. Observe failures against the current behavior, then
                expand or turn it off from one place.
              </p>
            </article>
            <article>
              <Terminal size={23} />
              <span>BUILDING FAST WITH AN AGENT?</span>
              <h3>Turn “it looks better” into a test.</h3>
              <p>
                Your agent can build three versions before lunch. Give it a
                clear hypothesis and an integration guide, then check which
                experience actually helps your users.
              </p>
            </article>
            <article>
              <ShieldCheck size={23} />
              <span>READY TO GET SERIOUS ABOUT GROWTH?</span>
              <h3>Improve the product you already have.</h3>
              <p>
                Find out whether a clearer signup, simpler pricing page, or
                better first-run experience improves conversion. Make the next
                decision with evidence, even on a small team.
              </p>
            </article>
          </div>
          <p className="audience-note">
            A smaller test audience limits how many people see a change; it
            doesn’t replace testing your code. Reliable conclusions still need
            enough traffic and a planned stopping point.
          </p>
        </section>
        <section className="agent-workflow marketing-section" id="workflow">
          <div className="section-intro">
            <span className="eyebrow">
              RELEASE SAFETY, BUILT INTO THE WAY YOU SHIP
            </span>
            <h2>
              Tell your agent what to protect.
              <br />
              Aperture makes rollout first-class.
            </h2>
            <p>
              Describe the change and its safe fallback. Your agent adds the
              gate and health signals. You review the integration, start at 5%,
              and decide when the evidence supports expanding.
            </p>
          </div>
          <div className="workflow-grid">
            <article className="workflow-prompt">
              <span className="eyebrow">YOU → YOUR CODING AGENT</span>
              <blockquote>
                “Add rollout protection to the new sync implementation. Start at
                5% of installations, keep the current sync as the fallback, and
                report failures to Aperture.”
              </blockquote>
              <a href="https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md">
                Give your agent the integration guide <ArrowUpRight size={14} />
              </a>
            </article>
            <article className="workflow-review">
              <span className="eyebrow">THE WORKFLOW TODAY</span>
              <ol>
                <li>
                  <b>1</b>
                  <div>
                    <strong>You define the release</strong>
                    <p>
                      Create a rollout off by default and choose its initial
                      audience.
                    </p>
                  </div>
                </li>
                <li>
                  <b>2</b>
                  <div>
                    <strong>Your agent connects the app</strong>
                    <p>
                      Install the SDK, gate the new path, and report explicit
                      exposure and failures.
                    </p>
                  </div>
                </li>
                <li>
                  <b>3</b>
                  <div>
                    <strong>You review, start, and expand</strong>
                    <p>
                      Start at 5%, compare observed health, and confirm each
                      increase up to 100%.
                    </p>
                  </div>
                </li>
              </ol>
              <Link className="button secondary" href="/app">
                Set up your first rollout <ArrowRight size={14} />
              </Link>
            </article>
          </div>
          <div className="install-strip">
            <div>
              <strong>One gate. A stable installation identity.</strong>
              <p>
                Alpha: build the SDK from this repository, then install it in
                your app.
              </p>
            </div>
            <code>npm install /path/to/aperture/sdks/ts</code>
            <a href="https://github.com/aakashsell/aperture#connect-an-app">
              Install instructions <ArrowUpRight size={13} />
            </a>
          </div>
        </section>
        <section className="demo-pitch">
          <div>
            <span className="eyebrow">THE NUMBER ISN’T THE WHOLE STORY</span>
            <h2>
              A bigger lift.
              <br />
              Or a broken experiment?
            </h2>
            <p>
              Missing exposures can make a variation look better than it is.
              Explore a healthy experiment and two broken scenarios in a clearly
              labeled simulation.
            </p>
            <Link href="/demo" className="button">
              See the difference <ArrowRight size={16} />
            </Link>
          </div>
          <div className="integrity-card">
            <span className="demo-label">SIMULATED INTEGRITY CHECK</span>
            <h3>Onboarding experiment</h3>
            <div>
              <span>Control exposure coverage</span>
              <strong>99.3%</strong>
            </div>
            <div>
              <span>Variation exposure coverage</span>
              <strong className="warning-text">62.3%</strong>
            </div>
            <div className="integrity-warning">
              <strong>Investigate before interpreting</strong>
              <p>
                The variants have very different exposure coverage. A large
                observed lift may reflect who was measured.
              </p>
            </div>
            <Link href="/demo">
              Explore this scenario <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
        <section className="marketing-section product-section">
          <div className="section-intro">
            <span className="eyebrow">
              BUILT FOR THE PERSON MAKING THE CALL
            </span>
            <h2>
              Everything you need
              <br />
              to question the result.
            </h2>
            <p>
              Review real assignments, exposure coverage, conversion, and
              uncertainty in one workspace. This preview uses illustrative data;
              open the product to run your own experiment.
            </p>
          </div>
          <div className="hero-product">
            <div className="product-top">
              <span>
                <span className="brand-mark">a</span> aperture <Chevron />{" "}
                Experiments
              </span>
              <span className="demo-label">ILLUSTRATIVE DATA</span>
            </div>
            <div className="product-body">
              <div className="product-sidebar">
                <strong>WORKSPACE</strong>
                <span className="chosen">◉ Experiments</span>
                <span>⌁ Event stream</span>
                <span>⚙ Settings</span>
                <small>● Worker connected</small>
              </div>
              <div className="product-main">
                <div className="product-title">
                  <div>
                    <small>PRICING_PAGE_V2</small>
                    <h2>A clearer path to your first yes.</h2>
                  </div>
                  <span className="status running">
                    <i />
                    Running
                  </span>
                </div>
                <div className="product-metrics">
                  <div>
                    <small>People exposed</small>
                    <strong>12,481</strong>
                  </div>
                  <div>
                    <small>Control conversion</small>
                    <strong>
                      8.4<span>%</span>
                    </strong>
                  </div>
                  <div>
                    <small>Variation conversion</small>
                    <strong>
                      10.1<span>%</span>
                    </strong>
                  </div>
                </div>
                <div className="product-chart">
                  <div>
                    <span>Absolute conversion change</span>
                    <strong>+1.7 percentage points</strong>
                  </div>
                  <div className="mock-axis">
                    <i />
                    <b />
                    <span />
                  </div>
                  <small>
                    Show the estimate. Show the uncertainty. Keep the decision
                    yours.
                  </small>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="marketing-section" id="how">
          <div className="section-intro">
            <span className="eyebrow">FROM “WHAT IF” TO “NOW WE KNOW”</span>
            <h2>
              Small enough to start.
              <br />
              Thoughtful enough to trust.
            </h2>
            <p>
              Your experiment needs more than a random split. Aperture keeps the
              path from assignment to outcome clear.
            </p>
          </div>
          <div className="feature-grid">
            <article>
              <Terminal size={23} />
              <span>01 / CONNECT</span>
              <h3>Fits the code you already write.</h3>
              <p>
                One TypeScript SDK for assignment, explicit exposure, and
                events. Clear errors and retry-safe event IDs.
              </p>
            </article>
            <article>
              <GitBranch size={23} />
              <span>02 / MEASURE</span>
              <h3>The experience stays consistent.</h3>
              <p>
                Server-persisted assignments keep users in their variant.
                Exposure records must match what was assigned.
              </p>
            </article>
            <article>
              <ShieldCheck size={23} />
              <span>03 / UNDERSTAND</span>
              <h3>Uncertainty belongs in the picture.</h3>
              <p>
                See sample sizes, intervals, data freshness, and assignment
                imbalance before making a decision.
              </p>
            </article>
          </div>
        </section>
        <section className="marketing-section platform-section" id="platforms">
          <div className="section-intro">
            <span className="eyebrow">YOUR WORKFLOW. YOUR INFRASTRUCTURE.</span>
            <h2>
              One release and experimentation layer.
              <br />
              Whatever you build with.
            </h2>
            <p>
              Aperture lives alongside your app. Keep your hosting provider,
              application database, and coding agent. Connect through the
              TypeScript SDK and HTTP API; Aperture stores experiment data in
              your Postgres.
            </p>
          </div>
          <div className="platform-grid">
            <article>
              <span className="eyebrow">VERIFIED IN THIS REPOSITORY</span>
              <h3>A working path from code to results.</h3>
              <ul>
                <li>
                  <Check size={15} /> TypeScript SDK → Go API → Postgres →
                  results
                </li>
                <li>
                  <Check size={15} /> Next.js dashboard and browser workflows
                </li>
                <li>
                  <Check size={15} /> Assignment, exposure, and
                  project-isolation checks
                </li>
              </ul>
            </article>
            <article>
              <span className="eyebrow">
                NEXT: EXTERNAL COMPATIBILITY BENCHMARKS
              </span>
              <h3>Show the work. Then make the claim.</h3>
              <p>
                Unfamiliar apps, different stacks, the same integration
                instructions. External framework, hosting, and coding-agent
                combinations are not yet certified.
              </p>
              <a href="https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md">
                Read the benchmark protocol <ArrowUpRight size={14} />
              </a>
            </article>
          </div>
        </section>
        <section
          className="marketing-section open-source-section"
          id="open-source"
        >
          <div className="section-intro">
            <span className="eyebrow">OPEN PRODUCT. MORE WAYS TO RUN IT.</span>
            <h2>
              The core is open source.
              <br />
              Choose how much you want to manage.
            </h2>
            <p>
              The core product is open, with instructions to run it yourself.
              Paid offerings can take care of hosting, connect to your own
              database, or adapt Aperture to your company’s needs.
            </p>
          </div>
          <div className="platform-grid hosting-options">
            <article>
              <span className="eyebrow">SELF-HOST · AVAILABLE IN ALPHA</span>
              <h3>Run it yourself.</h3>
              <p>
                The rollout and experiment engines, SDK, dashboard, and
                statistics worker are MIT-licensed. Follow the setup
                instructions, run the core on your infrastructure, and keep your
                product data in your Postgres.
              </p>
              <a href="https://github.com/aakashsell/aperture#start-locally">
                Read the self-hosting instructions <ArrowUpRight size={14} />
              </a>
            </article>
            <article>
              <span className="eyebrow">FULL HOSTING · PLANNED</span>
              <h3>Focus on your product.</h3>
              <p>
                A fully hosted option for teams that want us to run Aperture and
                its experiment database. Less infrastructure to manage, more
                time to build and learn.
              </p>
            </article>
            <article>
              <span className="eyebrow">HOSTING + YOUR DATABASE · PLANNED</span>
              <h3>We run the service. You keep the database.</h3>
              <p>
                A hosted Aperture service connected to your own Postgres, for
                teams that want managed hosting while keeping experiment data in
                a database they control.
              </p>
            </article>
            <article>
              <span className="eyebrow">CUSTOM SOLUTIONS</span>
              <h3>Fit the way your company works.</h3>
              <p>
                Company-specific integrations, tailored deployments, and other
                custom work can be scoped separately around your requirements.
              </p>
            </article>
          </div>
          <p className="audience-note">
            Self-hosting the core does not require a paid plan. Hosted offerings
            are planned; availability, pricing, and custom engagement terms will
            be announced separately.
          </p>
        </section>
        <section className="marketing-cta">
          <span className="eyebrow">PROTECT YOUR NEXT RELEASE</span>
          <h2>
            Make safe rollout and learning
            <br />
            <em>part of shipping.</em>
          </h2>
          <Link href="/app" className="button">
            Create your workspace <ArrowRight size={16} />
          </Link>
          <p>Early access software. Built in the open.</p>
        </section>
      </main>
      <footer className="marketing-footer">
        <Link className="brand" href="/">
          aperture
        </Link>
        <span>Ship safely. Learn what works.</span>
        <Link href="/docs">Guides &amp; docs</Link>
        <a href="https://github.com/aakashsell/aperture">
          Explore the source <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
function Chevron() {
  return <span style={{ opacity: 0.3, margin: "0 10px" }}>›</span>;
}
