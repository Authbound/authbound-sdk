import { AuthboundError } from "../types/errors";
import {
  TERMINAL_VERIFICATION_PROGRESS_STATUSES,
  VerificationFailureCodeSchema,
} from "../types/verification-contract";

export function assertBrowserSafeStatusPayload(
  data: Record<string, unknown>
): void {
  const forbiddenFields = [
    "result_token",
    "resultToken",
    "assertions",
    "result",
  ];
  for (const field of forbiddenFields) {
    if (field in data) {
      throw new AuthboundError(
        "verification_invalid_state",
        "Browser status response included signed result material"
      );
    }
  }

  if (
    typeof data.status === "string" &&
    TERMINAL_VERIFICATION_PROGRESS_STATUSES.some(
      (terminalStatus) => terminalStatus === data.status
    ) &&
    ("client_action" in data || "clientAction" in data)
  ) {
    throw new AuthboundError(
      "verification_invalid_state",
      "Browser status response included wallet handoff data after terminal verification status"
    );
  }

  const failureCode = data.failure_code ?? data.failureCode;
  if (data.status === "failed") {
    const parsedFailureCode =
      VerificationFailureCodeSchema.safeParse(failureCode);
    if (!parsedFailureCode.success) {
      throw new AuthboundError(
        "verification_invalid_state",
        "Browser failed status response is missing a valid failure code"
      );
    }
    return;
  }

  if (failureCode !== undefined && failureCode !== null) {
    throw new AuthboundError(
      "verification_invalid_state",
      "Browser non-failed status response included a failure code"
    );
  }
}
