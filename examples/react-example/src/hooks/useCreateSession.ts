import { useMutation } from "@tanstack/react-query";
import {
  createSession,
  type CreateSessionRequest,
  type CreateSessionResponse,
} from "../api/quickid";

/**
 * Custom hook for creating a QuickID verification session.
 * Uses React Query's useMutation for automatic state management.
 */
export function useCreateSession() {
  return useMutation<
    CreateSessionResponse,
    Error,
    CreateSessionRequest | undefined
  >({
    mutationFn: createSession,
    // Optional: Add onSuccess/onError callbacks if needed
    // onSuccess: (data) => {
    //   console.log('Session created:', data.session_id);
    // },
    // onError: (error) => {
    //   console.error('Failed to create session:', error);
    // },
  });
}
