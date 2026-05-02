import {
  createCarryForwardSeedItem,
} from "@/app/_lib/planner/carry-forward";
import type {
  BreakCadence,
  BreakMode,
  CarryForwardItem,
  PaceMode,
} from "@/app/_lib/planner-types";

interface PlannerDevScenarioFixedEvent {
  endTime: string;
  note?: string;
  startTime: string;
  title: string;
}

export interface PlannerDevScenario {
  breakCadence?: BreakCadence;
  breakMode: BreakMode;
  paceMode?: PaceMode;
  covers?: string[];
  currentTime?: string;
  date?: string;
  description: string;
  fixedEvents: PlannerDevScenarioFixedEvent[];
  id: string;
  name: string;
  notes?: string[];
  planningEnd: string;
  planningStart: string;
  rawText: string;
  seedCarryForwardItems?: CarryForwardItem[];
}

function joinLines(lines: string[]) {
  return lines.join("\n");
}

export const plannerDevScenarios: PlannerDevScenario[] = [
  {
    id: "normal-realistic-day",
    name: "Normal realistic day",
    description:
      "Balanced clinic-and-life day that stays useful as the default smoke test for local and AI planner behavior.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    fixedEvents: [
      {
        title: "Clinic call",
        startTime: "13:00",
        endTime: "14:00",
      },
      {
        title: "Pick up groceries",
        startTime: "17:00",
        endTime: "17:30",
      },
    ],
    rawText: joinLines([
      "review IM questions 90m",
      "finish case presentation slides 75m",
      "email residency coordinator 20m",
      "call pharmacy 15m",
      "shower 20m",
      "lunch 30m",
      "fold laundry 15m",
      "text Wyatt back 10m",
    ]),
    covers: ["baseline route quality", "interpretation", "execution state"],
    notes: ["Expected: should mostly fit without looking suspiciously perfect."],
  },
  {
    id: "sample-student-day",
    name: "Sample: student day",
    description:
      "Broad student sample for challenge demos: concrete coursework, class anchors, small admin, movement, meals, and honest evening reset.",
    planningStart: "08:30",
    planningEnd: "20:30",
    breakMode: "restful",
    paceMode: "spread_out",
    currentTime: "09:05",
    fixedEvents: [
      {
        title: "Intro Sociology lecture",
        startTime: "11:00",
        endTime: "12:15",
        note: "Hard anchor. Keep the route from crowding class prep or lunch recovery.",
      },
      {
        title: "Lab partner study call",
        startTime: "16:30",
        endTime: "17:00",
        note: "Collaborative check-in for the calculus problem set.",
      },
      {
        title: "Dinner with Maya",
        startTime: "18:30",
        endTime: "19:15",
        note: "Keep a real social reset visible instead of swallowing the evening.",
      },
    ],
    rawText: joinLines([
      "finish sociology reading response 75m",
      "review biology lecture slides 60m",
      "complete calculus problem set 90m",
      "email academic advisor about fall registration 15m",
      "return library book 20m",
      "wash gym clothes 25m",
      "walk to clear head 25m",
      "pack backpack for tomorrow 15m",
      "text roommate about rent 10m",
    ]),
    covers: ["student demo", "balanced sample day", "restful pacing"],
    notes: [
      "Expected: relatable student route that protects study time without pretending every task is academic.",
    ],
  },
  {
    id: "sample-working-professional-day",
    name: "Sample: working professional day",
    description:
      "Broad working-professional sample for demos: deep work, meetings, admin follow-through, errands, and closeout.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    paceMode: "finish_sooner",
    currentTime: "09:20",
    fixedEvents: [
      {
        title: "Product team standup",
        startTime: "10:30",
        endTime: "11:00",
        note: "Quick alignment meeting; keep deeper prep before it when possible.",
      },
      {
        title: "Client status call",
        startTime: "14:30",
        endTime: "15:00",
        note: "Hard anchor for the Q2 update conversation.",
      },
      {
        title: "School pickup",
        startTime: "17:10",
        endTime: "17:35",
        note: "End-of-day life anchor; do not let work spill through it.",
      },
    ],
    rawText: joinLines([
      "prep Q2 client update 75m",
      "review launch metrics dashboard 45m",
      "draft project risks section 60m",
      "reply to partner email thread 20m",
      "submit April expense report 25m",
      "take lunch walk 25m",
      "pick up prescription 20m",
      "write tomorrow's priority list 15m",
    ]),
    covers: ["professional demo", "meeting anchors", "route follow-through"],
    notes: [
      "Expected: practical workday route with enough real-life tasks to feel human.",
    ],
  },
  {
    id: "sample-creative-founder-day",
    name: "Sample: creative / founder day",
    description:
      "Creative founder sample for demos: maker work, operational admin, outreach, and reflective closeout.",
    planningStart: "08:30",
    planningEnd: "19:00",
    breakMode: "restful",
    paceMode: "spread_out",
    currentTime: "09:35",
    fixedEvents: [
      {
        title: "Coffee with mentor",
        startTime: "11:30",
        endTime: "12:15",
        note: "Relationship anchor; protect travel/reset around it.",
      },
      {
        title: "Customer discovery call",
        startTime: "15:00",
        endTime: "15:30",
        note: "Use insights from beta feedback and pricing work.",
      },
    ],
    rawText: joinLines([
      "send launch email draft 60m",
      "polish pricing page hero copy 75m",
      "review beta tester feedback 45m",
      "record two product demo clips 50m",
      "invoice design client 20m",
      "schedule newsletter for Friday 25m",
      "clear desk and reset camera setup 15m",
      "sketch onboarding flow improvements 35m",
      "capture tomorrow's top three 15m",
    ]),
    covers: ["creative demo", "founder operations", "maker time"],
    notes: [
      "Expected: protects a creative sprint while keeping operational tasks visible.",
    ],
  },
  {
    id: "overloaded-liar-detector-day",
    name: "Overloaded liar-detector day",
    description:
      "Intentionally overloaded day for honest deferral, believable carry-forward, and route-truth checks.",
    planningStart: "09:00",
    planningEnd: "17:00",
    breakMode: "restful",
    fixedEvents: [
      {
        title: "Lunch with preceptor",
        startTime: "12:00",
        endTime: "13:00",
      },
      {
        title: "Appointment",
        startTime: "15:00",
        endTime: "16:00",
      },
    ],
    rawText: joinLines([
      "study cardiology 3h",
      "study OMM 2h",
      "finish presentation 2h",
      "grocery store 45m",
      "call pharmacy 20m",
      "clean kitchen 30m",
      "shower 20m",
      "email program director 25m",
    ]),
    covers: ["overload honesty", "unplaced tasks", "hard-anchor protection"],
    notes: [
      "Expected: not everything fits; deferred tasks should stay legible instead of pretending the day works.",
    ],
  },
  {
    id: "next-day-carry-forward-intake-test",
    name: "Next-day carry-forward intake test",
    description:
      "Starts a new day with carried-forward work so intake, due warnings, and AI/local routing can be compared with yesterday still visible.",
    date: "2026-03-26",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    currentTime: "08:15",
    fixedEvents: [
      {
        title: "Afternoon seminar",
        startTime: "15:00",
        endTime: "16:00",
      },
    ],
    rawText: joinLines([
      "review renal 75m",
      "submit credentialing form 20m",
      "shower 20m",
      "reply to admin email 15m",
    ]),
    seedCarryForwardItems: [
      {
        ...createCarryForwardSeedItem({
          carriedFromDate: "2026-03-25",
          taskId: "carry-forward-past-due-email",
          title: "Email attending about schedule swap",
          remainingMinutes: 20,
          dueAt: "2026-03-25T17:30:00-08:00",
          priority: "high",
          mustDoToday: true,
          deferCount: 2,
          type: "admin",
          deferrable: false,
          splittable: false,
        }),
        dueWarningKinds: ["carried_forward_late"],
      },
      createCarryForwardSeedItem({
        carriedFromDate: "2026-03-25",
        taskId: "carry-forward-not-yet-due-reading",
        title: "Read outpatient cardiology notes",
        remainingMinutes: 45,
        dueAt: "2026-03-26T17:00:00-08:00",
        priority: "medium",
        deferCount: 1,
        type: "deep_work",
      }),
    ],
    covers: ["carry-forward intake", "due warning visibility", "one-day setup"],
    notes: [
      "Expected: from-yesterday work stays secondary to today’s route.",
      "One carried item should already read as late before acceptance.",
    ],
  },
  {
    id: "partially-time-anchored-interpretation-test",
    name: "Partially time-anchored interpretation test",
    description:
      "Messy human timing language for lock-prompts, preferred-time handling, and AI/local interpretation comparisons.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    fixedEvents: [],
    rawText: joinLines([
      "3 pm maybe call pharmacy?",
      "around 11 finish slides",
      "1:30 PM - 2:15 PM therapy",
      "call later about insurance",
      "maybe 5pm groceries",
      "shower",
      "review IM questions 90m",
    ]),
    covers: ["partial-time interpretation", "task lock prompts", "anchor inference"],
    notes: [
      "Expected: therapy becomes fixed; the other clock phrases stay flexible until confirmed.",
    ],
  },
  {
    id: "ambiguous-human-chaos-input-test",
    name: "Ambiguous human-chaos input test",
    description:
      "Vague, messy phrasing for AI interpretation comparisons when durations and timing are highly uncertain.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    fixedEvents: [],
    rawText: joinLines([
      "maybe study for a while",
      "call mom later",
      "2ish meeting maybe?",
      "shower",
      "groceries if I have time",
      "do questions",
      "reply to that email",
      "maybe lie down",
    ]),
    covers: ["ambiguity handling", "AI interpretation compare", "conservative defaults"],
    notes: [
      "Expected: interpretation should stay plausible and conservative rather than overcommitting.",
    ],
  },
  {
    id: "spread-out-slack-day",
    name: "Spread-out slack day",
    description:
      "Slack-heavy route for comparing front-loaded local behavior with spread-out pacing and visible open-time buffers.",
    planningStart: "08:00",
    planningEnd: "16:00",
    breakMode: "restful",
    paceMode: "spread_out",
    fixedEvents: [],
    rawText: joinLines([
      "review flashcards 60m",
      "study cardiology 90m",
      "reply to admin email 20m",
      "fold laundry 20m",
    ]),
    covers: ["pace mode", "slack distribution", "open-time buffers"],
    notes: [
      "Expected: spread-out pacing should create visible open-time buffers instead of front-loading everything into the morning.",
    ],
  },
  {
    id: "ai-draft-believability-comparison-test",
    name: "AI draft believability comparison",
    description:
      "A one-day routing case with one non-splittable task, a couple of anchors, and enough optional work to compare local vs AI draft quality.",
    planningStart: "08:30",
    planningEnd: "18:00",
    breakMode: "restful",
    fixedEvents: [
      {
        title: "Noon lunch",
        startTime: "12:00",
        endTime: "12:30",
      },
      {
        title: "Clinic check-in",
        startTime: "15:00",
        endTime: "15:30",
      },
    ],
    rawText: joinLines([
      "finish presentation slides 75m",
      "review 30 IM questions 80m",
      "email clinic coordinator 15m",
      "call pharmacy 15m",
      "shower 20m",
      "fold laundry 15m",
      "grocery run 40m",
    ]),
    covers: ["AI draft compare", "non-splittable handling", "oracle advice"],
    notes: [
      "Expected: the slides task should remain intact even though it exceeds the preferred focus cadence.",
      "Useful for comparing local and AI draft quality without changing the one-day planner contract.",
    ],
  },
  {
    id: "deep-work-fragmentation-torture-test",
    name: "Deep-work fragmentation torture test",
    description:
      "Long-focus routing case for split-block behavior when a couple of hard anchors interrupt the day.",
    planningStart: "08:00",
    planningEnd: "16:00",
    breakMode: "restful",
    fixedEvents: [
      {
        title: "Meeting",
        startTime: "10:30",
        endTime: "11:00",
      },
      {
        title: "Lunch",
        startTime: "13:00",
        endTime: "13:30",
      },
    ],
    rawText: joinLines([
      "write personal statement draft 2h",
      "review incorrect TrueLearn questions 90m",
      "submit immunization form 10m",
      "call insurance 15m",
      "shower 20m",
    ]),
    covers: ["route generation", "deep-work splitting", "anchor interruptions"],
    notes: [
      "Expected: long focus work should fragment cleanly instead of collapsing into nonsense.",
    ],
  },
  {
    id: "low-energy-productive-break-test",
    name: "Low-energy productive-break test",
    description:
      "Designed to compare productive-break handling when several small low-energy tasks sit next to real study work.",
    planningStart: "08:00",
    planningEnd: "17:00",
    breakMode: "productive",
    fixedEvents: [
      {
        title: "Lunch",
        startTime: "12:00",
        endTime: "12:30",
      },
      {
        title: "Check-in call",
        startTime: "15:00",
        endTime: "15:30",
      },
    ],
    rawText: joinLines([
      "review flashcards 20m",
      "fold laundry 15m",
      "reply to email 10m",
      "refill water bottle and tidy desk 10m",
      "study cardiology 2h",
      "write SOAP note 60m",
      "shower 20m",
    ]),
    covers: ["productive-break behavior", "low-energy tasks", "break windows"],
    notes: ["Expected: some low-energy work should get tucked into productive-break windows."],
  },
  {
    id: "granular-short-task-pileup-test",
    name: "Granular short-task pileup test",
    description:
      "Dense mixed-category day for checking route readability, palette separation, and small-task routing under a realistic one-day load.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    breakCadence: "focus_45",
    fixedEvents: [
      {
        title: "Noon check-in",
        startTime: "12:00",
        endTime: "12:20",
      },
      {
        title: "Evening appointment",
        startTime: "16:15",
        endTime: "16:45",
      },
    ],
    rawText: joinLines([
      "review 12 missed cardiology questions 35m",
      "finish lecture note cleanup 25m",
      "reply to patient portal message 10m",
      "send school email 10m",
      "call insurance about claim 15m",
      "text Wyatt back 5m",
      "submit parking form 10m",
      "print clinic form 5m",
      "drop off package 15m",
      "grocery run 35m",
      "wipe bathroom counter 10m",
      "put away laundry 10m",
      "water plants 5m",
      "restock backpack 10m",
      "refill pill organizer 10m",
      "pack snack bag 5m",
      "book oil change 10m",
      "scan reimbursement receipt 5m",
      "check tuition portal 10m",
      "shower 20m",
      "lunch 25m",
    ]),
    covers: [
      "dense review UI",
      "full palette preview",
      "many short tasks",
      "small-task routing",
      "deferred-task readability",
    ],
    notes: [
      "Expected: useful for checking whether stacked focus, admin, self-care, chore, errand, break, and anchor blocks stay distinct without turning into visual mush.",
    ],
  },
  {
    id: "late-day-replan-stress-test",
    name: "Late-day replan stress test",
    description:
      "Mostly-full day viewed late in the afternoon to stress current/next clarity and explicit replan-from-now behavior.",
    planningStart: "08:00",
    planningEnd: "20:00",
    breakMode: "restful",
    currentTime: "16:45",
    fixedEvents: [
      {
        title: "Doctor appointment",
        startTime: "14:00",
        endTime: "15:00",
      },
      {
        title: "Dinner",
        startTime: "18:30",
        endTime: "19:30",
      },
    ],
    rawText: joinLines([
      "study renal 2h",
      "review OMM 90m",
      "grocery store 45m",
      "email attending 15m",
      "shower 20m",
      "fold laundry 20m",
      "call Wyatt 20m",
    ]),
    covers: ["late-day edge cases", "execution state", "replan from now"],
    notes: [
      "Expected: useful for comparing deterministic and AI replans against the same remainder boundary.",
    ],
  },
  {
    id: "ai-stale-route-replan-comparison-test",
    name: "AI stale-route replan comparison",
    description:
      "Late-afternoon route with several earlier tasks likely stale, meant for AI-vs-local remainder rebuilding and oracle advice checks.",
    planningStart: "09:00",
    planningEnd: "19:00",
    breakMode: "restful",
    currentTime: "15:40",
    fixedEvents: [
      {
        title: "Therapy",
        startTime: "16:30",
        endTime: "17:15",
      },
    ],
    rawText: joinLines([
      "finish presentation slides 75m",
      "review 25 renal questions 60m",
      "reply to clinic email 10m",
      "call insurance 15m",
      "grocery run 40m",
      "shower 20m",
      "laundry reset 10m",
    ]),
    covers: ["AI replan compare", "stale-route recovery", "oracle advice"],
    notes: [
      "Expected: especially useful after delaying or skipping a couple of earlier blocks, then comparing local vs AI replan quality.",
    ],
  },
  {
    id: "execution-continuity-test",
    name: "Execution continuity test",
    description:
      "Simple route for mark-complete, skip, delay, rebuild, and history continuity testing.",
    planningStart: "08:00",
    planningEnd: "18:00",
    breakMode: "restful",
    fixedEvents: [
      {
        title: "Lecture",
        startTime: "13:00",
        endTime: "14:00",
      },
    ],
    rawText: joinLines([
      "study neuro 60m",
      "shower 20m",
      "email coordinator 15m",
      "grocery store 45m",
      "finish slides 90m",
    ]),
    covers: ["execution state", "mark complete", "skip and delay"],
    notes: ["Expected: good smoke test for current/next, done history, and repeated rebuilds."],
  },
  {
    id: "end-of-window-impossible-fit-test",
    name: "End-of-window impossible fit test",
    description:
      "Short late-day window that cannot reasonably absorb the whole queue once current time advances.",
    planningStart: "14:00",
    planningEnd: "18:00",
    breakMode: "restful",
    currentTime: "15:20",
    fixedEvents: [
      {
        title: "Appointment",
        startTime: "16:00",
        endTime: "16:30",
      },
    ],
    rawText: joinLines([
      "review incorrect questions 90m",
      "finish presentation 75m",
      "grocery store 45m",
      "shower 20m",
      "call pharmacy 15m",
    ]),
    covers: ["late-day edge cases", "overload honesty", "hard-anchor protection"],
    notes: [
      "Expected: useful for impossible remainder testing; the route should not pretend the day still fits.",
    ],
  },
];
