// RFC 5545 iCalendar emitter. Pure, deterministic, no I/O. The caller passes
// in every timestamp (including `dtstamp` — never `new Date()` inside) so
// snapshot tests can assert byte-identical output. All times are emitted as
// floating-with-TZID against a hand-written VTIMEZONE block (default
// Europe/Berlin), which is the lossless representation for "wall-clock 19:00
// in Berlin" — UTC would break across DST transitions.
//
// Compliance touchpoints (tested in builder.test.ts):
//   - CRLF line endings everywhere, trailing CRLF before EOF.
//   - Property lines folded at ≤75 octets (UTF-8 byte length), continuation
//     starts with a single space, fold lands on a Unicode code-point boundary.
//   - TEXT escaping: `\\` `\;` `\,` `\n` per §3.3.11. Backslash first.
//   - VCALENDAR required props: VERSION 2.0, PRODID, CALSCALE GREGORIAN,
//     METHOD PUBLISH. Plus X-WR-CALNAME/CALDESC/TIMEZONE for Google sugar.
//   - VEVENT required props: UID, DTSTAMP, DTSTART. We always also emit
//     DTEND, SUMMARY, DESCRIPTION, STATUS, SEQUENCE, LAST-MODIFIED; LOCATION
//     and URL when set; CATEGORIES is fixed to BOARD GAMES.
//   - All-day events emit `DTSTART;VALUE=DATE:YYYYMMDD` with no TZID and no
//     DTEND (clients default to a one-day span per §3.6.1).

const CRLF = "\r\n";
const MAX_OCTETS = 75;
const TEXT_ENCODER = new TextEncoder();

export type IcsLocalDateTime = { dateTime: string; tzid: string };
export type IcsLocalDate = { date: string };
export type IcsDate = IcsLocalDateTime | IcsLocalDate;

export type IcsEvent = {
  /** Stable UID. Same UID on next render = update; new UID = new event. */
  uid: string;
  /** YYYYMMDDTHHMMSS (no Z, no separators) when zoned; YYYYMMDD for all-day. */
  start: IcsDate;
  /** Same encoding as `start`. Optional for all-day events. */
  end?: IcsDate;
  summary: string;
  description: string;
  location: string | null;
  status: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
  /** Monotonic per UID. Required by Outlook to apply updates. */
  sequence: number;
  /** YYYYMMDDTHHMMSSZ (UTC). */
  lastModified: string;
  /** YYYYMMDDTHHMMSSZ (UTC). REQUIRED by RFC 5545. */
  dtstamp: string;
  /** Optional canonical URL (e.g. deep-link back into the offline planner). */
  url?: string;
};

export type BuildIcsOptions = {
  /** -//<owner>//<product>//<lang> per §3.7.3. */
  prodId: string;
  /** X-WR-CALNAME — Google/Apple's display name for the calendar. */
  calName: string;
  /** Optional X-WR-CALDESC. */
  calDesc?: string;
  /** TZID for emitted events and the embedded VTIMEZONE block. */
  tzid: string;
  events: IcsEvent[];
};

export function buildIcs(opts: BuildIcsOptions): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(`PRODID:${opts.prodId}`);
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(...wrap("X-WR-CALNAME", opts.calName));
  if (opts.calDesc) lines.push(...wrap("X-WR-CALDESC", opts.calDesc));
  lines.push(`X-WR-TIMEZONE:${opts.tzid}`);
  lines.push(...emitVtimezone(opts.tzid));
  for (const ev of opts.events) lines.push(...emitVevent(ev));
  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

// ── VEVENT ─────────────────────────────────────────────────────────────

function emitVevent(ev: IcsEvent): string[] {
  const out: string[] = [];
  out.push("BEGIN:VEVENT");
  out.push(...wrap("UID", ev.uid));
  out.push(`DTSTAMP:${ev.dtstamp}`);
  out.push(...emitDateProperty("DTSTART", ev.start));
  if (ev.end) out.push(...emitDateProperty("DTEND", ev.end));
  out.push(...wrap("SUMMARY", escapeText(ev.summary)));
  out.push(...wrap("DESCRIPTION", escapeText(ev.description)));
  if (ev.location) out.push(...wrap("LOCATION", escapeText(ev.location)));
  if (ev.url) out.push(...wrap("URL", ev.url));
  out.push(`STATUS:${ev.status}`);
  out.push(`SEQUENCE:${ev.sequence}`);
  out.push(`LAST-MODIFIED:${ev.lastModified}`);
  out.push("CATEGORIES:BOARD GAMES");
  out.push("END:VEVENT");
  return out;
}

function emitDateProperty(propName: "DTSTART" | "DTEND", value: IcsDate): string[] {
  // Distinguish the union via property presence — TS narrowing on union
  // members works cleanly here without a discriminant.
  if ("date" in value) {
    return [`${propName};VALUE=DATE:${value.date}`];
  }
  return [`${propName};TZID=${value.tzid}:${value.dateTime}`];
}

// ── VTIMEZONE ──────────────────────────────────────────────────────────
// Hand-written block for Europe/Berlin (the only zone the project currently
// supports). DST rules: last Sunday of March (+0100 → +0200), last Sunday
// of October (+0200 → +0100). EU rule has been stable since 1996 and is
// valid through the foreseeable future (proposals to abolish have stalled).
// For any other TZID we emit a minimal block with UTC offset 0 so the file
// still parses; callers should only use known zones.

function emitVtimezone(tzid: string): string[] {
  if (tzid === "Europe/Berlin") return EUROPE_BERLIN_VTIMEZONE.split(CRLF);
  // Fallback: a minimal VTIMEZONE that says "this zone is UTC". Better than
  // omitting it (DTSTART;TZID=<unknown> without a matching VTIMEZONE makes
  // some clients refuse the entire file). This keeps us robust if a
  // hypothetical future caller passes a zone we haven't characterized.
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tzid}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0000",
    `TZNAME:${tzid}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

const EUROPE_BERLIN_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:STANDARD",
  "DTSTART:19701025T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700329T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
].join(CRLF);

// ── Encoding helpers ──────────────────────────────────────────────────

// §3.3.11 TEXT escape. Backslash MUST be replaced first, otherwise the later
// substitutions' inserted backslashes would themselves be doubled.
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

// Emit a content line, line-folded to ≤75 octets. The first line gets
// `<name>:<value>` (or `<name>;<params>:<value>`); continuation lines start
// with a single space. Folds land on a Unicode code-point boundary so we
// never split a UTF-8 sequence — strictly speaking RFC 5545 §3.1 allows
// mid-byte folding, but real-world parsers (notably older Apple Calendar)
// have had bugs with it, and the cost of backing off to a code-point
// boundary is negligible.
export function wrap(name: string, value: string): string[] {
  const full = `${name}:${value}`;
  return foldLine(full);
}

export function foldLine(line: string): string[] {
  const bytes = TEXT_ENCODER.encode(line);
  if (bytes.length <= MAX_OCTETS) return [line];

  const result: string[] = [];
  let cursor = 0;
  let first = true;
  while (cursor < bytes.length) {
    // Continuation lines reserve one octet for the leading SPACE, so the
    // payload budget shrinks by one after the first chunk.
    const budget = first ? MAX_OCTETS : MAX_OCTETS - 1;
    let end = Math.min(cursor + budget, bytes.length);
    end = backOffToCodepointBoundary(bytes, end);
    // Decode this slice. `fatal: true` would throw on a partial codepoint,
    // which is impossible after backOffToCodepointBoundary — but we leave
    // it off so the function stays robust on any future input.
    const slice = bytes.subarray(cursor, end);
    const chunk = new TextDecoder("utf-8").decode(slice);
    result.push(first ? chunk : ` ${chunk}`);
    cursor = end;
    first = false;
  }
  return result;
}

// UTF-8 continuation bytes match 10xxxxxx (0x80–0xBF). A valid codepoint
// boundary is any byte that is NOT a continuation byte. If we land mid-
// codepoint we walk backward until we hit a leading byte.
function backOffToCodepointBoundary(bytes: Uint8Array, end: number): number {
  if (end >= bytes.length) return end;
  let cursor = end;
  while (cursor > 0) {
    const b = bytes[cursor] as number;
    if ((b & 0xc0) !== 0x80) break;
    cursor--;
  }
  return cursor;
}
