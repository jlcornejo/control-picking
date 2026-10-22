/**
 * Pure weight parser for a Bluetooth Classic / SPP weight indicator.
 *
 * No React, no native imports: a single pure function so it can be unit-tested
 * with Vitest and reused from the hook. The hook decodes the incoming SPP bytes
 * to a string and splits the stream into whole lines (on CR/LF) BEFORE calling
 * `parseWeight` — this parser's contract is "give me one terminated line".
 *
 * ============================================================================
 * WARNING: UNCONFIRMED FORMAT.
 * The LP7516C Bluetooth module's data frame is NOT documented by the
 * manufacturer. The patterns below are an EDUCATED GUESS for typical Chinese
 * LP-type weight indicators (ASCII, CR/LF terminated, optional status prefix,
 * a decimal number, and a kg/g unit). Once the REAL stream is captured with the
 * in-app debug panel (register screen, flag `bluetooth_scale`, Android), add the
 * confirmed pattern as the FIRST entry in `WEIGHT_PATTERNS` below and enable the
 * skipped "real-format" test in the test file. Tuning is a one-line edit.
 * ============================================================================
 */

export interface ParsedWeight {
  /** Parsed weight in KILOGRAMS, or null if no number could be extracted. */
  kg: number | null;
  /** true=stable/ST, false=motion/US or overload, null=unknown (no status field). */
  stable: boolean | null;
  /** The raw chunk exactly as received (for the debug log / audit). */
  raw: string;
}

/**
 * Longest line we are willing to parse. The SPP stream is untrusted external
 * input; a malformed/chatty device must not flood the parser. Longer lines are
 * treated as unrecognized.
 */
const MAX_LINE_LENGTH = 128;

interface WeightMatch {
  /** Raw status token if the pattern captured one (e.g. "ST", "US", "OL"). */
  status?: string;
  /** Raw numeric text (may contain sign/spaces), e.g. "+  12.50". */
  value: string;
  /** Raw unit token if captured ("kg" | "g"), case-insensitive. */
  unit?: string;
}

interface WeightPattern {
  /** Human note for maintainers. */
  label: string;
  /** Regex applied to the trimmed line. */
  re: RegExp;
  /** Map a successful match to its parts. */
  extract: (m: RegExpMatchArray) => WeightMatch;
}

/**
 * Ordered candidate patterns. First match wins, so put the most specific /
 * confirmed pattern first. All are documented GUESSES until the real frame is
 * captured (see warning above).
 */
const WEIGHT_PATTERNS: WeightPattern[] = [
  {
    // GUESS 1: status prefix + optional net/gross tag + signed decimal + unit.
    // e.g. "ST,GS,+  12.50kg", "US,NT,-0.00 g", "ST,GS,+12.5".
    label: 'ST/US/OL status prefix + optional NT/GS + signed decimal + optional kg/g',
    re: /^(ST|US|OL)\s*,?\s*(?:NT|GS)?\s*,?\s*([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|g)?/i,
    extract: (m) => ({ status: m[1], value: m[2] ?? '', unit: m[3] }),
  },
  {
    // GUESS 2: bare signed decimal with optional unit, no status token.
    // e.g. "12.50kg", "+12.5", "-0.00 g". stable is unknown -> null.
    label: 'bare signed decimal + optional kg/g (no status)',
    re: /([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|g)?/i,
    extract: (m) => ({ value: m[1] ?? '', unit: m[2] }),
  },
];

/**
 * Overload / error tokens that mean "no valid weight" (scale off-range).
 * `-{3,}` has no word boundary because "-" is not a word char; it is matched
 * as a standalone run of dashes possibly surrounded by spaces.
 */
const OVERLOAD_RE = /(\bOL\b|\bO-?L\b|(?:^|\s)-{3,}(?:\s|$)|\bE{2,}\b)/i;

/**
 * Normalize a status token to the `stable` tri-state.
 *   ST -> true (stable)   US / motion -> false   unknown/absent -> null
 */
function statusToStable(status: string | undefined): boolean | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'ST') return true;
  if (s === 'US' || s === 'OL') return false;
  return null;
}

/**
 * Normalize the captured numeric text into a finite number of KILOGRAMS.
 * - strips spaces inside the number ("+  12.50" -> "+12.50")
 * - accepts a locale decimal comma ("12,50" -> "12.50")
 * - unit `g` divides by 1000; absent unit defaults to kg.
 *
 * NOTE: the "absent unit defaults to kg" assumption is adjustable — this is a
 * 60 kg scale, so a bare number is read as kilograms. Change here if the real
 * frame reports grams without a unit.
 */
function normalizeKg(value: string, unit: string | undefined): number | null {
  const cleaned = value.replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const grams = (unit ?? '').toLowerCase() === 'g';
  const kg = grams ? n / 1000 : n;
  if (!Number.isFinite(kg)) return null;
  // Normalize negative zero (e.g. "-0.00") to 0 so callers see a plain 0 kg.
  return kg === 0 ? 0 : kg;
}

/** Parse one raw chunk (already decoded to a string) into a weight reading. */
export function parseWeight(chunk: string): ParsedWeight {
  const raw = chunk;
  const line = chunk.trim();

  // Empty / whitespace-only / over-length lines are not valid readings.
  if (line.length === 0 || line.length > MAX_LINE_LENGTH) {
    return { kg: null, stable: null, raw };
  }

  // Overload / error: no payable weight, but it is a "motion/invalid" signal.
  if (OVERLOAD_RE.test(line)) {
    return { kg: null, stable: false, raw };
  }

  for (const pattern of WEIGHT_PATTERNS) {
    const m = line.match(pattern.re);
    if (!m) continue;
    const parts = pattern.extract(m);
    const kg = normalizeKg(parts.value, parts.unit);
    if (kg === null) continue; // matched shape but no finite number -> try next
    return { kg, stable: statusToStable(parts.status), raw };
  }

  // No pattern matched: never throw, just report "unrecognized".
  return { kg: null, stable: null, raw };
}
