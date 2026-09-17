"use client";

import { Session } from "@/lib/api";

import { CopyButton } from "./shared";
export function Integration({
  experimentKey,
  session,
}: {
  experimentKey: string;
  session: Session;
}) {
  const url =
    typeof window === "undefined"
      ? "http://localhost:8000"
      : `${window.location.origin}/api`;
  const code = `import { Aperture } from "@aperture/sdk";\n\nconst ap = new Aperture({\n  apiUrl: ${JSON.stringify(url)},\n  publishableKey: ${JSON.stringify(session.publishable_key)},\n  onError: console.error,\n});\n\nlet variant: string | null = null;\ntry {\n  variant = await ap.getVariant(${JSON.stringify(experimentKey)}, user.id);\n} catch {\n  // Keep the existing experience on failure.\n}\nrenderExperience(variant ?? "control");\nif (variant) {\n  await ap.expose(${JSON.stringify(experimentKey)}, user.id, variant);\n}\n\n// Only send this event when the purchase actually happens.\nawait ap.track(crypto.randomUUID(), user.id, "purchase", 49.99);`;
  return (
    <section className="panel settings-panel">
      <span className="eyebrow">CONNECT YOUR PRODUCT</span>
      <h2>From code to confidence.</h2>
      <p>
        Build the SDK from this repository, install the local package, and use
        the same user ID for assignment and events. Replace “purchase” with your
        metric’s event name.
      </p>
      <div className="code-heading">
        <span>TypeScript / JavaScript</span>
        <CopyButton text={code} />
      </div>
      <pre>{code}</pre>
      <div className="notice">
        Handle assignment errors with your app’s safe default. After rollout,
        use the returned variant but stop recording experiment exposures.
        Publishable keys cannot manage experiments.
      </div>
    </section>
  );
}
