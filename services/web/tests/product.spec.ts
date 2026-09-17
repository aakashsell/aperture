import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("landing, demo scenarios, and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Ship safely. Learn what works.",
  );
  await page.screenshot({ path: "/tmp/aperture-landing.png", fullPage: true });
  await page.getByRole("link", { name: "Try the demo" }).click();
  await page.getByRole("button", { name: "Missing exposure tracking" }).click();
  await page
    .getByRole("button", { name: "Create experiment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate simulated traffic" })
    .click();
  await expect(page.getByText("Investigate instrumentation")).toBeVisible();
  await expect(page.getByText("62.3%")).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect observed conversion" })
    .click();
  await expect(
    page.getByText(
      "This comparison is not a trustworthy treatment-effect conclusion.",
    ),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/aperture-demo.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/aperture-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("create a Chrome extension rollout, start at 5%, and expand to 100%", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app");
  await page
    .getByRole("button", { name: "New to Aperture? Create a workspace" })
    .click();
  await page.getByLabel("Workspace name").fill("Extension Studio");
  await page
    .getByLabel("Email address")
    .fill(`rollout-${randomUUID()}@test.example`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start small. Expand with confidence." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New rollout" }).click();
  await page.getByLabel("Rollout name").fill("New sync engine");
  await page
    .getByLabel("What is changing?")
    .fill("Release the real Chrome extension sync change safely.");
  await page.getByRole("button", { name: "Create rollout" }).click();
  await expect(
    page.getByRole("heading", { name: "New sync engine" }),
  ).toBeVisible();
  await expect(page.getByText("Collecting health evidence")).toBeVisible();
  await expect(page.locator("pre")).toContainText(
    'await aperture.gate("new-sync-engine")',
  );
  await page.getByRole("button", { name: "5%", exact: true }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("5% live")).toBeVisible();
  await page.getByRole("button", { name: "100%" }).click();
  await expect(
    page.getByRole("heading", { name: "Release to 100% of installations?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("100% live")).toBeVisible();
  await page.screenshot({ path: "/tmp/aperture-rollout.png", fullPage: true });
  await page.getByRole("button", { name: "Turn off rollout" }).click();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("ingest an unhandled exception and find it by installation ID", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "New to Aperture? Create a workspace" })
    .click();
  await page.getByLabel("Workspace name").fill("Crash Support Studio");
  await page
    .getByLabel("Email address")
    .fill(`crash-${randomUUID()}@test.example`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings & setup" }).click();
  const publishableKey = await page
    .getByLabel("Publishable integration key")
    .inputValue();
  const allocationID = `support-${randomUUID()}`;
  const response = await page.evaluate(
    async ({ key, id }) =>
      fetch("/api/crashes/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify({
          allocation: { kind: "installation", id },
          event_id: crypto.randomUUID(),
          name: "unhandled-rejection",
          severity: "fatal",
          exception: {
            type: "TypeError",
            message: "Extension startup failed",
            stack: "TypeError: Extension startup failed\\n at service-worker.js:17",
          },
        }),
      }).then(async (result) => ({ status: result.status, body: await result.json() })),
    { key: publishableKey, id: allocationID },
  );
  expect(response.status).toBe(200);
  await page.getByRole("button", { name: "Event stream" }).click();
  await page.getByLabel("Allocation kind").selectOption("installation");
  await page.getByLabel("Filter by allocation ID").fill(allocationID);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(
    page.getByText("TypeError: Extension startup failed", { exact: true }),
  ).toBeVisible();
  await page.getByText("Show stack trace").click();
  await expect(page.locator(".crash-list pre")).toContainText(
    "service-worker.js:17",
  );
});

test("register, create, start, integrate, and pause an experiment", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app");
  await page
    .getByRole("button", { name: "New to Aperture? Create a workspace" })
    .click();
  await page.getByLabel("Workspace name").fill("Discovery Studio");
  await page
    .getByLabel("Email address")
    .fill(`browser-${randomUUID()}@test.example`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.getByRole("link", { name: /Experiments/ }).click();
  await expect(
    page.getByRole("heading", { name: "Small changes. Better decisions." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New experiment", exact: true })
    .click();
  await page.getByLabel("Experiment name").fill("A simpler checkout");
  await page
    .getByLabel("Your hypothesis")
    .fill("Reducing checkout steps will improve purchase conversion.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Metric name", { exact: true })
    .fill("Purchase conversion");
  await page.getByLabel("Event name", { exact: true }).fill("purchase");
  await page
    .getByRole("button", { name: "Create experiment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A simpler checkout", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start experiment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause experiment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "integration", exact: true }).click();
  await expect(page.locator("pre")).toContainText("await ap.getVariant");
  await page.getByRole("button", { name: "results", exact: true }).click();
  await page.screenshot({ path: "/tmp/aperture-detail.png", fullPage: true });
  await page.getByRole("link", { name: "All experiments" }).click();
  await page.getByRole("link", { name: /Experiments/ }).click();
  await expect(
    page.getByText("A simpler checkout", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/aperture-workspace.png",
    fullPage: true,
  });
  await page.getByText("A simpler checkout", { exact: true }).click();
  await page.getByRole("button", { name: "Pause experiment" }).click();
  await expect(
    page.getByRole("button", { name: "Resume experiment" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
