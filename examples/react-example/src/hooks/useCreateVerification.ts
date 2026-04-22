import { useMutation } from "@tanstack/react-query";
import {
  type CreateVerificationRequest,
  type CreateVerificationResponse,
  createVerification,
} from "../api/quickid";

/**
 * Custom hook for creating a QuickID verification.
 * Uses React Query's useMutation for automatic state management.
 */
export function useCreateVerification() {
  return useMutation<
    CreateVerificationResponse,
    Error,
    CreateVerificationRequest | undefined
  >({
    mutationFn: createVerification,
  });
}
