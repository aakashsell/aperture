"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";
export const number = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat().format(n);
export const ago = (date?: string | null) => {
  if (!date) return "Awaiting first update";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(date)) / 60000),
  );
  return minutes < 1 ? "Just now" : `${minutes}m ago`;
};
export const value = (n: number | undefined, binary = false) =>
  n == null
    ? "—"
    : binary
      ? `${(n * 100).toFixed(2)}%`
      : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
export function Badge({ status }: { status: string }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {status}
    </span>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="notice error" role="alert">
      {error}
    </div>
  ) : null;
}
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button small secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setError("Select and copy the text manually.");
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
        {copied ? "Copied" : "Copy"}
      </button>
      {error && <small role="status">{error}</small>}
    </>
  );
}

export function Summary({
  label,
  count,
  icon,
  note,
}: {
  label: string;
  count: string;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <section className="summary-card">
      <div>
        {label}
        <span>{icon}</span>
      </div>
      <strong>{count}</strong>
      <small>{note}</small>
    </section>
  );
}

export const difference = (n: number | undefined, binary: boolean) =>
  n == null ? "—" : binary ? `${(n * 100).toFixed(2)} pp` : value(n);
