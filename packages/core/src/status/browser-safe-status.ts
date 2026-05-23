import { AuthboundError } from "../types/errors";
import { TERMINAL_VERIFICATION_PROGRESS_STATUSES } from "../types/verification-contract";

export function assertBrowserSafeStatusPayload(data: Record<string, unknown>): void {
  const forbiddenFields = ["result_token", "resultToken", "assertions", "result"];
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
}
