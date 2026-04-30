export function extractOffset(isoDateTime: string) {
  return isoDateTime.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? "Z";
}

export function extractTimeInput(isoDateTime: string) {
  return isoDateTime.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

export function formatClockInputValue(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return value;
  }

  const hours24 = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${String(hours12).padStart(2, "0")}:${minutes} ${meridiem}`;
}

export function extractDateTimeLocalInput(isoDateTime: string) {
  return isoDateTime.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)?.[1] ?? "";
}

export function formatDueInputValue(isoDateTime: string) {
  const localValue = extractDateTimeLocalInput(isoDateTime);

  if (!localValue) {
    return "";
  }

  const [datePart, timePart] = localValue.split("T");
  const [year, month, day] = datePart.split("-").map((part) => Number(part));
  const [hours24, minutes] = timePart.split(":").map((part) => Number(part));
  const meridiem = hours24 >= 12 ? "p" : "a";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minuteLabel = minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;

  return `${month}/${day}/${String(year).slice(-2)} ${hours12}${minuteLabel}${meridiem}`;
}

export function parseFlexibleLocalDateTimeInput(
  rawInput: string,
  referenceDate = new Date()
) {
  const trimmedInput = rawInput.trim().toLowerCase();

  if (!trimmedInput) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}$/.test(trimmedInput)) {
    return trimmedInput.toUpperCase().replace("T", "T");
  }

  const slashMatch = trimmedInput.match(
    /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?(?:[\s,]+(\d{1,2})(?::?(\d{2}))?\s*([ap])m?)?$/
  );

  if (slashMatch) {
    const [, rawMonth, rawDay, rawYear, rawHour, rawMinute, rawMeridiem] =
      slashMatch;
    const year = normalizeParsedYear(
      rawYear ? Number.parseInt(rawYear, 10) : referenceDate.getFullYear(),
      rawYear?.length ?? 4
    );
    const month = Number.parseInt(rawMonth, 10);
    const day = Number.parseInt(rawDay, 10);
    const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0;
    const hour = rawHour
      ? rawMeridiem
        ? to24HourClock(Number.parseInt(rawHour, 10), rawMeridiem)
        : Number.parseInt(rawHour, 10)
      : 17;

    return buildLocalDateTime(year, month, day, hour, minute);
  }

  const compactMatch = trimmedInput
    .replace(/\s+/g, "")
    .match(/^(\d{5,10})([ap])m?$/);

  if (!compactMatch) {
    return undefined;
  }

  const [, digitBody, meridiem] = compactMatch;
  const candidates: Array<{
    localDateTime: string;
    score: number;
  }> = [];

  for (const monthLength of [1, 2]) {
    for (const dayLength of [1, 2]) {
      for (const yearLength of [2, 4]) {
        for (const hourLength of [1, 2]) {
          for (const minuteLength of [0, 2]) {
            if (
              monthLength +
                dayLength +
                yearLength +
                hourLength +
                minuteLength !==
              digitBody.length
            ) {
              continue;
            }

            const month = Number.parseInt(digitBody.slice(0, monthLength), 10);
            const day = Number.parseInt(
              digitBody.slice(monthLength, monthLength + dayLength),
              10
            );
            const yearStart = monthLength + dayLength;
            const rawYear = digitBody.slice(yearStart, yearStart + yearLength);
            const hourStart = yearStart + yearLength;
            const rawHour = digitBody.slice(hourStart, hourStart + hourLength);
            const rawMinute =
              minuteLength === 2
                ? digitBody.slice(hourStart + hourLength)
                : undefined;
            const hour = to24HourClock(Number.parseInt(rawHour, 10), meridiem);
            const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0;
            const localDateTime = buildLocalDateTime(
              normalizeParsedYear(Number.parseInt(rawYear, 10), yearLength),
              month,
              day,
              hour,
              minute
            );

            if (!localDateTime) {
              continue;
            }

            candidates.push({
              localDateTime,
              score:
                (dayLength === 2 ? 40 : 0) +
                (yearLength === 2 ? 18 : 0) +
                (minuteLength === 0 ? 12 : 0) +
                (monthLength === 1 ? 6 : 0) +
                (hourLength === 1 ? 4 : 0),
            });
          }
        }
      }
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0]
    ?.localDateTime;
}

export function parseFlexibleTimeInput(rawInput: string) {
  const trimmedInput = rawInput.trim().toLowerCase().replace(/\s+/g, "");

  if (!trimmedInput) {
    return undefined;
  }

  const twentyFourHourMatch = trimmedInput.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHourMatch) {
    const hours = Number.parseInt(twentyFourHourMatch[1], 10);
    const minutes = Number.parseInt(twentyFourHourMatch[2], 10);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    return undefined;
  }

  const twelveHourMatch = trimmedInput.match(/^(\d{1,2})(?::?(\d{2}))?([ap])m?$/);

  if (twelveHourMatch) {
    const hour = Number.parseInt(twelveHourMatch[1], 10);
    const minute = twelveHourMatch[2]
      ? Number.parseInt(twelveHourMatch[2], 10)
      : 0;
    const hours24 = to24HourClock(hour, twelveHourMatch[3]);

    if (!Number.isFinite(hours24) || minute < 0 || minute > 59) {
      return undefined;
    }

    return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const compactTwentyFourHourMatch = trimmedInput.match(/^(\d{3,4})$/);

  if (!compactTwentyFourHourMatch) {
    return undefined;
  }

  const digits = compactTwentyFourHourMatch[1];
  const hour =
    digits.length === 3
      ? Number.parseInt(digits.slice(0, 1), 10)
      : Number.parseInt(digits.slice(0, 2), 10);
  const minute = Number.parseInt(digits.slice(-2), 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatIsoWithOffset(timestampMs: number, offset: string) {
  if (offset === "Z") {
    return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, ":00Z");
  }

  const [rawHours, rawMinutes] = offset.slice(1).split(":");
  const direction = offset.startsWith("-") ? -1 : 1;
  const offsetMinutes =
    direction *
    (Number.parseInt(rawHours, 10) * 60 + Number.parseInt(rawMinutes, 10));
  const localMs = timestampMs + offsetMinutes * 60000;
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutes = String(localDate.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:00${offset}`;
}

export function formatLocalIsoDateTime(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffsetMinutes / 60)).padStart(
    2,
    "0"
  )}:${String(absoluteOffsetMinutes % 60).padStart(2, "0")}`;

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}T${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(
    date.getSeconds()
  ).padStart(2, "0")}${offset}`;
}

export function formatLocalIsoDate(date = new Date()) {
  return formatLocalIsoDateTime(date).slice(0, 10);
}

export function addMinutesWithOffset(
  isoDateTime: string,
  minutes: number,
  offset: string
) {
  return formatIsoWithOffset(
    new Date(isoDateTime).getTime() + minutes * 60000,
    offset
  );
}

export function replaceIsoTimePreservingDate(
  isoDateTime: string,
  time: string
) {
  const date = isoDateTime.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1];

  if (!date || !/^\d{2}:\d{2}$/.test(time)) {
    return isoDateTime;
  }

  return `${date}T${time}:00${extractOffset(isoDateTime)}`;
}

export function replaceIsoDatePreservingTime(
  isoDateTime: string,
  date: string
) {
  const time = isoDateTime.match(/T(\d{2}:\d{2})/)?.[1];

  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return isoDateTime;
  }

  return `${date}T${time}:00${extractOffset(isoDateTime)}`;
}

export function toIsoDateTimeFromLocalInput(
  localDateTime: string,
  offset: string
) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) {
    return undefined;
  }

  return `${localDateTime}:00${offset}`;
}

function normalizeParsedYear(year: number, sourceLength: number) {
  if (sourceLength === 2) {
    return 2000 + year;
  }

  return year;
}

function to24HourClock(hour: number, meridiem: string) {
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) {
    return Number.NaN;
  }

  if (meridiem === "a") {
    return hour === 12 ? 0 : hour;
  }

  return hour === 12 ? 12 : hour + 12;
}

function buildLocalDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return undefined;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day ||
    candidate.getUTCHours() !== hour ||
    candidate.getUTCMinutes() !== minute
  ) {
    return undefined;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addDaysToIsoDate(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate.toISOString().slice(0, 10);
}
