"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Play,
} from "lucide-react";
const scenarios = {
  healthy: {
    label: "Healthy experiment",
    assigned: [5021, 4979],
    exposed: [4987, 4946],
    rates: [8.4, 10.1],
    message:
      "Assignment and exposure counts look consistent. Inspect uncertainty and your planned stopping rule before deciding.",
    blocked: false,
  },
  exposure: {
    label: "Missing exposure tracking",
    assigned: [5021, 4979],
    exposed: [4987, 3102],
    rates: [8.4, 11.0],
    message:
      "Variation exposure coverage is much lower. Investigate missing tracking or differences in who reaches the feature before interpreting lift.",
    blocked: true,
  },
  srm: {
    label: "Sample-ratio mismatch",
    assigned: [5800, 4200],
    exposed: [5754, 4166],
    rates: [8.4, 10.1],
    message:
      "Assignments differ substantially from the intended 50 / 50 split. Check bucketing, identity, and eligibility before interpreting results.",
    blocked: true,
  },
};
export default function Demo() {
  const [scenario, setScenario] = useState<keyof typeof scenarios>("healthy"),
    [step, setStep] = useState(0);
  const s = scenarios[scenario];
  return (
    <div className="demo-page">
      <nav className="marketing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">a</span> aperture
        </Link>
        <span className="demo-label">
          INTERACTIVE SIMULATION · NO LIVE USER DATA
        </span>
        <Link href="/app" className="button small">
          Open workspace <ArrowRight size={14} />
        </Link>
      </nav>
      <main className="demo-content">
        <Link href="/" className="back-link">
          <ArrowLeft size={14} /> Back to Aperture
        </Link>
        <span className="eyebrow">
          THREE EXPERIMENTS. THREE VERY DIFFERENT STORIES.
        </span>
        <h1>
          Would you trust
          <br />
          <em>this result?</em>
        </h1>
        <p>
          Explore how instrumentation can change the story your data tells. All
          numbers below are simulated, and the diagnostic examples illustrate
          the checks we’re building toward.
        </p>
        <div className="scenario-tabs">
          {Object.entries(scenarios).map(([key, v]) => (
            <button
              key={key}
              className={scenario === key ? "active" : ""}
              onClick={() => {
                setScenario(key as keyof typeof scenarios);
                setStep(0);
              }}
            >
              {key === "healthy" ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}{" "}
              {v.label}
            </button>
          ))}
        </div>
        <div className="demo-grid">
          <section className="fake-app">
            <div className="fake-app-nav">
              acme<span>ai</span>
              <small>Fictional demo product</small>
            </div>
            <div className="fake-app-body">
              <span className="eyebrow">MAKE SPACE FOR YOUR BEST WORK</span>
              <h2>
                One place for
                <br />
                your next big idea.
              </h2>
              <p>
                Your notes, projects, and team.
                <br />
                Finally working together.
              </p>
              <div className="fake-pricing">
                <span>PRO WORKSPACE</span>
                <strong>
                  $19<small> / month</small>
                </strong>
                <ul>
                  <li>Unlimited projects</li>
                  <li>One connected workspace</li>
                  <li>More room to create</li>
                </ul>
                <button
                  className="button"
                  onClick={() => setStep(Math.max(1, step))}
                >
                  Try the new signup CTA <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </section>
          <section className="panel demo-controls">
            <span className="eyebrow">PRICING SIGNUP EXPERIMENT</span>
            <h2>{s.label}</h2>
            <div className="demo-progress">
              {[
                "Create experiment",
                "Generate traffic",
                "Inspect evidence",
              ].map((label, i) => (
                <span key={label} className={step > i ? "done" : ""}>
                  <b>{step > i ? "✓" : i + 1}</b>
                  {label}
                </span>
              ))}
            </div>
            {step < 2 ? (
              <div className="empty">
                <h3>
                  {step === 0
                    ? "Start with a question."
                    : "Let the visitors arrive."}
                </h3>
                <p>
                  {step === 0
                    ? "Does a clearer signup CTA increase conversion? Create a simulated 50 / 50 test."
                    : "Generate 10,000 simulated assignments to reveal how this scenario behaves."}
                </p>
                <button className="button" onClick={() => setStep(step + 1)}>
                  <Play size={14} />
                  {step === 0
                    ? "Create experiment"
                    : "Generate simulated traffic"}
                </button>
              </div>
            ) : (
              <>
                <div className="demo-counts">
                  <div>
                    <span />
                    <strong>Control</strong>
                    <strong>Variation</strong>
                  </div>
                  <div>
                    <span>Assigned</span>
                    {s.assigned.map((v, i) => (
                      <b key={i}>{v.toLocaleString()}</b>
                    ))}
                  </div>
                  <div>
                    <span>Exposed</span>
                    {s.exposed.map((v, i) => (
                      <b key={i}>{v.toLocaleString()}</b>
                    ))}
                  </div>
                  <div>
                    <span>Coverage</span>
                    {s.exposed.map((v, i) => (
                      <b key={i}>{((v / s.assigned[i]) * 100).toFixed(1)}%</b>
                    ))}
                  </div>
                </div>
                <div className={`demo-verdict ${s.blocked ? "blocked" : ""}`}>
                  <strong>
                    {s.blocked ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}{" "}
                    {s.blocked
                      ? "Investigate instrumentation"
                      : "No illustrated integrity issue"}
                  </strong>
                  <p>{s.message}</p>
                </div>
                {step === 2 ? (
                  <button
                    className="button secondary"
                    onClick={() => setStep(3)}
                  >
                    Inspect observed conversion <ArrowRight size={14} />
                  </button>
                ) : (
                  <div className="observed">
                    <span>Observed conversion</span>
                    <strong>
                      {s.rates[0]}% → {s.rates[1]}%
                    </strong>
                    <small>
                      {s.blocked
                        ? "This comparison is not a trustworthy treatment-effect conclusion."
                        : "A higher observed rate is not, by itself, proof of an improvement."}
                    </small>
                  </div>
                )}
                <button className="text-button" onClick={() => setStep(0)}>
                  <RotateCcw size={12} /> Reset simulation
                </button>
              </>
            )}
          </section>
        </div>
        <div className="demo-next">
          <div>
            <h2>Now try your own question.</h2>
            <p>Connect your product and collect real evidence.</p>
          </div>
          <Link className="button" href="/app">
            Create a workspace <ArrowRight size={15} />
          </Link>
        </div>
      </main>
    </div>
  );
}
