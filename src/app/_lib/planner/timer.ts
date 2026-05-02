const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

export interface CountdownLabel {
  angle: number;
  label: string;
}

export interface BlockCountdownSnapshot {
  durationLabel: string;
  durationMs: number;
  dialMaxMinutes: number;
  elapsedMs: number;
  labelMaxMinutes: number;
  labelStepMinutes: number;
  labels: CountdownLabel[];
  overflowRemainingAngle: number;
  overflowMinutes: number;
  remainingAngle: number;
  remainingLabel: string;
  remainingMs: number;
  remainingRatio: number;
}

export function createBlockCountdownSnapshot(input: {
  currentTime: string;
  endTime: string;
  startTime: string;
}): BlockCountdownSnapshot | null {
  const startMs = new Date(input.startTime).getTime();
  const endMs = new Date(input.endTime).getTime();
  const currentMs = new Date(input.currentTime).getTime();

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(currentMs)
  ) {
    return null;
  }

  const durationMs = endMs - startMs;

  if (durationMs <= 0) {
    return null;
  }

  const elapsedMs = clamp(currentMs - startMs, 0, durationMs);
  const remainingMs = clamp(endMs - currentMs, 0, durationMs);
  const remainingRatio = remainingMs / durationMs;
  const durationMinutes = Math.max(1, Math.round(durationMs / MINUTE_MS));
  const labelMaxMinutes = Math.min(
    60,
    Math.max(5, Math.ceil(durationMinutes / 5) * 5)
  );
  const dialMaxMinutes = labelMaxMinutes;
  const labelStepMinutes = 5;
  const remainingMinutes = remainingMs / MINUTE_MS;
  const overflowMinutes = Math.max(0, durationMinutes - dialMaxMinutes);
  const overflowRemainingMinutes =
    overflowMinutes > 0
      ? clamp(remainingMinutes - dialMaxMinutes, 0, overflowMinutes)
      : 0;
  const dialRemainingMinutes = Math.min(remainingMinutes, dialMaxMinutes);

  return {
    durationLabel: formatDuration(durationMs, { includeSeconds: false }),
    dialMaxMinutes,
    durationMs,
    elapsedMs,
    labelMaxMinutes,
    labelStepMinutes,
    labels: buildCountdownLabels(labelMaxMinutes, labelStepMinutes),
    overflowRemainingAngle:
      overflowMinutes > 0
        ? (overflowRemainingMinutes / overflowMinutes) * 360
        : 0,
    overflowMinutes,
    remainingAngle: (dialRemainingMinutes / dialMaxMinutes) * 360,
    remainingLabel: formatDuration(remainingMs, { includeSeconds: true }),
    remainingMs,
    remainingRatio,
  };
}

export function buildCountdownLabels(
  maxMinutes: number,
  stepMinutes: number
): CountdownLabel[] {
  if (maxMinutes <= 0 || stepMinutes <= 0) {
    return [{ angle: 0, label: "0" }];
  }

  const labels: CountdownLabel[] = [{ angle: 0, label: "0" }];

  for (let value = stepMinutes; value < maxMinutes; value += stepMinutes) {
    labels.push({
      angle: -(value / maxMinutes) * 360,
      label: String(value),
    });
  }

  return labels;
}

function formatDuration(
  durationMs: number,
  options: { includeSeconds: boolean }
) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    const base = `${hours}h ${minutes}m`;
    return options.includeSeconds && seconds > 0 ? `${base} ${seconds}s` : base;
  }

  if (!options.includeSeconds) {
    return `${Math.max(1, Math.round(durationMs / MINUTE_MS))}m`;
  }

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
