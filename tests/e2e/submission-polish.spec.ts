import { expect, test, type Page } from "@playwright/test";

async function gotoWelcome(page: Page) {
  await page.goto("/?waykeeperWelcome=1");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
}

async function openDeveloperTools(page: Page) {
  const developerTools = page.getByTestId("developer-tools");
  const isOpen = await developerTools.evaluate(
    (element) => (element as HTMLDetailsElement).open
  );

  if (!isOpen) {
    await developerTools.locator("summary").click();
  }
}

async function loadScenarioAndBuild(page: Page, scenarioName: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({ label: scenarioName });
  await page.getByRole("button", { name: "Load & build plan" }).click();
}

test("welcome How it works opens a polished explanation modal", async ({ page }) => {
  await gotoWelcome(page);

  await page.getByRole("button", { name: "How it works" }).click();

  const dialog = page.getByRole("dialog", { name: "From task dump to route." });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Tell us your day");
  await expect(dialog).toContainText("Review the interpretation");
  await expect(dialog).toContainText("Follow your route with Oracle");

  await dialog.getByRole("button", { name: /Close/ }).click();
  await expect(dialog).toBeHidden();
});

test("sample preview supports persona selection before building a real route", async ({
  page,
}) => {
  await gotoWelcome(page);

  await page.getByRole("button", { name: /Try sample day/i }).click();
  await expect(page.getByTestId("sample-persona-professional")).toBeVisible();

  await page.getByTestId("sample-persona-student").click();
  await expect(page.getByTestId("sample-persona-student")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: /^Try sample day$/ }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(page.getByTestId("day-timeline")).toContainText(
    /sociology reading response|calculus problem set/i
  );
});

test("each sample persona builds its matching concrete scenario", async ({
  page,
}) => {
  const personas = [
    {
      testId: "sample-persona-professional",
      expectedTask: /Q2 client update/i,
    },
    {
      testId: "sample-persona-creative_founder",
      expectedTask: /launch email draft|pricing page hero copy/i,
    },
  ];

  for (const persona of personas) {
    await gotoWelcome(page);
    await page.getByRole("button", { name: /Try sample day/i }).click();
    await page.getByTestId(persona.testId).click();
    await page.getByRole("button", { name: /^Try sample day$/ }).click();
    await expect(page.getByTestId("day-timeline")).toContainText(
      persona.expectedTask
    );
  }
});

test("profile choices persist and appear in the profile summary", async ({
  page,
}) => {
  await gotoWelcome(page);

  await page.getByRole("button", { name: /Start today's plan/i }).click();
  await page.getByLabel("Your name").fill("Avery");
  await page.getByRole("button", { name: /Deepening/i }).click();
  await page.getByRole("button", { name: /Relationships/i }).click();
  await page.getByRole("button", { name: /Evening closer/i }).click();
  await page
    .getByLabel("What should the route feel like?")
    .fill("Deep work first, real lunch, and no late-night scramble.");

  const profileSummary = page.getByTestId("waykeeper-profile-summary");

  await expect(profileSummary).toContainText("Avery's Waykeeper Profile");
  await expect(profileSummary).toContainText("Protecting focus");
  await expect(profileSummary).toContainText("Evening closer");
  await expect(profileSummary).toContainText(/Relationships/);

  await page.goto("/");

  await expect(profileSummary).toContainText("Avery's Waykeeper Profile");
  await expect(profileSummary).toContainText("Evening closer");
});

test("route theme defaults to light and persists dark mode toggle", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();

  await loadScenarioAndBuild(page, "Sample: working professional day");
  await expect(page.locator('[data-waykeeper-theme="light"]')).toBeVisible();

  await page.getByRole("button", { name: /^Dark$/i }).click();
  await expect(page.locator('[data-waykeeper-theme="dark"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem("waykeeper-theme-mode"))
    )
    .toBe("dark");

  await page.reload();
  await expect(page.locator('[data-waykeeper-theme="dark"]')).toBeVisible();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
});
