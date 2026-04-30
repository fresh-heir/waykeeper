import { expect, test, type Page } from "@playwright/test";

const hasRealAiOptIn = Boolean(process.env.PLAYWRIGHT_REAL_AI);
const hasOpenAiApiKey =
  typeof process.env.OPENAI_API_KEY === "string" &&
  process.env.OPENAI_API_KEY.trim().length > 0;

test.skip(
  !hasRealAiOptIn || !hasOpenAiApiKey,
  "Real AI smoke tests require PLAYWRIGHT_REAL_AI=1 and OPENAI_API_KEY."
);

const longAiTimeoutMs = 180_000;
const longAiExpectTimeoutMs = 120_000;
const fallbackOutcomePattern =
  /did not finish in time|timed out|local interpretation was used|stayed local|stayed in place|local preview/i;

async function gotoFreshPlanner(page: Page) {
  await page.goto("/");
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

async function loadScenario(page: Page, scenarioName: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({ label: scenarioName });
  await page.getByRole("button", { name: "Load scenario" }).click();
}

async function loadScenarioAndBuild(page: Page, scenarioName: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({ label: scenarioName });
  await page.getByRole("button", { name: "Load & build plan" }).click();
}

async function setEngineMode(
  page: Page,
  flow: "interpretation" | "draft" | "replan",
  mode: "local" | "ai"
) {
  await openDeveloperTools(page);
  await page.getByTestId(`ai-engine-${flow}`).selectOption(mode);
}

function getDiagnosticsPanel(
  page: Page,
  title: "Interpretation diagnostics" | "Draft diagnostics" | "Replan diagnostics"
) {
  return page
    .getByTestId("planner-ai-diagnostics")
    .locator(":scope > div")
    .filter({ has: page.getByText(title, { exact: true }) });
}

function getFallbackModel() {
  return process.env.OPENAI_MODEL ?? "gpt-5";
}

function getExpectedModelLabels(flow: "parse" | "draft" | "replan") {
  const fallbackModel = getFallbackModel();
  const definedValues = (values: Array<string | undefined>) =>
    values.filter((value): value is string => Boolean(value));

  switch (flow) {
    case "parse":
      return Array.from(
        new Set([
          process.env.OPENAI_MODEL_PARSE_REFINE,
          process.env.OPENAI_MODEL_PARSE_FULL,
          fallbackModel,
        ].filter((value): value is string => Boolean(value)))
      );
    case "draft":
      return Array.from(
        new Set(definedValues([process.env.OPENAI_MODEL_DRAFT, fallbackModel]))
      );
    case "replan":
      return Array.from(
        new Set([
          process.env.OPENAI_MODEL_REPLAN_HIGH,
          process.env.OPENAI_MODEL_REPLAN,
          fallbackModel,
        ].filter((value): value is string => Boolean(value)))
      );
  }
}

async function expectRealAiCompleted(
  diagnostics: ReturnType<typeof getDiagnosticsPanel>,
  flow: "parse" | "draft" | "replan"
) {
  await expect(diagnostics).toContainText("Schema passed", {
    timeout: longAiExpectTimeoutMs,
  });
  await expect(diagnostics).toContainText(/Fetch \d+ms/, {
    timeout: longAiExpectTimeoutMs,
  });
  await expect(diagnostics).not.toContainText(fallbackOutcomePattern, {
    timeout: longAiExpectTimeoutMs,
  });

  const diagnosticsText = await diagnostics.innerText();
  expect(
    getExpectedModelLabels(flow).some((modelLabel) =>
      diagnosticsText.includes(modelLabel)
    )
  ).toBe(true);
}

async function ensureReplanPanelOpen(page: Page) {
  const generateButton = page.getByRole("button", { name: "Generate revised plan" });
  const adjustRemainderHeading = page.getByRole("heading", {
    name: "Adjust remainder",
  });

  if (
    (await generateButton.count()) > 0 &&
    (await generateButton.first().isVisible().catch(() => false))
  ) {
    return;
  }

  if (
    (await adjustRemainderHeading.count()) > 0 &&
    (await adjustRemainderHeading.first().isVisible().catch(() => false))
  ) {
    await expect(generateButton).toBeVisible();
    return;
  }

  await page.getByTestId("replan-trigger").click();
  await expect(generateButton).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(longAiTimeoutMs);
  await gotoFreshPlanner(page);
});

test("real AI interpretation smoke test returns reviewable tasks and diagnostics", async ({
  page,
}) => {
  await setEngineMode(page, "interpretation", "ai");
  await loadScenario(page, "Normal realistic day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await expect(
    page.getByTestId("task-intake-panel").locator("li:visible").first()
  ).toBeVisible({ timeout: longAiExpectTimeoutMs });

  const diagnostics = getDiagnosticsPanel(page, "Interpretation diagnostics");
  await expect(diagnostics).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await expect(
    diagnostics.getByText(/Parse refine|Parse full/)
  ).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await expectRealAiCompleted(diagnostics, "parse");
});

test("real AI draft smoke test builds a route with dedicated diagnostics", async ({
  page,
}) => {
  await setEngineMode(page, "interpretation", "local");
  await setEngineMode(page, "draft", "ai");

  await loadScenario(page, "AI draft believability comparison");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible({
    timeout: longAiExpectTimeoutMs,
  });
  await expect(page.getByTestId("current-card")).toBeVisible({
    timeout: longAiExpectTimeoutMs,
  });

  const diagnostics = getDiagnosticsPanel(page, "Draft diagnostics");
  await expect(diagnostics).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await expect(diagnostics).toContainText("Timings", {
    timeout: longAiExpectTimeoutMs,
  });
  await expectRealAiCompleted(diagnostics, "draft");
});

test("real AI replan smoke test preserves an inspectable preview flow", async ({
  page,
}) => {
  await setEngineMode(page, "draft", "local");
  await setEngineMode(page, "replan", "ai");

  await loadScenarioAndBuild(page, "AI stale-route replan comparison");
  await ensureReplanPanelOpen(page);
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible({
    timeout: longAiExpectTimeoutMs,
  });
  await expect(page.getByRole("heading", { name: "Adjust remainder" })).toBeVisible({
    timeout: longAiExpectTimeoutMs,
  });

  const diagnostics = getDiagnosticsPanel(page, "Replan diagnostics");
  await expect(diagnostics).toBeVisible({ timeout: longAiExpectTimeoutMs });
  await expect(diagnostics).toContainText("Timings", {
    timeout: longAiExpectTimeoutMs,
  });
  await expectRealAiCompleted(diagnostics, "replan");
});
