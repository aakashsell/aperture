"use client";

import { request } from "@/lib/api";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ErrorNotice, message } from "./shared";
export function Auth({
  onSuccess,
  initialError,
}: {
  onSuccess: () => void;
  initialError: string;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Link href="/app" className="brand">
          <span className="brand-mark">a</span> aperture
        </Link>
        <div>
          <span className="eyebrow">LESS GUESSWORK. MORE PROGRESS.</span>
          <h1>
            Great products
            <br />
            grow through
            <br />
            <em>small discoveries.</em>
          </h1>
          <p>
            A thoughtful place to test your ideas, understand your users, and
            decide what comes next.
          </p>
          <div className="auth-illustration">
            <span>YOUR NEXT IDEA</span>
            <div>
              <i>Control</i>
              <b />
              <i>Variation</i>
            </div>
            <small>One question. Two possibilities. A clearer answer.</small>
          </div>
        </div>
        <small>Open-source experimentation, made approachable.</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">YOUR EXPERIMENT WORKSPACE</span>
          <h2>{register ? "Make room for discovery." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your workspace to start learning."
              : "Sign in and see what’s taking shape."}
          </p>
          <ErrorNotice error={error} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await request(`/auth/${register ? "register" : "login"}`, data);
                onSuccess();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <label>
                Workspace name
                <input name="project" placeholder="Acme Studio" required />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={72}
                required
                placeholder="At least 12 characters"
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}{" "}
              {register ? "Create workspace" : "Sign in"}
            </button>
          </form>
          <button
            className="text-button auth-toggle"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New to Aperture? Create a workspace"}
          </button>
        </div>
      </section>
    </div>
  );
}
