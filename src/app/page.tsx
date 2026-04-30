import { PlannerClientShell } from "@/app/_components/planner-client-shell";
import { mockPlannerState } from "@/app/_lib/mock-day-plan";

export default function Home() {
  return <PlannerClientShell planner={mockPlannerState} />;
}
