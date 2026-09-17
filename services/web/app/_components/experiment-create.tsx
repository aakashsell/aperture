"use client";

import { createExperiment } from "@/lib/api";
import { ArrowRight, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorNotice, message } from "./shared";
export function CreateDialog({
  close,
  saved,
}: {
  close: () => void;
  saved: (key: string) => void;
}) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    key: "",
    hypothesis: "",
    allocated_percentage: 100,
    attribution_days: 7,
    event_name: "",
    metric_name: "",
    metric_type: "binary",
  });
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", handler);
    document
      .querySelector<HTMLDialogElement>("#create-experiment")
      ?.showModal();
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, [close, busy]);
  const update = (key: string, v: string | number) =>
    setForm((f) => ({ ...f, [key]: v }));
  return (
    <dialog
      id="create-experiment"
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="dialog-heading">
        <span className="eyebrow">NEW EXPERIMENT</span>
        <button disabled={busy} aria-label="Close" onClick={close}>
          <X size={19} />
        </button>
      </div>
      <h2>Give your idea a fair test.</h2>
      <div className="steps">
        {["Hypothesis", "Audience", "Success metric"].map((s, i) => (
          <span
            key={s}
            className={step === i ? "current" : step > i ? "done" : ""}
          >
            <b>{step > i ? "✓" : i + 1}</b>
            {s}
          </span>
        ))}
      </div>
      <ErrorNotice error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (step < 2) {
            setStep(step + 1);
            return;
          }
          setBusy(true);
          setError("");
          try {
            const exp = await createExperiment({
              ...form,
              primary_metric: {
                name: form.metric_name,
                event_name: form.event_name,
                metric_type: form.metric_type,
              },
              variants: [
                {
                  key: "control",
                  name: "Original",
                  allocation: 50,
                  is_control: true,
                },
                {
                  key: "treatment",
                  name: "Variation",
                  allocation: 50,
                  is_control: false,
                },
              ],
            });
            saved(exp.key);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {step === 0 ? (
          <>
            <label>
              Experiment name
              <input
                autoFocus
                required
                value={form.name}
                placeholder="A simpler checkout"
                onChange={(e) => {
                  update("name", e.target.value);
                  update(
                    "key",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^_|_$/g, ""),
                  );
                }}
              />
            </label>
            <label>
              Experiment key
              <input
                required
                pattern="[a-zA-Z0-9_-]{1,100}"
                value={form.key}
                onChange={(e) => update("key", e.target.value)}
              />
              <small>A stable identifier used by your integration.</small>
            </label>
            <label>
              Your hypothesis
              <textarea
                required
                rows={3}
                value={form.hypothesis}
                onChange={(e) => update("hypothesis", e.target.value)}
                placeholder="If we reduce checkout steps, more people will complete a purchase."
              />
            </label>
          </>
        ) : step === 1 ? (
          <>
            <label>
              Traffic included <strong>{form.allocated_percentage}%</strong>
              <input
                type="range"
                min={1}
                max={100}
                value={form.allocated_percentage}
                onChange={(e) =>
                  update("allocated_percentage", +e.target.value)
                }
              />
            </label>
            <div className="variant-preview">
              <div>
                <span className="variant-dot control" /> Original{" "}
                <strong>50%</strong>
              </div>
              <div>
                <span className="variant-dot treatment" /> Variation{" "}
                <strong>50%</strong>
              </div>
            </div>
            <p className="muted">
              Included users are split evenly. Their assignment stays fixed
              throughout the experiment.
            </p>
            <label>
              Outcome window (days)
              <input
                type="number"
                min={1}
                max={90}
                required
                value={form.attribution_days}
                onChange={(e) => update("attribution_days", +e.target.value)}
              />
              <small>
                Measure outcomes after first exposure, up to this window or
                experiment completion.
              </small>
            </label>
          </>
        ) : (
          <>
            <label>
              Metric name
              <input
                required
                placeholder="Purchase conversion"
                value={form.metric_name}
                onChange={(e) => update("metric_name", e.target.value)}
              />
            </label>
            <label>
              Event name
              <input
                required
                pattern="[a-zA-Z0-9_-]{1,100}"
                placeholder="purchase"
                value={form.event_name}
                onChange={(e) => update("event_name", e.target.value)}
              />
            </label>
            <label>
              How should we measure it?
              <select
                value={form.metric_type}
                onChange={(e) => update("metric_type", e.target.value)}
              >
                <option value="binary">
                  Conversion — users who trigger the event
                </option>
                <option value="continuous">Value — sum per exposed user</option>
                <option value="count">
                  Frequency — events per exposed user
                </option>
              </select>
            </label>
            <div className="notice">
              Your experiment starts as a draft. Review the setup before sending
              traffic.
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : close())}
          >
            {step ? "Back" : "Cancel"}
          </button>
          <button className="button" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : null}
            {step === 2 ? "Create experiment" : "Continue"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
