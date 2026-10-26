/**
 * Age evidence a wallet can disclose, as it appears in verification claims:
 * - `age_over_M` (the EU age verification attestation and mdoc credentials),
 *   at the top level or inside an mdoc namespace;
 * - `age_equal_or_over: { "M": true }` (SD-JWT VC PID);
 * - a birth date, `birthdate` (SD-JWT VC PID) or `birth_date` (mdoc).
 */
const AGE_OVER_CLAIM = /^age_over_(\d+)$/;
const AGE_EQUAL_OR_OVER_CLAIM = "age_equal_or_over";
const BIRTH_DATE_CLAIMS = new Set(["birthdate", "birth_date"]);
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgeClaim(name: string): boolean {
  return (
    AGE_OVER_CLAIM.test(name) ||
    name === AGE_EQUAL_OR_OVER_CLAIM ||
    BIRTH_DATE_CLAIMS.has(name)
  );
}

function pickAgeClaims(
  scope: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(scope).filter(([name]) => isAgeClaim(name))
  );
}

/**
 * The disclosed age claims, unchanged, with every other claim removed. Returns
 * `undefined` when the verification disclosed no age claim.
 */
export function selectAgeClaims(
  claims: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!claims) {
    return;
  }
  const selected: Record<string, unknown> = pickAgeClaims(claims);
  for (const [namespace, value] of Object.entries(claims)) {
    if (isAgeClaim(namespace) || !isRecord(value)) {
      continue;
    }
    const namespaceClaims = pickAgeClaims(value);
    if (Object.keys(namespaceClaims).length > 0) {
      selected[namespace] = namespaceClaims;
    }
  }
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Birth date plus `minAge` calendar years is on or before today in UTC. A
 * February 29 birthday falls on February 28 in common years. Anything other
 * than a real `YYYY-MM-DD` date fails.
 */
function birthDateMeetsMinimumAge(
  value: unknown,
  minAge: number,
  now: Date
): boolean {
  const match = typeof value === "string" ? FULL_DATE.exec(value) : null;
  if (!match) {
    return false;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return false;
  }

  const thresholdYear = year + minAge;
  const thresholdDay =
    month === 2 && day === 29 && !isLeapYear(thresholdYear) ? 28 : day;
  const threshold = Date.UTC(thresholdYear, month - 1, thresholdDay);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return threshold <= today;
}

function scopeMeetsMinimumAge(
  scope: Record<string, unknown>,
  minAge: number,
  now: Date
): boolean {
  return Object.entries(scope).some(([name, value]) => {
    const ageOver = AGE_OVER_CLAIM.exec(name);
    if (ageOver) {
      return value === true && Number(ageOver[1]) >= minAge;
    }
    if (name === AGE_EQUAL_OR_OVER_CLAIM) {
      return (
        isRecord(value) &&
        Object.entries(value).some(
          ([age, over]) =>
            /^\d+$/.test(age) && over === true && Number(age) >= minAge
        )
      );
    }
    if (BIRTH_DATE_CLAIMS.has(name)) {
      return birthDateMeetsMinimumAge(value, minAge, now);
    }
    return false;
  });
}

/**
 * Whether disclosed age claims prove the holder is at least `minAge`: any
 * `age_over_M: true` or `age_equal_or_over: { "M": true }` with M >= minAge,
 * or a birth date at least `minAge` years before today.
 */
export function meetsMinimumAge(
  ageClaims: Record<string, unknown> | undefined,
  minAge: number,
  now: Date = new Date()
): boolean {
  if (!ageClaims) {
    return false;
  }
  return [ageClaims, ...Object.values(ageClaims)].some(
    (scope) => isRecord(scope) && scopeMeetsMinimumAge(scope, minAge, now)
  );
}
