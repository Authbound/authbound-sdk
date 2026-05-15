import type { SignedVerificationResult } from "./client";
import { calculateAge } from "./types";

export interface VerifiedSessionFinalization {
  status: "verified";
  age?: number;
  dateOfBirth?: string;
}

function getBirthDate(
  assertions: Record<string, unknown> | undefined
): string | undefined {
  if (typeof assertions?.birth_date === "string") {
    return assertions.birth_date;
  }
  if (typeof assertions?.date_of_birth === "string") {
    return assertions.date_of_birth;
  }
  if (typeof assertions?.dateOfBirth === "string") {
    return assertions.dateOfBirth;
  }
  return;
}

export function toVerifiedSessionFinalization(
  result: SignedVerificationResult
): VerifiedSessionFinalization | null {
  if (result.status !== "verified") {
    return null;
  }

  const birthDate = getBirthDate(result.assertions);
  const age =
    typeof result.assertions?.age === "number"
      ? result.assertions.age
      : birthDate
        ? calculateAge(birthDate)
        : undefined;

  return {
    status: result.status,
    ...(typeof age === "number" ? { age } : {}),
    ...(birthDate ? { dateOfBirth: birthDate } : {}),
  };
}
