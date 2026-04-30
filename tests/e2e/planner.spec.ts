import { expect, test, type Locator, type Page } from "@playwright/test";

const PLAYWRIGHT_TEST_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

type PlannerAiMockRequest =
  | {
      flow: "parse";
      includeDiagnostics?: boolean;
      strategy: "refine" | "full";
      payload: unknown;
    }
  | {
      flow: "draft" | "replan";
      includeDiagnostics?: boolean;
      payload: unknown;
    };

interface PlannerAiMockParsePayload {
  baselineTasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    [key: string]: unknown;
  }>;
}

interface PlannerAiMockDraftPayload {
  planningWindow: { startTime: string; endTime: string };
  paceMode: string;
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    hardStartTime?: string;
    hardEndTime?: string;
    routeContext?: {
      cognitiveMode: string;
      locationContext: string;
    };
    splittable: boolean;
    type: string;
  }>;
  hardEvents: Array<{ startTime: string; endTime: string }>;
  localScaffold: {
    blocks: Array<{ id: string }>;
    unplacedTasks: Array<{ taskId: string }>;
    carryForwardTaskIds: string[];
    dueWarnings: Array<{ taskId: string }>;
    warnings: string[];
    qualityHints: string[];
  };
  previousAcceptedAiProposal?: {
    blockIds: string[];
    taskIds: string[];
  };
  changedTaskIds?: string[];
  taskDeltas?: Array<{
    taskId: string;
    changeType: string;
    changedFields: string[];
  }>;
}

interface PlannerAiMockReplanPayload {
  currentTime: string;
  paceMode: string;
  tasks: Array<{
    id: string;
    title: string;
    routeContext?: {
      cognitiveMode: string;
      locationContext: string;
    };
  }>;
  currentBlocks: Array<{
    id: string;
    taskId?: string;
    blockType: string;
    startTime: string;
    endTime: string;
    status: string;
    locked: boolean;
  }>;
  localScaffold: {
    blocks: Array<{
      id: string;
      taskId?: string;
      blockType: string;
      startTime: string;
      endTime: string;
      status: string;
      locked: boolean;
    }>;
    carryForwardTaskIds: string[];
    dueWarnings: Array<{ taskId: string }>;
    warnings: string[];
    summaryLines: string[];
    qualityHints: string[];
  };
  previousAcceptedAiProposal?: {
    blockIds: string[];
  };
  changedTaskIds?: string[];
  taskDeltas?: Array<{
    taskId: string;
    changeType: string;
    changedFields: string[];
  }>;
  changedBlockIds?: string[];
  blockDeltas?: Array<{
    blockId: string;
    changeType: string;
    changedFields: string[];
  }>;
}

function stripMockTaskRouteContext<TTask extends { routeContext?: unknown }>(
  task: TTask
) {
  const { routeContext, ...taskWithoutRouteContext } = task;
  void routeContext;
  return taskWithoutRouteContext;
}

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

async function setEngineMode(
  page: Page,
  flow: "interpretation" | "draft" | "replan",
  mode: "local" | "ai"
) {
  await openDeveloperTools(page);
  await page.getByTestId(`ai-engine-${flow}`).selectOption(mode);
}

async function setPlannerAiTimeoutOverrides(
  page: Page,
  overrides: Partial<
    Record<"parse" | "draft" | "replan", { hardMs?: number; softMs?: number }>
  >
) {
  await page.addInitScript((nextOverrides) => {
    (
      window as Window & {
        __WAYKEEPER_TEST_AI_TIMEOUTS__?: unknown;
      }
    ).__WAYKEEPER_TEST_AI_TIMEOUTS__ = nextOverrides;
  }, overrides);
}

function buildMockPlannerAiDiagnostics(
  flow: "parse" | "draft" | "replan",
  requestPreview: unknown,
  rawResponse: unknown,
  issues: string[] = [],
  overrides?: Record<string, unknown>
) {
  return {
    flow,
    requestedAt: "2026-03-28T18:00:00.000Z",
    durationMs: 18,
    model: "gpt-5",
    payloadBytes: JSON.stringify(requestPreview).length,
    requestPreview,
    rawResponse,
    schemaValidation: {
      passed: issues.length === 0,
      issues,
    },
    repairNotes: [],
    timings: {
      openAiFetchMs: 12,
      promptBuildMs: 2,
      requestValidationMs: 1,
      responseDecodeMs: 1,
      schemaValidationMs: 1,
      structuredOutputParseMs: 1,
      endToEndMs: 24,
      localScaffoldMs: 3,
      aiRoundTripMs: 18,
      mergeValidationMs: 3,
    },
    ...overrides,
  };
}

async function installPlannerAiMock(
  page: Page,
  handler: (
    request: PlannerAiMockRequest
  ) => Promise<{ status?: number; body: unknown }> | { status?: number; body: unknown }
) {
  const seenFlows: Array<"parse" | "draft" | "replan"> = [];

  await page.route("**/api/planner/ai", async (route) => {
    const request = JSON.parse(route.request().postData() ?? "{}") as PlannerAiMockRequest;
    const response = await handler(request);

    seenFlows.push(request.flow);
    await route.fulfill({
      status: response.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    });
  });

  return seenFlows;
}

function mapTaskToBlockType(task: { type?: string }) {
  switch (task.type) {
    case "deep_work":
      return "focus";
    case "admin":
      return "admin";
    case "chore":
    case "errand":
      return "chore";
    case "self_care":
      return "self_care";
    default:
      return "other";
  }
}

function buildAiDraftBlocks(payload: {
  planningWindow: { startTime: string; endTime: string };
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    hardStartTime?: string;
    hardEndTime?: string;
    splittable: boolean;
    type: string;
  }>;
  hardEvents: Array<{ startTime: string; endTime: string }>;
}) {
  const planningEndMs = new Date(payload.planningWindow.endTime).getTime();
  const hardEvents = [...payload.hardEvents].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const blocks: Array<Record<string, unknown>> = [];
  let cursorMs = new Date(payload.planningWindow.startTime).getTime();
  let hardEventIndex = 0;

  const advancePastHardEvents = () => {
    while (hardEventIndex < hardEvents.length) {
      const event = hardEvents[hardEventIndex];
      const eventStartMs = new Date(event.startTime).getTime();
      const eventEndMs = new Date(event.endTime).getTime();

      if (cursorMs < eventStartMs) {
        break;
      }

      cursorMs = Math.max(cursorMs, eventEndMs);
      hardEventIndex += 1;
    }
  };

  advancePastHardEvents();

  payload.tasks
    .filter((task) => !(task.hardStartTime && task.hardEndTime))
    .forEach((task, index) => {
      let remainingMinutes = Math.max(5, Math.round(task.estimatedMinutes));

      while (remainingMinutes > 0) {
        advancePastHardEvents();

        if (cursorMs >= planningEndMs) {
          return;
        }

        const nextHardStartMs =
          hardEventIndex < hardEvents.length
            ? new Date(hardEvents[hardEventIndex].startTime).getTime()
            : planningEndMs;
        const availableMinutes = Math.floor((nextHardStartMs - cursorMs) / 60000);

        if (availableMinutes <= 0) {
          cursorMs = Math.max(cursorMs, nextHardStartMs);
          continue;
        }

        const scheduledMinutes = task.splittable
          ? Math.min(remainingMinutes, availableMinutes)
          : remainingMinutes;

        if (scheduledMinutes > availableMinutes) {
          return;
        }

        const startTime = new Date(cursorMs).toISOString();
        const endTime = new Date(cursorMs + scheduledMinutes * 60000).toISOString();

        blocks.push({
          id: `ai-draft-block-${task.id}-${index + 1}-${remainingMinutes}`,
          taskId: task.id,
          title: task.title,
          blockType: mapTaskToBlockType(task),
          startTime,
          endTime,
          status: "upcoming",
          locked: false,
          source: "ai",
        });

        cursorMs += scheduledMinutes * 60000;
        remainingMinutes -= scheduledMinutes;

        if (!task.splittable) {
          return;
        }
      }
    });

  return blocks;
}

function buildAiReplanBlocks(payload: {
  currentTime: string;
  currentBlocks: Array<{
    id: string;
    taskId?: string;
    blockType: string;
    startTime: string;
    endTime: string;
    status: string;
    locked: boolean;
  }>;
}) {
  const currentMs = new Date(payload.currentTime).getTime();

  return payload.currentBlocks
    .filter((block) => {
      if (block.locked) {
        return false;
      }

      if (
        block.status === "done" ||
        block.status === "skipped" ||
        block.status === "expired"
      ) {
        return false;
      }

      return new Date(block.startTime).getTime() >= currentMs;
    })
    .map((block) => ({
      ...block,
      source: "ai" as const,
    }));
}

async function loadScenarioAndBuild(page: Page, scenarioName: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({ label: scenarioName });
  await page.getByRole("button", { name: "Load & build plan" }).click();
}

async function loadScenario(page: Page, scenarioName: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({ label: scenarioName });
  await page.getByRole("button", { name: "Load scenario" }).click();
}

async function seedDistinctOverflowBuckets(page: Page) {
  await loadScenarioAndBuild(page, "Overloaded liar-detector day");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem("waykeeper-milestone-3-planner");

        if (!rawValue) {
          return false;
        }

        const session = JSON.parse(rawValue);
        return Boolean(session?.plannerState?.draftScheduleResponse);
      })
    )
    .toBe(true);
  await page.evaluate(() => {
    const storageKey = "waykeeper-milestone-3-planner";
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      throw new Error("Missing persisted planner session");
    }

    const session = JSON.parse(rawValue);

    if (!session?.plannerState?.draftScheduleResponse) {
      throw new Error("Persisted planner session is missing a built draft route");
    }

    const draftScheduleResponse = session.plannerState.draftScheduleResponse;
    const carryForwardItems = draftScheduleResponse.carryForwardItems ?? [];
    const movedItem = carryForwardItems.find(
      (item: { taskId?: string }) => item.taskId === "task-5-call-pharmacy-20m"
    );

    if (!movedItem) {
      throw new Error("Missing carry-forward item to convert into same-day unplaced work");
    }

    draftScheduleResponse.carryForwardItems = carryForwardItems.filter(
      (item: { taskId?: string }) => item.taskId !== "task-5-call-pharmacy-20m"
    );
    draftScheduleResponse.carryForwardTaskIds = (
      draftScheduleResponse.carryForwardTaskIds ?? []
    ).filter((taskId: string) => taskId !== "task-5-call-pharmacy-20m");
    draftScheduleResponse.unplacedTasks = [
      {
        taskId: movedItem.taskId,
        title: movedItem.title,
        reason: "did_not_fit_today",
        remainingMinutes: movedItem.remainingMinutes,
      },
    ];

    window.localStorage.setItem(storageKey, JSON.stringify(session));
  });
  await page.reload();
}

async function getMetricCount(page: Page, testId: string) {
  const rawText = (await page.getByTestId(testId).textContent()) ?? "";
  const match = rawText.match(/\d+/);

  return match ? Number.parseInt(match[0], 10) : 0;
}

async function getCurrentCardTitle(page: Page) {
  return ((await page.getByTestId("current-card").locator("h3").textContent()) ?? "").trim();
}

async function getNextCardTitle(page: Page) {
  return ((await page.getByTestId("next-card").locator("h3").textContent()) ?? "").trim();
}

async function getOraclePanelMode(page: Page) {
  return page.getByTestId("oracle-panel").getAttribute("data-oracle-mode");
}

async function setPlannerTime(page: Page, value: string) {
  await openDeveloperTools(page);
  await page.getByLabel("Set time").fill(value);
}

function getReplanTrigger(page: Page) {
  return page.getByTestId("replan-trigger");
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

  if ((await getReplanTrigger(page).count()) > 0) {
    await getReplanTrigger(page).click();
    await expect(generateButton).toBeVisible();
    return;
  }

  throw new Error("Unable to open the replan panel from the current route state.");
}

function getBrainDumpEditor(page: Page) {
  return page.locator('[role="textbox"][aria-label="Brain dump"]');
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function replaceBrainDumpText(page: Page, value: string) {
  const brainDump = getBrainDumpEditor(page);

  await brainDump.evaluate((element, nextValue) => {
    element.textContent = nextValue;
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, value);
}

async function switchToCsvImport(page: Page) {
  const csvModeButton = page.getByRole("button", { name: "CSV import" });

  await csvModeButton.click();
  await expect(csvModeButton).toHaveAttribute("aria-pressed", "true");
}

async function fillCsvImportText(page: Page, value: string) {
  await page.getByLabel("CSV import text").fill(value);
}

async function openReplanPreview(
  page: Page,
  mode: "replan_from_now" | "keep_essentials_only" | "gentler_remainder" | "use_productive_breaks" | "preserve_focus_first" = "replan_from_now"
) {
  await ensureReplanPanelOpen(page);
  await page.getByLabel("Replan mode").selectOption(mode);
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
}

async function openRouteExportPanel(page: Page) {
  const exportPanel = page.getByTestId("route-export-panel");
  const isOpen = await exportPanel.evaluate(
    (element) => (element as HTMLDetailsElement).open
  );

  if (!isOpen) {
    await exportPanel.locator("summary").click();
  }

  await expect(page.getByTestId("route-export-text")).toBeVisible();
}

async function waitForDraftAiResolution(page: Page) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    if (
      (await page.getByTestId("oracle-draft-ai-refinement-offer").count()) > 0
    ) {
      return "offer" as const;
    }

    const settledCard = page
      .getByTestId("oracle-after-action-card")
      .filter({ hasText: /second pass|no materially better|visible route stayed local/i });

    if ((await settledCard.count()) > 0) {
      return "settled" as const;
    }

    await sleep(100);
  }

  throw new Error("Timed out waiting for draft AI refinement resolution.");
}

async function installClipboardStub(
  page: Page,
  mode: "reject" | "success" = "success"
) {
  await page.evaluate((nextMode) => {
    const windowWithClipboard = window as Window & {
      __WAYKEEPER_CLIPBOARD_WRITES__?: string[];
    };

    windowWithClipboard.__WAYKEEPER_CLIPBOARD_WRITES__ = [];

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          windowWithClipboard.__WAYKEEPER_CLIPBOARD_WRITES__?.push(text);

          if (nextMode === "reject") {
            throw new Error("Clipboard unavailable");
          }
        },
      },
    });
  }, mode);
}

async function getClipboardWrites(page: Page) {
  return page.evaluate(() => {
    const windowWithClipboard = window as Window & {
      __WAYKEEPER_CLIPBOARD_WRITES__?: string[];
    };

    return windowWithClipboard.__WAYKEEPER_CLIPBOARD_WRITES__ ?? [];
  });
}

async function getReplanPreviewCounts(page: Page) {
  const stayedOutMetric = page.getByTestId("replan-metric-stayed-out");
  const deferredMetric = page.getByTestId("replan-metric-deferred");
  const forcedOutMetric = page.getByTestId("replan-metric-forced-out");
  const stayedOutList = page.getByTestId("replan-stayed-out-list");

  const stayedOutCount =
    (await stayedOutMetric.count()) > 0 ? await getMetricCount(page, "replan-metric-stayed-out") : 0;
  const deferredCount =
    (await deferredMetric.count()) > 0 ? await getMetricCount(page, "replan-metric-deferred") : 0;
  const forcedOutCount =
    (await forcedOutMetric.count()) > 0 ? await getMetricCount(page, "replan-metric-forced-out") : 0;
  const stayedOutItems =
    (await stayedOutList.count()) > 0 ? await stayedOutList.locator("li").count() : 0;

  return {
    stayedOutCount,
    deferredCount,
    forcedOutCount,
    stayedOutItems,
  };
}

function getCarryForwardIntakeCard(page: Page, title: string) {
  return page
    .getByTestId("carry-forward-intake")
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function getActiveCarryForwardIntakeCard(page: Page, title: string) {
  return page
    .getByTestId("carry-forward-intake")
    .locator(":scope > ul")
    .first()
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function getIgnoredCarryForwardIntakeCard(page: Page, title: string) {
  return page
    .getByTestId("carry-forward-intake-ignored")
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function getTaskReviewCard(page: Page, title: RegExp | string) {
  return page.locator("li").filter({
    has: page.getByRole("heading", { name: title }),
  });
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function shiftIsoMinutes(isoDateTime: string, minutes: number) {
  const shiftedDateTime = new Date(isoDateTime);
  shiftedDateTime.setMinutes(shiftedDateTime.getMinutes() + minutes);
  return shiftedDateTime.toISOString();
}

async function measureActionDuration(action: () => Promise<void>, settle: () => Promise<void>) {
  const startedAt = Date.now();
  await action();
  await settle();
  return Date.now() - startedAt;
}

async function expectKeyboardFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const focusVisible = await locator.evaluate((element) =>
    element.matches(":focus-visible")
  );

  expect(focusVisible).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await gotoFreshPlanner(page);
});

test("keeps the desktop route focused on timeline and immediate actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadScenarioAndBuild(page, "Normal realistic day");

  await expect(page.getByTestId("task-intake-panel")).toHaveCount(0);
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(getReplanTrigger(page)).toBeVisible();
  await expect(page.getByText("Waykeeper", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Finish Case Presentation Slides" }).first()
  ).toBeVisible();

  const viewportHeight = page.viewportSize()?.height ?? 0;
  const boxes = await Promise.all([
    page.getByTestId("oracle-panel").boundingBox(),
    page.getByTestId("day-timeline").boundingBox(),
  ]);

  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + 40).toBeLessThan(viewportHeight);
  }
});

test("shows a compact countdown only on the active route block", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadScenarioAndBuild(page, "Normal realistic day");

  const currentBlock = page
    .locator('[data-testid="timeline-block"][data-current-route-block="true"]')
    .first();

  await expect(currentBlock).toBeVisible();
  await expect(currentBlock.getByTestId("block-countdown-timer")).toBeVisible();
  await expect(currentBlock.getByTestId("block-countdown-label")).toContainText(
    /remaining of (?:\d+h \d+m|\d+m)/
  );
  await expect(
    page.locator(
      '[data-testid="timeline-block"]:not([data-current-route-block="true"]) [data-testid="block-countdown-timer"]'
    )
  ).toHaveCount(0);
});

test("keeps the visible timeline aligned with the next card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadScenarioAndBuild(page, "Normal realistic day");

  const nextTitle = await getNextCardTitle(page);
  expect(nextTitle.length).toBeGreaterThan(0);

  const nextBlockPresent = await page.evaluate((title) => {
    const timelineBlocks = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="timeline-block"]')
    );
    const nextBlock = timelineBlocks.find(
      (block) => block.dataset.blockTitle === title
    );

    return Boolean(nextBlock);
  }, nextTitle);

  expect(nextBlockPresent).toBe(true);
});

test("keeps the partial-time interpretation flow interactive", async ({ page }) => {
  await loadScenario(page, "Partially time-anchored interpretation test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByText(/detected — lock this to a time\?/).first()
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep flexible" }).first().click();

  await expect(page.getByTestId("feedback-toast")).toContainText("Kept flexible");
  await expect(
    page.getByRole("button", { name: "Build day plan" })
  ).toBeVisible();
});

test("supports spread-out pace mode with visible open time buffers", async ({
  page,
}) => {
  await loadScenario(page, "Spread-out slack day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("button", { name: "Spread out" }).last()
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Build day plan" }).click();

  const timeline = page.getByTestId("day-timeline");

  await expect(timeline).toBeVisible();
  await expect(timeline).toContainText(/Pace:\s*Spread out/);
  await expect(
    page.locator('[data-testid="timeline-block"][data-block-title="Open time"]').first()
  ).toBeVisible();
});

test("keeps draft form state stable across rerender-like interactions", async ({
  page,
}) => {
  await openDeveloperTools(page);
  await page.getByLabel("Scenario").selectOption({
    label: "Granular short-task pileup test",
  });
  await page.getByRole("button", { name: "Load scenario" }).click();

  const updatedBrainDump =
    "review 5 missed cardiology questions 15m\ncall tax office 10m\npack snack bag 5m";

  await replaceBrainDumpText(page, updatedBrainDump);
  await page.getByRole("button", { name: "Add event" }).click();

  const anchorTitle = page.getByLabel("Anchor title").first();
  const anchorStart = page.getByLabel("Anchor start").first();
  const anchorEnd = page.getByLabel("Anchor end").first();

  await anchorTitle.fill("Quick clinic call");
  await anchorStart.fill("09:10");
  await anchorEnd.fill("09:25");

  await page.mouse.wheel(0, 700);
  await page.getByTestId("developer-tools").locator("summary").click();
  await page.getByTestId("developer-tools").locator("summary").click();

  await expect
    .poll(async () =>
      getBrainDumpEditor(page).evaluate((element) =>
        ((element.textContent ?? "").replace(/\u00a0/g, " ").trim())
          .replace(/\s+/g, " ")
          .trim()
      )
    )
    .toBe(normalizeWhitespace(updatedBrainDump));
  await expect(anchorTitle).toHaveValue("Quick clinic call");
  await expect(anchorStart).toHaveValue("09:10 AM");
  await expect(anchorEnd).toHaveValue("09:25 AM");

  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
});

test("keeps anchor presence truthful while anchor rows exist", async ({ page }) => {
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Anchor title").last().fill("Pending clinic call");
  await page.getByLabel("Anchor start").last().fill("09:00");

  await expect(page.getByText("No anchors yet")).toHaveCount(0);
  await expect(page.getByText("Pending anchors")).toBeVisible();
});

test("supports keyboard-first setup and interpretation controls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add event" }).focus();
  await page.keyboard.press("Enter");
  await replaceBrainDumpText(page, "email clinic 15m");

  const anchorTitle = page.getByLabel("Anchor title").last();
  const removeAnchorButton = page.getByRole("button", { name: "Remove" }).last();
  const anchorStart = page.getByLabel("Anchor start").last();
  const anchorEnd = page.getByLabel("Anchor end").last();

  await anchorTitle.focus();
  await anchorTitle.pressSequentially("Keyboard clinic call");
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(removeAnchorButton);
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(anchorStart);
  await anchorStart.fill("09:10");
  await expect(anchorStart).toHaveValue("09:10 AM");
  await anchorEnd.focus();
  await expectKeyboardFocus(anchorEnd);
  await anchorEnd.fill("09:25");
  await expect(anchorEnd).toHaveValue("09:25 AM");

  const interpretButton = page.getByRole("button", { name: "Interpret tasks" });
  await interpretButton.focus();
  await expectKeyboardFocus(interpretButton);
  await interpretButton.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  const buildButton = page.getByRole("button", { name: "Build day plan" });
  await expect(buildButton).toBeVisible();
  await buildButton.focus();
  await expectKeyboardFocus(buildButton);
  await buildButton.press("Enter");

  await expect(page.getByTestId("day-timeline")).toBeVisible();
});

test("imports CSV into structured review and builds through the existing route flow", async ({
  page,
}) => {
  const csvText = [
    "task name,from,stop,block type,priority,deadline,required,details",
    "Study cardiology,10:20,11:10,focus,high,2:30p,,Review chapters",
    "Lunch with preceptor,12:00,13:00,appointment,high,,,Discuss cases",
  ].join("\n");

  await switchToCsvImport(page);
  await fillCsvImportText(page, csvText);
  await page.getByRole("button", { name: "Import CSV" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  await expect(page.getByTestId("task-intake-panel")).toContainText(
    "Lunch With Preceptor"
  );
  await expect(
    page.getByText(/10:20 AM detected — lock this to a time\?/)
  ).toBeVisible();

  await page.getByRole("button", { name: "Keep flexible" }).first().click();
  await expect(page.getByTestId("feedback-toast")).toContainText("Kept flexible");

  await page.getByRole("button", { name: "Build day plan" }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("day-timeline")).toContainText(
    "Lunch With Preceptor"
  );
});

test("CSV import asks before replacing an in-progress setup", async ({ page }) => {
  const csvText = [
    "title,start,end,type",
    "Study cardiology,10:20,11:10,focus",
    "Lunch with preceptor,12:00,13:00,appointment",
  ].join("\n");

  await replaceBrainDumpText(page, "review nephrology 45m");
  await switchToCsvImport(page);
  await fillCsvImportText(page, csvText);
  await page.getByRole("button", { name: "Import CSV" }).click();

  await expect(
    page.getByTestId("csv-import-replace-confirmation")
  ).toBeVisible();
  await page.getByRole("button", { name: "Replace with CSV" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  await expect(page.getByTestId("task-intake-panel")).toContainText(
    "Study Cardiology"
  );
  await expect(page.getByTestId("task-intake-panel")).not.toContainText(
    "review nephrology 45m"
  );
});

test("preserves reviewed task edits across build back and rebuild", async ({
  page,
}) => {
  await loadScenario(page, "Partially time-anchored interpretation test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const reviewCard = getTaskReviewCard(page, /Review .* Questions 90m/i);

  await reviewCard.getByRole("button", { name: "90 min" }).click();
  await reviewCard.getByRole("spinbutton").fill("55");
  await reviewCard.getByRole("spinbutton").press("Enter");

  const insuranceCard = getTaskReviewCard(page, /Call Later About Insurance/i);

  await insuranceCard.getByRole("button", { name: "Due date?" }).click();
  await insuranceCard.getByRole("textbox").fill("3/25/26 3p");
  await insuranceCard.getByRole("textbox").press("Enter");

  await page.getByRole("button", { name: "Build day plan" }).click();
  await page.getByRole("button", { name: "Edit day setup" }).click();
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();

  await expect(reviewCard.getByRole("button", { name: "55 min" })).toBeVisible();
  await expect(
    insuranceCard.getByRole("button", { name: /Mar 25, 3:00 PM\?/i })
  ).toBeVisible();

  await page.getByRole("button", { name: "Build day plan" }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
});

test("hides execution actions during a locked anchor", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();

  await openDeveloperTools(page);
  await page.getByLabel("Set time").fill("13:10");

  await expect(
    page.getByTestId("current-card").getByRole("heading", { name: "Lecture" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
});

test("keeps route actions and replan controls keyboard reachable", async ({
  page,
}) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  const markCompleteButton = page.getByRole("button", { name: "Mark complete" });
  const skipButton = page.getByRole("button", { name: "Skip" });
  const delayTenButton = page.getByRole("button", { name: "Delay 10m" });
  const replanTrigger = getReplanTrigger(page);

  await markCompleteButton.focus();
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(skipButton);
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(delayTenButton);

  await replanTrigger.focus();
  await expectKeyboardFocus(replanTrigger);
  await page.keyboard.press("Enter");

  const replanModeSelect = page.getByLabel("Replan mode");
  await expect(replanModeSelect).toBeVisible();
  await replanModeSelect.focus();
  await expectKeyboardFocus(replanModeSelect);
  await page.keyboard.press("ArrowDown");

  const generateButton = page.getByRole("button", { name: "Generate revised plan" });
  await generateButton.focus();
  await expectKeyboardFocus(generateButton);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
});

test("auto-settles Oracle after-action summaries back to now", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-mode",
    "now"
  );

  await page.getByRole("button", { name: "Mark complete" }).click();

  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-mode",
    "after_action"
  );
  await expect(page.getByTestId("oracle-mode-heading")).toHaveText("What changed");
  await expect(page.getByTestId("oracle-after-action-card")).toBeVisible();

  await expect
    .poll(async () => getOraclePanelMode(page), { timeout: 6000 })
    .toBe("now");

  await expect(page.getByTestId("oracle-mode-heading")).toHaveText("Now");
  await expect(page.getByTestId("oracle-after-action-card")).toHaveCount(0);
});

test("switches Oracle cleanly between now and adjust remainder", async ({
  page,
}) => {
  await loadScenarioAndBuild(page, "Late-day replan stress test");

  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-mode",
    "now"
  );

  await getReplanTrigger(page).click();

  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-mode",
    "adjust"
  );
  await expect(page.getByTestId("oracle-mode-heading")).toHaveText(
    "Adjust remainder"
  );

  await page.getByRole("button", { name: "Back to now" }).click();

  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-mode",
    "now"
  );
  await expect(page.getByTestId("oracle-mode-heading")).toHaveText("Now");
});

test("updates Oracle day-part tint from planner time", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  await setPlannerTime(page, "06:15");
  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-day-part",
    "morning"
  );

  await setPlannerTime(page, "12:15");
  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-day-part",
    "day"
  );

  await setPlannerTime(page, "18:15");
  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-day-part",
    "evening"
  );

  await setPlannerTime(page, "22:15");
  await expect(page.getByTestId("oracle-panel")).toHaveAttribute(
    "data-oracle-day-part",
    "night"
  );
});

test("respects reduced motion in the Oracle panel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadScenarioAndBuild(page, "Execution continuity test");

  const oraclePanel = page.getByTestId("oracle-panel");

  await expect(oraclePanel).toHaveAttribute("data-oracle-reduced-motion", "true");

  const activeDeckDuration = await page
    .getByTestId("oracle-active-deck")
    .evaluate(
      (element) => window.getComputedStyle(element).animationDuration
    );

  expect(activeDeckDuration).toBe("0.001s");
});

test("supports replan preview generate, cancel, and apply", async ({ page }) => {
  await loadScenarioAndBuild(page, "Late-day replan stress test");

  await ensureReplanPanelOpen(page);
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(
    page.getByRole("button", { name: "Apply revised plan" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Apply revised plan" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate revised plan" })
  ).toBeVisible();

  await ensureReplanPanelOpen(page);
  await expect(
    page.getByRole("button", { name: "Generate revised plan" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await page.getByRole("button", { name: "Apply revised plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
});

test("keeps execution state coherent across completion and reload", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  const initialCurrentTitle = await getCurrentCardTitle(page);
  const initialNextTitle = await getNextCardTitle(page);

  await page.getByRole("button", { name: "Mark complete" }).click();

  await expect
    .poll(async () => getCurrentCardTitle(page))
    .not.toBe(initialCurrentTitle);

  const currentTitleAfterComplete = await getCurrentCardTitle(page);
  const nextTitleAfterComplete = await getNextCardTitle(page);

  expect(currentTitleAfterComplete.length).toBeGreaterThan(0);
  expect(nextTitleAfterComplete.length).toBeGreaterThan(0);
  expect(currentTitleAfterComplete).not.toBe(initialCurrentTitle);
  expect(nextTitleAfterComplete).toBe(initialNextTitle);

  await page.reload();

  await expect(page.getByTestId("current-card").locator("h3")).toHaveText(currentTitleAfterComplete);
  await expect(page.getByTestId("next-card").locator("h3")).toHaveText(nextTitleAfterComplete);
});

test("hydrates persisted route state on a cold page load", async ({
  page,
  browser,
}) => {
  await loadScenarioAndBuild(page, "Execution continuity test");
  await page.getByRole("button", { name: "Mark complete" }).click();

  const persistedCurrentTitle = await getCurrentCardTitle(page);
  const persistedNextTitle = await getNextCardTitle(page);
  const persistedStorage = await page.evaluate(() => ({ ...window.localStorage }));

  const coldContext = await browser.newContext();
  await coldContext.addInitScript((storageEntries) => {
    for (const [key, value] of Object.entries(storageEntries)) {
      window.localStorage.setItem(key, value);
    }
  }, persistedStorage);

  const coldPage = await coldContext.newPage();
  await coldPage.goto(PLAYWRIGHT_TEST_BASE_URL);

  await expect(coldPage.getByTestId("oracle-panel")).toBeVisible();
  await expect(coldPage.getByTestId("current-card").locator("h3")).toHaveText(
    persistedCurrentTitle
  );
  await expect(coldPage.getByTestId("next-card").locator("h3")).toHaveText(persistedNextTitle);

  await coldContext.close();
});

test("supports every replan mode and persists an applied replan across reload", async ({ page }) => {
  await loadScenarioAndBuild(page, "Late-day replan stress test");

  for (const mode of [
    "replan_from_now",
    "keep_essentials_only",
    "gentler_remainder",
    "use_productive_breaks",
    "preserve_focus_first",
  ] as const) {
    await ensureReplanPanelOpen(page);
    await page.getByLabel("Replan mode").selectOption(mode);
    await page.getByRole("button", { name: "Generate revised plan" }).click();
    await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  }

  await ensureReplanPanelOpen(page);
  await page.getByLabel("Replan mode").selectOption("gentler_remainder");
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await page.getByRole("button", { name: "Apply revised plan" }).click();
  await expect(page.getByTestId("route-updating-indicator")).toHaveCount(0);
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await page.reload();

  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(page.getByTestId("current-card").locator("h3")).not.toHaveText("");
  await expect(page.getByTestId("next-card").locator("h3")).not.toHaveText("");
  await expect(page.getByText("Last applied")).toHaveCount(0);
});

test("does not duplicate locked anchor labels in the timeline", async ({ page }) => {
  await loadScenarioAndBuild(page, "Overloaded liar-detector day");

  await expect(page.getByText(/^Appointment Appointment$/)).toHaveCount(0);
});

test("keeps the granular short-task route stable on desktop and tablet", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoFreshPlanner(page);
    await loadScenarioAndBuild(page, "Granular short-task pileup test");

    await expect(page.getByTestId("day-timeline")).toBeVisible();
    await expect(page.getByTestId("oracle-panel")).toBeVisible();
    await expect(getReplanTrigger(page)).toBeVisible();
    await page.getByRole("button", { name: "Mark complete" }).click();
    await openReplanPreview(page, "replan_from_now");
    await page.getByRole("button", { name: "Apply revised plan" }).click();
    await expect(page.getByTestId("day-timeline")).toBeVisible();
    await expect(getReplanTrigger(page)).toBeVisible();
  }
});

test("keeps replan preview accounting internally consistent", async ({ page }) => {
  await loadScenarioAndBuild(page, "Late-day replan stress test");

  await openReplanPreview(page, "use_productive_breaks");

  const productiveBreakCounts = await getReplanPreviewCounts(page);

  expect(productiveBreakCounts.stayedOutCount).toBeGreaterThanOrEqual(
    productiveBreakCounts.stayedOutItems
  );
  expect(
    productiveBreakCounts.deferredCount + productiveBreakCounts.forcedOutCount
  ).toBeLessThanOrEqual(productiveBreakCounts.stayedOutCount);
  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();

  await openReplanPreview(page, "keep_essentials_only");

  const essentialsOnlyCounts = await getReplanPreviewCounts(page);

  expect(essentialsOnlyCounts.stayedOutCount).toBeGreaterThanOrEqual(
    essentialsOnlyCounts.stayedOutItems
  );
  expect(
    essentialsOnlyCounts.deferredCount + essentialsOnlyCounts.forcedOutCount
  ).toBeLessThanOrEqual(essentialsOnlyCounts.stayedOutCount);
  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
});

test("shows honest overflow for overloaded days", async ({ page }) => {
  await loadScenarioAndBuild(page, "Overloaded liar-detector day");

  await getReplanTrigger(page).click();
  await expect(page.getByTestId("oracle-panel")).toContainText("Carried forward");
  await expect(page.getByTestId("oracle-panel")).toContainText("6 tasks");
  await expect(page.getByTestId("oracle-panel")).toContainText("Unplaced today");
  await expect(page.getByTestId("oracle-panel")).toContainText("0 tasks");
});

test("keeps same-day unplaced and carried-forward overflow in distinct buckets", async ({
  page,
}) => {
  await seedDistinctOverflowBuckets(page);

  await getReplanTrigger(page).click();
  await expect(page.getByTestId("oracle-panel")).toContainText("Carried forward");
  await expect(page.getByTestId("oracle-panel")).toContainText("5 tasks");
  await expect(page.getByTestId("oracle-panel")).toContainText("Unplaced today");
  await expect(page.getByTestId("oracle-panel")).toContainText("1 tasks");
});

test("keeps next-day carry-forward intake secondary and reviewable", async ({
  page,
}) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(page.getByTestId("carry-forward-intake")).toBeVisible();
  await expect(page.getByText("From yesterday", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review first" }).first()).toBeVisible();
  await expect(page.getByText("already past its due point")).toBeVisible();
  await expect(page.getByTestId("task-intake-panel")).toContainText("Review Renal");
  await expect(page.getByTestId("task-intake-panel")).toContainText(
    "Submit Credentialing Form"
  );
});

test("review first stages exactly one carry-forward task into normal review", async ({
  page,
}) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const carryForwardTitle = "Email attending about schedule swap";
  const carryForwardCard = getCarryForwardIntakeCard(page, carryForwardTitle);

  await expect(carryForwardCard).toContainText("From yesterday");

  await carryForwardCard.getByRole("button", { name: "Review first" }).click();

  await expect(carryForwardCard).toContainText("Review first");
  await expect(page.getByText("From 2026-03-25", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel(`Due for ${carryForwardTitle}`)).toHaveCount(1);
});

test("consumes accepted carry-forward intake exactly once in the UI", async ({
  page,
}) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const acceptedTitle = "Email attending about schedule swap";

  await expect(page.getByTestId("carry-forward-intake")).toContainText(acceptedTitle);
  await expect(page.getByRole("button", { name: "Add to today" })).toHaveCount(2);

  await page.getByRole("button", { name: "Add to today" }).first().click();

  await expect(page.getByRole("button", { name: "Add to today" })).toHaveCount(1);
  await expect(page.getByTestId("carry-forward-intake")).not.toContainText(acceptedTitle);
  await expect(page.getByText(acceptedTitle, { exact: true })).toHaveCount(1);
});

test("ignore for now keeps the item visible in ignored state", async ({ page }) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const ignoredTitle = "Read outpatient cardiology notes";
  const activeCard = getActiveCarryForwardIntakeCard(page, ignoredTitle);

  await expect(activeCard).toBeVisible();

  await activeCard.getByRole("button", { name: "Ignore for now" }).click();

  await expect(getActiveCarryForwardIntakeCard(page, ignoredTitle)).toHaveCount(0);
  await expect(getIgnoredCarryForwardIntakeCard(page, ignoredTitle)).toHaveCount(1);
});

test("due warning stays visible across intake and route surfaces", async ({ page }) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const lateCarryForwardTitle = "Email attending about schedule swap";
  const lateCarryForwardCard = getCarryForwardIntakeCard(page, lateCarryForwardTitle);

  await expect(lateCarryForwardCard).toContainText("already past its due point");
  await expect(lateCarryForwardCard).toContainText("Due");

  await lateCarryForwardCard.getByRole("button", { name: "Add to today" }).click();

  const stagedReviewCard = getTaskReviewCard(page, lateCarryForwardTitle);

  await expect(stagedReviewCard).toContainText("From 2026-03-25");
  await expect(page.getByLabel(`Due for ${lateCarryForwardTitle}`)).toHaveCount(1);
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("current-card")).toContainText(lateCarryForwardTitle);
  await expect(page.getByTestId("day-timeline")).toContainText(lateCarryForwardTitle);
});

test("cold reload restores a route with carry-forward-related state intact", async ({
  page,
  browser,
}) => {
  await loadScenarioAndBuild(page, "Overloaded liar-detector day");

  const persistedCurrentTitle = await getCurrentCardTitle(page);
  const persistedCarryForwardCount = 6;
  const persistedStorage = await page.evaluate(() => ({ ...window.localStorage }));

  const coldContext = await browser.newContext();
  await coldContext.addInitScript((storageEntries) => {
    for (const [key, value] of Object.entries(storageEntries)) {
      window.localStorage.setItem(key, value);
    }
  }, persistedStorage);

  const coldPage = await coldContext.newPage();
  await coldPage.goto(PLAYWRIGHT_TEST_BASE_URL);

  await expect(coldPage.getByTestId("oracle-panel")).toBeVisible();
  await expect(coldPage.getByTestId("current-card").locator("h3")).toHaveText(
    persistedCurrentTitle
  );
  await getReplanTrigger(coldPage).click();
  await expect(coldPage.getByTestId("oracle-panel")).toContainText("Carried forward");
  await expect(coldPage.getByTestId("oracle-panel")).toContainText(
    `${persistedCarryForwardCount} tasks`
  );

  await coldContext.close();
});

test("route export appears only after a route exists and defaults to daily brief", async ({
  page,
}) => {
  await expect(page.getByTestId("route-export-panel")).toHaveCount(0);

  await loadScenarioAndBuild(page, "Normal realistic day");
  await openRouteExportPanel(page);

  await expect(page.getByTestId("route-export-variant-daily-brief")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByTestId("route-export-source-badge")).toContainText(
    "Current route"
  );

  const exportText = await page.getByTestId("route-export-text").inputValue();

  expect(exportText.startsWith("Waykeeper route for")).toBe(true);
  expect(exportText).toContain("Today's shape");
  expect(exportText).toContain("Now / Next");
  expect(exportText).toContain("Schedule");
  expect(exportText).toContain("Oracle note");
  expect(exportText).toContain("Overflow / carry-forward");
  expect(exportText).toContain("How to use this");
});

test("route export switches between LLM-ready and raw text previews", async ({
  page,
}) => {
  await loadScenarioAndBuild(page, "Normal realistic day");
  await openRouteExportPanel(page);

  const dailyBriefText = await page.getByTestId("route-export-text").inputValue();

  await page.getByTestId("route-export-variant-llm").click();
  await expect(page.getByTestId("route-export-variant-llm")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const llmText = await page.getByTestId("route-export-text").inputValue();

  await page.getByTestId("route-export-variant-raw").click();
  await expect(page.getByTestId("route-export-variant-raw")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const rawText = await page.getByTestId("route-export-text").inputValue();

  expect(dailyBriefText).not.toBe(llmText);
  expect(llmText).not.toBe(rawText);
  expect(dailyBriefText.startsWith("Waykeeper route for")).toBe(true);
  expect(llmText.startsWith("Use the following Waykeeper export")).toBe(true);
  expect(rawText.startsWith("Current route for")).toBe(true);
  expect(rawText.includes("Use the following Waykeeper export")).toBe(false);
});

test("route export copies the selected variant to clipboard", async ({ page }) => {
  await loadScenarioAndBuild(page, "Normal realistic day");
  await installClipboardStub(page);
  await openRouteExportPanel(page);

  await page.getByTestId("route-export-variant-raw").click();
  const rawText = await page.getByTestId("route-export-text").inputValue();

  await page.getByTestId("route-export-copy").click();

  await expect(page.getByTestId("route-export-feedback")).toContainText(
    "Copied raw text export."
  );

  const clipboardWrites = await getClipboardWrites(page);
  expect(clipboardWrites.at(-1)).toBe(rawText);
});

test("route export keeps the preview visible when clipboard copy fails", async ({
  page,
}) => {
  await loadScenarioAndBuild(page, "Normal realistic day");
  await installClipboardStub(page, "reject");
  await openRouteExportPanel(page);

  await page.getByTestId("route-export-copy").click();

  await expect(page.getByTestId("route-export-feedback")).toContainText(
    "Clipboard access failed."
  );
  await expect(page.getByTestId("route-export-text")).toBeVisible();
});

test("route export follows the visible replan preview", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");
  await openDeveloperTools(page);
  await page.getByLabel("Set time").fill("11:30");
  await openRouteExportPanel(page);
  await page.getByTestId("route-export-variant-raw").click();

  const prePreviewRouteText = await page.getByTestId("route-export-text").inputValue();

  await openReplanPreview(page, "replan_from_now");
  await openRouteExportPanel(page);

  await expect(page.getByTestId("route-export-source-badge")).toContainText(
    "Visible preview"
  );

  await page.getByTestId("route-export-variant-daily-brief").click();
  const previewRouteText = await page.getByTestId("route-export-text").inputValue();

  expect(previewRouteText).not.toBe(prePreviewRouteText);
  expect(previewRouteText.startsWith("Waykeeper route for")).toBe(true);
  expect(previewRouteText).toContain("Visible replan preview");
});

test("replan from now keeps missed work visible in the remainder", async ({ page }) => {
  await loadScenarioAndBuild(page, "Execution continuity test");

  await openDeveloperTools(page);
  await page.getByLabel("Set time").fill("11:30");

  await openReplanPreview(page, "replan_from_now");
  await page.getByRole("button", { name: "Apply revised plan" }).click();

  await expect(page.getByTestId("current-card")).not.toContainText("Lecture");
  await expect(page.getByTestId("next-card").locator("h3")).toHaveText("Study Neuro");
  await expect(page.getByTestId("day-timeline")).toContainText("Study Neuro");
});

test("replan does not duplicate carry-forward after intake acceptance", async ({
  page,
}) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const acceptedTitle = "Email attending about schedule swap";
  const acceptedCard = getCarryForwardIntakeCard(page, acceptedTitle);

  await acceptedCard.getByRole("button", { name: "Add to today" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();
  await openReplanPreview(page, "replan_from_now");

  await expect(page.getByTestId("carry-forward-intake")).toHaveCount(0);
  const stayedOutList = page.getByTestId("replan-stayed-out-list");

  if ((await stayedOutList.count()) > 0) {
    await expect(stayedOutList).not.toContainText(acceptedTitle);
  }
});

test("reload after intake actions keeps accepted and ignored carry-forward stable", async ({
  page,
}) => {
  await loadScenario(page, "Next-day carry-forward intake test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const acceptedTitle = "Email attending about schedule swap";
  const ignoredTitle = "Read outpatient cardiology notes";

  await getCarryForwardIntakeCard(page, acceptedTitle)
    .getByRole("button", { name: "Add to today" })
    .click();
  await getCarryForwardIntakeCard(page, ignoredTitle)
    .getByRole("button", { name: "Ignore for now" })
    .click();

  await page.reload();
  await expect(page.getByTestId("task-intake-panel")).toBeVisible();

  await expect(getActiveCarryForwardIntakeCard(page, acceptedTitle)).toHaveCount(0);
  await expect(getActiveCarryForwardIntakeCard(page, ignoredTitle)).toHaveCount(0);

  await expect(getIgnoredCarryForwardIntakeCard(page, ignoredTitle)).toHaveCount(1);
  await expect(page.getByLabel(`Due for ${acceptedTitle}`)).toHaveCount(1);
});

test("surfaces planning-window and incomplete-fixed-event validation", async ({
  page,
}) => {
  await replaceBrainDumpText(page, "study neuro 60m");
  await page.locator('input[aria-label="Start"]').fill("18:00");
  await page.locator('input[aria-label="End"]').fill("08:00");

  await expect(
    page.getByText("Set the end time later than the start time.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Anchor title").last().fill("Doctor appointment");
  await page.getByLabel("Anchor start").last().fill("09:00");

  await expect(
    page.getByText("Add both times to place this event on the timeline.")
  ).toBeVisible();
});

test("resets replan mode to the base option on rebuild", async ({ page }) => {
  await loadScenarioAndBuild(page, "Normal realistic day");

  await getReplanTrigger(page).click();
  await page.getByLabel("Replan mode").selectOption("use_productive_breaks");
  await expect(page.getByLabel("Replan mode")).toHaveValue("use_productive_breaks");

  await page.getByRole("button", { name: "Edit day setup" }).click();
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();
  await getReplanTrigger(page).click();

  await expect(page.getByLabel("Replan mode")).toHaveValue("replan_from_now");
});

test("uses the timeline as the only bounded scroll surface in route mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadScenarioAndBuild(page, "Normal realistic day");

  const overflowStyles = await page.evaluate(() => {
    const timeline = document.querySelector<HTMLElement>(
      '[data-testid="timeline-scroll-region"]'
    );
    const oraclePanel = document.querySelector<HTMLElement>(
      '[data-testid="oracle-panel"]'
    );
    const replan = document.querySelector<HTMLElement>('[data-testid="replan-panel"]');

    return {
      timelineBounded:
        timeline?.getAttribute("data-bounded-scroll") === "true" &&
        (timeline?.scrollHeight ?? 0) > (timeline?.clientHeight ?? 0),
      oraclePanel: oraclePanel
        ? window.getComputedStyle(oraclePanel).overflowY
        : null,
      replan: replan ? window.getComputedStyle(replan).overflowY : null,
      timeline: timeline ? window.getComputedStyle(timeline).overflowY : null,
    };
  });

  expect(overflowStyles.timelineBounded).not.toBeNull();
  expect(["", "clip", "hidden", "visible"]).toContain(
    overflowStyles.oraclePanel ?? ""
  );
  expect(["", "clip", "visible"]).toContain(overflowStyles.replan ?? "");
  await expect(page.getByTestId("task-intake-panel")).toHaveCount(0);
});

test("keeps timeline auto-focus restrained", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadScenarioAndBuild(page, "Normal realistic day");

  const timelineScrollRegion = page.getByTestId("timeline-scroll-region");

  await timelineScrollRegion.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });

  await openDeveloperTools(page);
  await page.getByRole("button", { name: "+15m" }).click();

  await expect
    .poll(() =>
      timelineScrollRegion.evaluate((element) => element.scrollTop)
    )
    .toBeLessThan(16);

  await getReplanTrigger(page).click();
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect
    .poll(() =>
      timelineScrollRegion.evaluate((element) => element.scrollTop)
    )
    .toBeLessThan(16);
});

test("developer AI interpretation mode returns structured tasks and diagnostics", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task, index) => ({
          ...task,
          title: index === 0 ? `${task.title} AI refined` : task.title,
          estimatedMinutes: Math.max(10, task.estimatedMinutes),
          source: "ai",
        })
      ),
      warnings: ["Estimated ambiguous work conservatively."],
      followUpQuestions: ["Which errand is truly due today?"],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics(
          "parse",
          request.payload,
          result
        ),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await expect(page.getByTestId("ai-engine-interpretation")).toHaveValue("ai");

  await replaceBrainDumpText(
    page,
    "review renal lecture notes 45m\nemail clinic about forms 10m\npick up prescription"
  );
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /AI refined/i }).first()
  ).toBeVisible();
  await expect(
    page.getByTestId("task-intake-panel").getByText("Follow-up questions")
  ).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).toContainText(
    "Schema passed"
  );

  expect(seenFlows).toContain("parse");
  expect(seenFlows.every((flow) => flow === "parse")).toBe(true);
});

test("developer AI engine selections stay split by flow and survive reload", async ({
  page,
}) => {
  await setEngineMode(page, "interpretation", "ai");
  await setEngineMode(page, "draft", "local");
  await setEngineMode(page, "replan", "ai");

  await expect(page.getByTestId("ai-engine-interpretation")).toHaveValue("ai");
  await expect(page.getByTestId("ai-engine-draft")).toHaveValue("local");
  await expect(page.getByTestId("ai-engine-replan")).toHaveValue("ai");

  await page.reload();
  await openDeveloperTools(page);

  await expect(page.getByTestId("ai-engine-interpretation")).toHaveValue("ai");
  await expect(page.getByTestId("ai-engine-draft")).toHaveValue("local");
  await expect(page.getByTestId("ai-engine-replan")).toHaveValue("ai");
});

test("high-confidence AI interpretation uses refine strategy", async ({
  page,
}) => {
  const seenStrategies: Array<"refine" | "full"> = [];

  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    seenStrategies.push(request.strategy);

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task) => ({
          ...task,
          source: "ai",
        })
      ),
      warnings: [],
      followUpQuestions: [],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("parse", request.payload, result, [], {
          strategy: request.strategy,
        }),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await replaceBrainDumpText(page, "email clinic about forms 15m\nshower 20m");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).toContainText(
    "Parse refine"
  );
  expect(seenStrategies).toEqual(["refine"]);
});

test("low-confidence AI interpretation escalates to full strategy", async ({
  page,
}) => {
  const seenStrategies: Array<"refine" | "full"> = [];

  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    seenStrategies.push(request.strategy);

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task) => ({
          ...task,
          source: "ai",
        })
      ),
      warnings: ["Clarified the ambiguous planning dump."],
      followUpQuestions: ["Which task is actually due today?"],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("parse", request.payload, result, [], {
          strategy: request.strategy,
        }),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await loadScenario(page, "Ambiguous human-chaos input test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("heading", { name: "Review the interpreted tasks" })
  ).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).toContainText(
    "Parse full"
  );
  expect(seenStrategies).toEqual(["full"]);
});

test("slow AI interpretation preserves the AI result after waiting", async ({
  page,
}) => {
  await setPlannerAiTimeoutOverrides(page, {
    parse: {
      softMs: 50,
      hardMs: 10000,
    },
  });
  await gotoFreshPlanner(page);

  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task, index) => ({
          ...task,
          title: index === 0 ? `${task.title} AI refined` : task.title,
          source: "ai",
        })
      ),
      warnings: [],
      followUpQuestions: [],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("parse", request.payload, result, [], {
          strategy: request.strategy,
        }),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await replaceBrainDumpText(page, "email clinic 15m\nshower 20m");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(page.getByRole("heading", { name: /AI refined/i }).first()).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).toContainText(
    "Parse refine"
  );
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).not.toContainText(
    "fallback"
  );
});

test("AI draft keeps the local route visible until Oracle resolves a second-pass refinement", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(900);

    const payload = request.payload as PlannerAiMockDraftPayload;
    const aiTasks = payload.tasks.map((task) => ({
      ...stripMockTaskRouteContext(task),
      title: `${task.title} AI refined`,
      source: "ai" as const,
    }));
    const result = {
      tasks: aiTasks,
      blocks: buildAiDraftBlocks({
        planningWindow: payload.planningWindow,
        tasks: aiTasks,
        hardEvents: payload.hardEvents,
      }),
      warnings: ["Reviewed the visible route for a cleaner second pass."],
      summary: "Prepared a visibly different AI refinement for review.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("draft", payload, result),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "AI draft believability comparison");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const buildStartedAt = Date.now();
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  const routeVisibleMs = Date.now() - buildStartedAt;
  await expect(page.getByTestId("oracle-draft-ai-refinement-offer")).toHaveCount(0);
  await expect(
    page.locator('[data-testid="timeline-block"][data-block-title*="AI refined"]')
  ).toHaveCount(0);

  const draftResolution = await waitForDraftAiResolution(page);
  const refinementReadyMs = Date.now() - buildStartedAt;

  expect(routeVisibleMs).toBeLessThan(refinementReadyMs);
  expect(refinementReadyMs - routeVisibleMs).toBeGreaterThanOrEqual(300);

  if (draftResolution === "offer") {
    await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
      "explicit compare/apply refinement"
    );
  } else {
    await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
      "visible route stayed local"
    );
  }
  await expect(
    page.locator('[data-testid="timeline-block"][data-block-title*="AI refined"]')
  ).toHaveCount(0);

  if (draftResolution === "offer") {
    await page.getByRole("button", { name: "Apply refined route" }).click();
    await expect(page.getByTestId("oracle-draft-ai-refinement-offer")).toHaveCount(0);
    expect(
      await page
        .locator('[data-testid="timeline-block"][data-block-title*="AI refined"]')
        .count()
    ).toBeGreaterThan(0);
  } else {
    await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
      "visible route stayed local"
    );
  }
});

test("AI parse-backed build keeps the local route visible", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(900);

    const payload = request.payload as PlannerAiMockParsePayload;
    const result = {
      tasks: payload.baselineTasks.map((task) =>
        task.title.toLowerCase().includes("grocery")
          ? {
              ...task,
              estimatedMinutes: 45,
              mustDoToday: true,
              priority: "critical" as const,
              source: "ai" as const,
            }
          : {
              ...task,
              source: "ai" as const,
            }
      ),
      warnings: [],
      followUpQuestions: [],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("parse", payload, result),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await setEngineMode(page, "draft", "local");
  await loadScenario(page, "AI draft believability comparison");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await expect(page.getByRole("button", { name: "Build day plan" })).toBeVisible();

  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-draft-ai-refinement-offer")).toHaveCount(0);
  await expect(page.getByTestId("route-updating-indicator")).toHaveCount(0);

  expect(seenFlows).toEqual(["parse"]);
});

test("AI replan keeps the local preview visible until Oracle offers an explicit remainder option", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(900);

    const payload = request.payload as PlannerAiMockReplanPayload;
    const carryForwardTaskId = payload.tasks.at(-1)?.id;
    const result = {
      blocks: buildAiReplanBlocks(payload).filter(
        (block) => block.taskId !== carryForwardTaskId
      ),
      carryForwardTaskIds: carryForwardTaskId ? [carryForwardTaskId] : [],
      warnings: ["Prepared a leaner AI remainder option without touching history."],
      summary: "Prepared a different remainder option for review.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("replan", payload, result),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await loadScenarioAndBuild(page, "Late-day replan stress test");
  await getReplanTrigger(page).click();

  const replanStartedAt = Date.now();
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
  const localPreviewVisibleMs = Date.now() - replanStartedAt;
  await expect(page.getByTestId("oracle-replan-ai-refinement-offer")).toHaveCount(0);

  const revisedAheadBefore = normalizeWhitespace(
    (await page.getByTestId("replan-metric-revised-ahead").textContent()) ?? ""
  );
  const carriedForwardBefore = normalizeWhitespace(
    (await page.getByTestId("replan-metric-stayed-out").textContent()) ?? ""
  );

  await expect(page.getByTestId("oracle-replan-ai-refinement-offer")).toBeVisible();
  const refinementReadyMs = Date.now() - replanStartedAt;

  expect(localPreviewVisibleMs).toBeLessThan(refinementReadyMs);
  expect(refinementReadyMs - localPreviewVisibleMs).toBeGreaterThanOrEqual(300);

  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "explicit compare/apply remainder option"
  );
  expect(
    normalizeWhitespace(
      (await page.getByTestId("replan-metric-revised-ahead").textContent()) ?? ""
    )
  ).toBe(revisedAheadBefore);
  expect(
    normalizeWhitespace(
      (await page.getByTestId("replan-metric-stayed-out").textContent()) ?? ""
    )
  ).toBe(carriedForwardBefore);

  await page.getByRole("button", { name: "Use AI option" }).click();
  await expect(page.getByTestId("oracle-replan-ai-refinement-offer")).toHaveCount(0);

  const revisedAheadAfter = normalizeWhitespace(
    (await page.getByTestId("replan-metric-revised-ahead").textContent()) ?? ""
  );
  const carriedForwardAfter = normalizeWhitespace(
    (await page.getByTestId("replan-metric-stayed-out").textContent()) ?? ""
  );

  expect(
    revisedAheadAfter !== revisedAheadBefore ||
      carriedForwardAfter !== carriedForwardBefore
  ).toBe(true);
});

test("AI replan no-change or invalid second pass keeps the local adjust deck visible", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(750);

    const payload = request.payload as PlannerAiMockReplanPayload;
    const result = {
      blocks: payload.localScaffold.blocks.map((block, index) =>
        index === payload.localScaffold.blocks.length - 1
          ? {
              ...block,
              startTime: shiftIsoMinutes(block.startTime, 5),
              endTime: shiftIsoMinutes(block.endTime, 5),
            }
          : block
      ),
      carryForwardTaskIds: payload.localScaffold.carryForwardTaskIds,
      warnings: ["Checked the visible local remainder for a calmer second pass."],
      summary: "Reviewed the remainder without changing the practical route shape.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("replan", payload, result),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await loadScenarioAndBuild(page, "Late-day replan stress test");
  await getReplanTrigger(page).click();
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
  await expect(page.getByTestId("oracle-replan-ai-refinement-offer")).toHaveCount(0);
  await expect(page.getByTestId("oracle-mode-heading")).toHaveText("Adjust remainder");
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    /visible local replan preview stayed in place|Second pass checked/
  );
});

test("AI interpretation latency stays visible in the UI and diagnostics", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(220);

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task, index) => ({
          ...task,
          title: index === 0 ? `${task.title} AI timed` : task.title,
          estimatedMinutes: Math.max(10, task.estimatedMinutes),
          source: "ai",
        })
      ),
      warnings: [],
      followUpQuestions: [],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("parse", request.payload, result, [], {
          durationMs: 228,
          timings: {
            openAiFetchMs: 180,
            promptBuildMs: 14,
            requestValidationMs: 6,
            responseDecodeMs: 11,
            schemaValidationMs: 9,
            structuredOutputParseMs: 8,
          },
        }),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await replaceBrainDumpText(page, "review renal lecture notes 45m\nemail clinic 10m");

  const elapsedMs = await measureActionDuration(
    async () => {
      await page.getByRole("button", { name: "Interpret tasks" }).click();
    },
    async () => {
      await expect(
        page.getByRole("heading", { name: "Review the interpreted tasks" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /AI timed/i }).first()
      ).toBeVisible();
    }
  );

  expect(elapsedMs).toBeGreaterThanOrEqual(180);
  expect(elapsedMs).toBeLessThan(5000);

  const diagnostics = getDiagnosticsPanel(page, "Interpretation diagnostics");
  await expect(diagnostics).toContainText("Timings");
  await expect(diagnostics).toContainText("Fetch 180ms");
  await expect(diagnostics).toContainText("Prompt 14ms");
});

test("AI draft build latency measures click-to-usable route before the AI refinement lands", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(650);

    const payload = request.payload as PlannerAiMockDraftPayload;
    const aiTasks = payload.tasks.map((task) => ({
      ...stripMockTaskRouteContext(task),
      title: `${task.title} AI timed`,
      source: "ai" as const,
    }));
    const result = {
      tasks: aiTasks,
      blocks: buildAiDraftBlocks({
        planningWindow: payload.planningWindow,
        tasks: aiTasks,
        hardEvents: payload.hardEvents,
      }),
      warnings: ["Kept the route inside the current planning window."],
      summary: "Built a measured AI draft route.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("draft", payload, result, [], {
          durationMs: 661,
          timings: {
            openAiFetchMs: 580,
            promptBuildMs: 18,
            requestValidationMs: 8,
            responseDecodeMs: 12,
            schemaValidationMs: 11,
            structuredOutputParseMs: 12,
          },
        }),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "Normal realistic day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  const buildButton = page.getByRole("button", { name: "Build day plan" });

  const startedAt = Date.now();
  await buildButton.click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  const routeVisibleMs = Date.now() - startedAt;
  await expect(page.getByTestId("oracle-draft-ai-refinement-offer")).toBeVisible();
  const refinementReadyMs = Date.now() - startedAt;

  expect(routeVisibleMs).toBeLessThan(refinementReadyMs);
  expect(refinementReadyMs - routeVisibleMs).toBeGreaterThanOrEqual(250);
  expect(refinementReadyMs).toBeLessThan(5000);

  const diagnostics = getDiagnosticsPanel(page, "Draft diagnostics");
  await expect(diagnostics).toContainText("Timings");
  await expect(diagnostics).toContainText("Local scaffold");
  await expect(diagnostics).toContainText("AI round trip");
  await expect(diagnostics).toContainText("Fetch 580ms");
  await expect(diagnostics).toContainText("explicit compare/apply refinement");
  await expect(diagnostics).toContainText("Built a measured AI draft route.");
});

test("AI replan latency measures click-to-usable preview before the AI refinement lands", async ({
  page,
}) => {
  await installPlannerAiMock(page, async (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    await sleep(650);

    const payload = request.payload as PlannerAiMockReplanPayload;
    const carryForwardTaskId = payload.tasks.at(-1)?.id;
    const result = {
      blocks: buildAiReplanBlocks(payload).filter(
        (block) => block.taskId !== carryForwardTaskId
      ),
      carryForwardTaskIds: carryForwardTaskId ? [carryForwardTaskId] : [],
      warnings: ["Rebuilt only the remaining unlocked portion of the day."],
      summary: "Replanned the remainder on a measured delay.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("replan", payload, result, [], {
          durationMs: 659,
          timings: {
            openAiFetchMs: 560,
            promptBuildMs: 16,
            requestValidationMs: 7,
            responseDecodeMs: 11,
            schemaValidationMs: 10,
            structuredOutputParseMs: 9,
          },
        }),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await loadScenarioAndBuild(page, "Late-day replan stress test");
  await getReplanTrigger(page).click();

  const startedAt = Date.now();
  await page.getByRole("button", { name: "Generate revised plan" }).click();
  await expect(
    page.getByRole("button", { name: "Apply revised plan" })
  ).toBeVisible();
  const previewVisibleMs = Date.now() - startedAt;
  await expect(page.getByTestId("oracle-replan-ai-refinement-offer")).toBeVisible();
  const refinementReadyMs = Date.now() - startedAt;

  expect(previewVisibleMs).toBeLessThan(refinementReadyMs);
  expect(refinementReadyMs - previewVisibleMs).toBeGreaterThanOrEqual(250);
  expect(refinementReadyMs).toBeLessThan(5000);

  const diagnostics = getDiagnosticsPanel(page, "Replan diagnostics");
  await expect(diagnostics).toContainText("Timings");
  await expect(diagnostics).toContainText("Local scaffold");
  await expect(diagnostics).toContainText("AI round trip");
  await expect(diagnostics).toContainText("Fetch 560ms");
  await expect(diagnostics).toContainText("explicit compare/apply remainder option");
  await expect(diagnostics).toContainText("Replanned the remainder on a measured delay.");
});

test("AI interpretation diagnostics stay inspectable with repair notes schema issues and payload previews", async ({
  page,
}) => {
  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const result = {
      tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
        (task) => ({
          ...task,
          title: `${task.title} AI polished`,
          estimatedMinutes: Math.max(10, task.estimatedMinutes),
          source: "ai",
        })
      ),
      warnings: ["Clarified vague durations conservatively."],
      followUpQuestions: ["Which task is truly fixed today?"],
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: {
          ...buildMockPlannerAiDiagnostics("parse", request.payload, result, [
            "One title was normalized from ambiguous text.",
          ]),
          schemaValidation: {
            passed: false,
            issues: ["One title was normalized from ambiguous text."],
          },
          repairNotes: [
            "Promoted an inferred errand into a structured admin task.",
          ],
        },
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await replaceBrainDumpText(
    page,
    "review renal lecture notes 45m\nemail clinic about forms 10m"
  );
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  const interpretationDiagnostics = getDiagnosticsPanel(
    page,
    "Interpretation diagnostics"
  );

  await expect(interpretationDiagnostics).toContainText("Schema failed");
  await expect(interpretationDiagnostics).toContainText("Repair notes");
  await expect(interpretationDiagnostics).toContainText("Schema issues");
  await interpretationDiagnostics.getByText("Request", { exact: true }).click();
  await expect(interpretationDiagnostics).toContainText("review renal lecture notes");
  await interpretationDiagnostics.getByText("Response", { exact: true }).click();
  await expect(interpretationDiagnostics).toContainText("AI polished");
});

test("AI interpretation failures preserve editable setup and keep diagnostics visible", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "parse") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    return {
      status: 503,
      body: {
        ok: false,
        error: "Mock AI parse failure",
        diagnostics: buildMockPlannerAiDiagnostics(
          "parse",
          request.payload,
          null,
          ["Mock AI parse failure"]
        ),
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await replaceBrainDumpText(page, "email clinic 15m\nshower 20m");
  await page.getByRole("button", { name: "Interpret tasks" }).click();

  await expect(
    page.getByRole("heading", { name: "Let's get to know your day." })
  ).toBeVisible();
  await expect(getBrainDumpEditor(page)).toContainText("email clinic 15m");
  await expect(getDiagnosticsPanel(page, "Interpretation diagnostics")).toContainText(
    "AI interpretation failed: Mock AI parse failure"
  );

  expect(seenFlows).toEqual(["parse"]);
});

test("developer AI draft mode builds a validated route through the shared pipeline", async ({
  page,
}) => {
  const seenDraftPayloads: PlannerAiMockDraftPayload[] = [];
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const payload = request.payload as PlannerAiMockDraftPayload;
    seenDraftPayloads.push(payload);

    const result = {
      tasks: payload.tasks.map((task) => ({
        ...stripMockTaskRouteContext(task),
        source: "ai",
      })),
      blocks: buildAiDraftBlocks(payload),
      warnings: ["Kept the route inside the current planning window."],
      summary: "Built a conservative AI draft route.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics(
          "draft",
          request.payload,
          result
        ),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await expect(page.getByTestId("ai-engine-draft")).toHaveValue("ai");

  await loadScenario(page, "Normal realistic day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Draft diagnostics"
  );
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Built a conservative AI draft route."
  );
  await expect(page.getByTestId("current-card")).toBeVisible();
  await expect(getReplanTrigger(page)).toBeVisible();

  expect(seenDraftPayloads[0]?.localScaffold.blocks.length).toBeGreaterThan(0);
  expect(seenDraftPayloads[0]?.localScaffold.qualityHints).toBeDefined();
  expect(
    seenDraftPayloads[0]?.tasks.every((task) => Boolean(task.routeContext))
  ).toBe(true);
  expect(
    seenDraftPayloads[0]?.tasks.some(
      (task) => task.routeContext?.locationContext !== "unknown"
    )
  ).toBe(true);
  expect(seenFlows).toContain("draft");
  expect(seenFlows.every((flow) => flow === "draft")).toBe(true);
});

test("AI draft rebuild sends the previous accepted proposal and task deltas after a small review edit", async ({
  page,
}) => {
  const seenDraftPayloads: PlannerAiMockDraftPayload[] = [];

  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const payload = request.payload as PlannerAiMockDraftPayload;
    seenDraftPayloads.push(payload);
    const isFirstDraft = seenDraftPayloads.length === 1;
    const aiTasks = payload.tasks.map((task) => ({
      ...stripMockTaskRouteContext(task),
      title: isFirstDraft ? `${task.title} AI accepted` : `${task.title} AI revised`,
      source: "ai" as const,
    }));

    const result = {
      tasks: aiTasks,
      blocks: buildAiDraftBlocks({
        planningWindow: payload.planningWindow,
        tasks: aiTasks,
        hardEvents: payload.hardEvents,
      }),
      warnings: ["Stayed close to the previous accepted route where possible."],
      summary: "Rebuilt from the previous AI route with a small edit.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("draft", payload, result),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "Normal realistic day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-draft-ai-refinement-offer")).toBeVisible();
  await page.getByRole("button", { name: "Apply refined route" }).click();
  expect(
    await page
      .locator('[data-testid="timeline-block"][data-block-title*="AI accepted"]')
      .count()
  ).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Edit day setup" }).click();
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  const editedReviewCard = getTaskReviewCard(page, /Finish Case Presentation Slides/i);
  await editedReviewCard.getByRole("button", { name: /\d+\s+min/i }).first().click();
  await editedReviewCard.getByRole("spinbutton").fill("55");
  await editedReviewCard.getByRole("spinbutton").press("Enter");
  await page.getByRole("button", { name: /Rebuild day plan|Build day plan/i }).click();
  await expect(page.getByTestId("day-timeline")).toBeVisible();

  expect(seenDraftPayloads).toHaveLength(2);
  expect(seenDraftPayloads[0]?.previousAcceptedAiProposal).toBeUndefined();
  expect(
    seenDraftPayloads[1]?.previousAcceptedAiProposal?.blockIds.length
  ).toBeGreaterThan(0);
  expect(seenDraftPayloads[1]?.changedTaskIds?.length).toBeGreaterThan(0);
  expect(
    seenDraftPayloads[1]?.taskDeltas?.some((delta) =>
      delta.changedFields.includes("estimatedMinutes")
    )
  ).toBe(true);
});

test("AI interpretation and draft diagnostics can coexist without clobbering each other", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow === "parse") {
      const result = {
        tasks: (request.payload as PlannerAiMockParsePayload).baselineTasks.map(
          (task) => ({
            ...task,
            title: `${task.title} AI reviewed`,
            estimatedMinutes: Math.max(10, task.estimatedMinutes),
            source: "ai",
          })
        ),
        warnings: ["AI interpretation kept timing conservative."],
        followUpQuestions: [],
      };

      return {
        body: {
          ok: true,
          result,
          diagnostics: buildMockPlannerAiDiagnostics(
            "parse",
            request.payload,
            result
          ),
        },
      };
    }

    if (request.flow === "draft") {
      const result = {
        tasks: (request.payload as PlannerAiMockDraftPayload).tasks.map((task) => ({
          ...stripMockTaskRouteContext(task),
          source: "ai",
        })),
        blocks: buildAiDraftBlocks(request.payload as PlannerAiMockDraftPayload),
        warnings: ["AI draft kept all hard events app-owned."],
        summary: "Built an inspectable AI route.",
      };

      return {
        body: {
          ok: true,
          result,
          diagnostics: buildMockPlannerAiDiagnostics(
            "draft",
            request.payload,
            result
          ),
        },
      };
    }

    return {
      status: 500,
      body: {
        ok: false,
        error: `Unexpected planner AI flow: ${request.flow}`,
      },
    };
  });

  await setEngineMode(page, "interpretation", "ai");
  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "Normal realistic day");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(
    getDiagnosticsPanel(page, "Interpretation diagnostics")
  ).toContainText("Schema passed");
  await expect(
    getDiagnosticsPanel(page, "Interpretation diagnostics")
  ).toContainText("gpt-5");
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Built an inspectable AI route."
  );
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Schema passed"
  );

  expect(seenFlows).toEqual(["parse", "draft"]);
});

test("developer AI replan mode revises only the remainder and captures diagnostics", async ({
  page,
}) => {
  const seenReplanPayloads: PlannerAiMockReplanPayload[] = [];
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const payload = request.payload as PlannerAiMockReplanPayload;
    seenReplanPayloads.push(payload);

    const result = {
      blocks: buildAiReplanBlocks(payload),
      warnings: ["Rebuilt only the remaining unlocked portion of the day."],
      summary: "Replanned from the current time boundary.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics(
          "replan",
          request.payload,
          result
        ),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await expect(page.getByTestId("ai-engine-replan")).toHaveValue("ai");

  await loadScenarioAndBuild(page, "Late-day replan stress test");
  await getReplanTrigger(page).click();
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(
    page.getByRole("button", { name: "Apply revised plan" })
  ).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "Replan diagnostics"
  );
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "Replanned from the current time boundary."
  );

  expect(seenReplanPayloads[0]?.localScaffold.blocks.length).toBeGreaterThan(0);
  expect(seenReplanPayloads[0]?.localScaffold.summaryLines.length).toBeGreaterThan(0);
  expect(
    seenReplanPayloads[0]?.tasks.every((task) => Boolean(task.routeContext))
  ).toBe(true);
  expect(seenFlows).toContain("replan");
  expect(seenFlows.every((flow) => flow === "replan")).toBe(true);
});

test("AI replan failures preserve the live route and keep the tool inspectable", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    return {
      status: 503,
      body: {
        ok: false,
        error: "Mock AI replan failure",
        diagnostics: buildMockPlannerAiDiagnostics(
          "replan",
          request.payload,
          null,
          ["Mock AI replan failure"]
        ),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await loadScenarioAndBuild(page, "Late-day replan stress test");

  await ensureReplanPanelOpen(page);
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "AI replanning failed: Mock AI replan failure"
  );
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "background AI review failed"
  );

  expect(seenFlows).toEqual(["replan"]);
});

test("AI draft failures preserve the reviewed task state and stay inspectable", async ({
  page,
}) => {
  const seenFlows = await installPlannerAiMock(page, (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    return {
      status: 503,
      body: {
        ok: false,
        error: "Mock AI draft failure",
        diagnostics: buildMockPlannerAiDiagnostics(
          "draft",
          request.payload,
          null,
          ["Mock AI draft failure"]
        ),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "Partially time-anchored interpretation test");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("oracle-panel")).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "AI draft scheduling failed: Mock AI draft failure"
  );
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "background AI review failed"
  );

  expect(seenFlows).toContain("draft");
  expect(seenFlows.every((flow) => flow === "draft")).toBe(true);
});

test("AI draft comparison scenario stays inspectable through the draft diagnostics panel", async ({
  page,
}) => {
  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "draft") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const payload = request.payload as PlannerAiMockDraftPayload;
    const result = {
      tasks: payload.tasks.map((task) => ({
        ...stripMockTaskRouteContext(task),
        source: "ai",
      })),
      blocks: buildAiDraftBlocks(payload),
      warnings: ["Kept the non-splittable slides block intact."],
      summary: "Built an inspectable AI comparison draft.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("draft", payload, result),
      },
    };
  });

  await setEngineMode(page, "draft", "ai");
  await loadScenario(page, "AI draft believability comparison");
  await page.getByRole("button", { name: "Interpret tasks" }).click();
  await page.getByRole("button", { name: "Build day plan" }).click();

  await expect(page.getByTestId("day-timeline")).toBeVisible();
  await expect(page.getByTestId("current-card")).toBeVisible();
  await expect(
    page
      .locator('[data-testid="timeline-block"]')
      .filter({
        has: page.getByRole("heading", {
          name: /finish presentation slides/i,
        }),
      })
      .first()
  ).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Built an inspectable AI comparison draft."
  );
  await expect(getDiagnosticsPanel(page, "Draft diagnostics")).toContainText(
    "Schema passed"
  );
});

test("AI stale-route replan comparison scenario stays inspectable through replan diagnostics", async ({
  page,
}) => {
  await installPlannerAiMock(page, (request) => {
    if (request.flow !== "replan") {
      return {
        status: 500,
        body: {
          ok: false,
          error: `Unexpected planner AI flow: ${request.flow}`,
        },
      };
    }

    const payload = request.payload as PlannerAiMockReplanPayload;
    const result = {
      blocks: buildAiReplanBlocks(payload),
      warnings: ["Recovered the stale remainder without touching locked therapy."],
      summary: "Built an inspectable AI stale-route replan.",
    };

    return {
      body: {
        ok: true,
        result,
        diagnostics: buildMockPlannerAiDiagnostics("replan", payload, result),
      },
    };
  });

  await setEngineMode(page, "replan", "ai");
  await loadScenarioAndBuild(page, "AI stale-route replan comparison");
  await ensureReplanPanelOpen(page);
  await page.getByRole("button", { name: "Generate revised plan" }).click();

  await expect(page.getByRole("button", { name: "Apply revised plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adjust remainder" })).toBeVisible();
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "Built an inspectable AI stale-route replan."
  );
  await expect(getDiagnosticsPanel(page, "Replan diagnostics")).toContainText(
    "Schema passed"
  );
});
