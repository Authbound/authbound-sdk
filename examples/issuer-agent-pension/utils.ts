export interface PensionCredentialFixture {
  "@context": string[];
  id: string;
  type: string[];
  credentialSubject: {
    Person: {
      given_name: string;
      family_name: string;
      birth_date: string;
      personal_administrative_number: string;
    };
    Pension: {
      "@language"?: string;
      typeCode: string;
      typeName: string;
      startDate: string;
      endDate?: string;
      provisional?: boolean;
    };
  };
}

export function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function scriptJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function parsePensionCredential(
  value: unknown
): PensionCredentialFixture {
  if (!isPlainObject(value)) {
    throw new Error("Credential fixture must be a JSON object");
  }

  const credentialSubject = getObject(value, "credentialSubject");
  const Person = getObject(credentialSubject, "Person");
  const Pension = getObject(credentialSubject, "Pension");
  const language = getOptionalString(Pension, "@language");
  const endDate = getOptionalDateString(Pension, "endDate");
  const provisional = getOptionalBoolean(Pension, "provisional");

  return {
    "@context": getStringArray(value, "@context"),
    id: getString(value, "id"),
    type: getStringArray(value, "type"),
    credentialSubject: {
      Person: {
        given_name: getString(Person, "given_name"),
        family_name: getString(Person, "family_name"),
        birth_date: getDateString(Person, "birth_date"),
        personal_administrative_number: getString(
          Person,
          "personal_administrative_number"
        ),
      },
      Pension: {
        ...(language ? { "@language": language } : {}),
        typeCode: getString(Pension, "typeCode"),
        typeName: getString(Pension, "typeName"),
        startDate: getDateString(Pension, "startDate"),
        ...(endDate ? { endDate } : {}),
        ...(provisional !== undefined ? { provisional } : {}),
      },
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getObject(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = source[key];
  if (!isPlainObject(value)) {
    throw new Error(`Credential fixture is missing object field: ${key}`);
  }
  return value;
}

function getString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Credential fixture is missing string field: ${key}`);
  }
  return value;
}

function getOptionalString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Credential fixture has invalid string field: ${key}`);
  }
  return value;
}

function getOptionalBoolean(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Credential fixture has invalid boolean field: ${key}`);
  }
  return value;
}

function getStringArray(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Credential fixture is missing string array field: ${key}`);
  }
  return value as string[];
}

function getDateString(source: Record<string, unknown>, key: string) {
  const value = getString(source, key);
  if (!isIsoCalendarDate(value)) {
    throw new Error(`Credential fixture has invalid date field: ${key}`);
  }
  return value;
}

function getOptionalDateString(source: Record<string, unknown>, key: string) {
  if (source[key] === undefined) {
    return;
  }
  return getDateString(source, key);
}

function isIsoCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
