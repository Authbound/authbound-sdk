import {
  isSameOriginSessionRequest,
  type ProviderPreference,
  ProviderPreferenceSchema,
  type VerificationProviderOptions,
} from "@authbound/core";
import { z } from "zod";
import {
  BrowserVerificationResponseError,
  type BrowserVerificationSource,
  BrowserWalletUrlError,
  toBrowserVerificationResponse,
} from "./browser-verification";
import { AuthboundClientError, type SignedVerificationResult } from "./client";
import { createSafeErrorResponse, logError } from "./error-utils";
import { toVerifiedSessionFinalization } from "./session-finalization";
import type {
  AuthboundConfig,
  AuthboundVerificationContext,
  CreateVerificationResponse,
  VerificationStatusResponse,
  WebhookEvent,
  WebhookEventType,
} from "./types";
import { WebhookEventSchema } from "./types";
import { verifyWebhookSignatureDetailed } from "./webhooks";

export type HandlerKernelRequest = {
  url: string;
  headers: {
    get(name: string): string | null;
  };
};

export type HandlerKernelConfig = Pick<
  AuthboundConfig,
  | "allowedOrigins"
  | "debug"
  | "trustProxy"
  | "unsafeSkipWebhookSignatureVerification"
  | "webhookSecret"
  | "webhookTolerance"
>;

export type HandlerKernelErrorBody = {
  error: string;
  code: string;
};

export type HandlerKernelResponse<TBody = unknown> = {
  status: number;
  body: TBody;
  cookies?: HandlerKernelCookieEffects;
};

export type HandlerKernelCookieEffects = {
  setPendingVerification?: {
    userRef: string;
    verificationId: string;
  };
  setVerification?: {
    userRef: string;
    verificationId: string;
    status: "VERIFIED";
    assuranceLevel: "SUBSTANTIAL";
    age?: number;
    dateOfBirth?: string;
  };
  clearPendingVerification?: boolean;
  clearVerification?: boolean;
};

type CreateVerificationClient = {
  verifications: {
    create(options: {
      policyId: string;
      customerUserRef?: string;
      metadata?: Record<string, unknown>;
      provider?: ProviderPreference;
      providerOptions?: VerificationProviderOptions;
      idempotencyKey?: string;
    }): Promise<BrowserVerificationSource>;
  };
};

type VerificationResultClient = {
  verifications: {
    getResult(verificationId: string): Promise<SignedVerificationResult>;
  };
};

const CreateVerificationRequestSchema = z.object({
  policyId: z.string().min(1),
  customerUserRef: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  provider: ProviderPreferenceSchema.optional(),
});

const FinalizeVerificationRequestSchema = z.object({
  verificationId: z.string().min(1),
  clientToken: z.string().min(1),
});

export type CreateVerificationHandlerKernelOptions = {
  requestBody: unknown;
  config: HandlerKernelConfig;
  client: CreateVerificationClient;
  providerOptions?: VerificationProviderOptions;
  idempotencyKey?: string;
  getUserRef?: () => string | Promise<string>;
  onVerificationCreated?: (
    response: CreateVerificationResponse
  ) => void | Promise<void>;
};

export async function createVerificationHandlerKernel({
  requestBody,
  config,
  client,
  providerOptions,
  idempotencyKey,
  getUserRef,
  onVerificationCreated,
}: CreateVerificationHandlerKernelOptions): Promise<
  HandlerKernelResponse<CreateVerificationResponse | HandlerKernelErrorBody>
> {
  try {
    const body = CreateVerificationRequestSchema.parse(requestBody ?? {});
    const userRef = body.customerUserRef ?? (await getUserRef?.());

    const result = await client.verifications.create({
      policyId: body.policyId,
      customerUserRef: userRef,
      metadata: body.metadata,
      provider: body.provider,
      ...(providerOptions ? { providerOptions } : {}),
      idempotencyKey,
    });

    const verificationResponse = toBrowserVerificationResponse(result);
    await onVerificationCreated?.(verificationResponse);

    if (config.debug) {
      console.log(
        "[Authbound] Verification created:",
        verificationResponse.verificationId
      );
    }

    return {
      status: 200,
      body: verificationResponse,
      cookies: {
        setPendingVerification: {
          userRef: userRef ?? result.id,
          verificationId: verificationResponse.verificationId,
        },
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request", 400, "INVALID_REQUEST");
    }
    if (error instanceof BrowserWalletUrlError) {
      return errorResponse(error.message, 502, "BROWSER_WALLET_URL_MISSING");
    }
    if (error instanceof BrowserVerificationResponseError) {
      return errorResponse(error.message, 502, "INVALID_GATEWAY_RESPONSE");
    }
    if (error instanceof AuthboundClientError) {
      logError(error, "Verification creation", config.debug);
      return errorResponse(error.message, error.statusCode ?? 500, error.code);
    }
    logError(error, "Verification creation", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return errorResponse(safeError.message, 500, safeError.code);
  }
}

export type FinalizeSessionHandlerKernelOptions = {
  request: HandlerKernelRequest;
  requestBody: unknown;
  pendingVerification: AuthboundVerificationContext | null;
  config: HandlerKernelConfig;
  client: VerificationResultClient;
  getUserRef?: () => string | Promise<string>;
};

export async function finalizeSessionHandlerKernel({
  request,
  requestBody,
  pendingVerification,
  config,
  client,
  getUserRef,
}: FinalizeSessionHandlerKernelOptions): Promise<
  HandlerKernelResponse<
    | {
        isVerified: true;
        verificationId: string;
        status: "verified";
      }
    | HandlerKernelErrorBody
  >
> {
  try {
    if (
      !isSameOriginSessionRequest(request, {
        allowedOrigins: config.allowedOrigins,
        trustProxy: config.trustProxy,
      })
    ) {
      return errorResponse(
        "Cross-origin session finalization is not allowed",
        403,
        "CROSS_ORIGIN_FORBIDDEN"
      );
    }

    const parsed = FinalizeVerificationRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return errorResponse("Invalid request", 400, "INVALID_REQUEST");
    }

    const { verificationId } = parsed.data;
    if (
      !pendingVerification ||
      pendingVerification.status !== "PENDING" ||
      pendingVerification.verificationId !== verificationId
    ) {
      return errorResponse(
        "Verification finalization is not bound to this browser session",
        403,
        "VERIFICATION_BINDING_REQUIRED"
      );
    }

    const userRef = getUserRef
      ? await getUserRef()
      : pendingVerification.userRef;
    if (userRef !== pendingVerification.userRef) {
      return errorResponse(
        "Verification finalization is not bound to the current user",
        403,
        "VERIFICATION_BINDING_REQUIRED"
      );
    }

    const result = await client.verifications.getResult(verificationId);
    const verifiedSession = toVerifiedSessionFinalization(result);
    if (!verifiedSession) {
      return errorResponse(
        "Verification is not verified",
        409,
        "VERIFICATION_NOT_VERIFIED"
      );
    }

    return {
      status: 200,
      body: {
        isVerified: true,
        verificationId,
        status: verifiedSession.status,
      },
      cookies: {
        setVerification: {
          userRef,
          verificationId,
          status: "VERIFIED",
          assuranceLevel: "SUBSTANTIAL",
          age: verifiedSession.age,
          dateOfBirth: verifiedSession.dateOfBirth,
        },
        clearPendingVerification: true,
      },
    };
  } catch (error) {
    if (error instanceof AuthboundClientError) {
      logError(error, "Session finalization", config.debug);
      return errorResponse(error.message, error.statusCode ?? 500, error.code);
    }
    logError(error, "Session finalization", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return errorResponse(safeError.message, 500, safeError.code);
  }
}

export type GetStatusHandlerKernelOptions = {
  config: HandlerKernelConfig;
  getVerification: () =>
    | AuthboundVerificationContext
    | null
    | Promise<AuthboundVerificationContext | null>;
};

export async function getStatusHandlerKernel({
  config,
  getVerification,
}: GetStatusHandlerKernelOptions): Promise<
  HandlerKernelResponse<VerificationStatusResponse | HandlerKernelErrorBody>
> {
  try {
    const verification = await getVerification();
    return {
      status: 200,
      body: {
        verification,
        isVerified: verification?.isVerified ?? false,
      },
    };
  } catch (error) {
    logError(error, "Status check", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return errorResponse(safeError.message, 500, safeError.code);
  }
}

export type SignOutHandlerKernelOptions = {
  config: HandlerKernelConfig;
};

export async function signOutHandlerKernel({
  config,
}: SignOutHandlerKernelOptions): Promise<
  HandlerKernelResponse<{ success: true } | HandlerKernelErrorBody>
> {
  try {
    if (config.debug) {
      console.log("[Authbound] Session cleared");
    }
    return {
      status: 200,
      body: { success: true },
      cookies: {
        clearVerification: true,
        clearPendingVerification: true,
      },
    };
  } catch (error) {
    logError(error, "Sign out", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return errorResponse(safeError.message, 500, safeError.code);
  }
}

export type ProcessWebhookHandlerKernelOptions = {
  rawBody: string | null;
  parsedBody?: unknown;
  signature?: string | null;
  config: HandlerKernelConfig;
  validateWebhookSignature?: (rawBody: string) => boolean | Promise<boolean>;
  onWebhook?: (event: WebhookEvent) => void | Promise<void>;
  onVerified?: (event: WebhookEvent) => void | Promise<void>;
  onFailed?: (event: WebhookEvent) => void | Promise<void>;
};

export async function processWebhookHandlerKernel({
  rawBody,
  parsedBody,
  signature,
  config,
  validateWebhookSignature,
  onWebhook,
  onVerified,
  onFailed,
}: ProcessWebhookHandlerKernelOptions): Promise<
  HandlerKernelResponse<{ received: true } | HandlerKernelErrorBody>
> {
  try {
    if (rawBody === null) {
      if (
        validateWebhookSignature ||
        !config.unsafeSkipWebhookSignatureVerification
      ) {
        return errorResponse(
          "Raw request body is required for webhook verification",
          400,
          "RAW_BODY_REQUIRED"
        );
      }
    } else if (validateWebhookSignature) {
      const isValid = await validateWebhookSignature(rawBody);
      if (!isValid) {
        logError(
          new Error("Invalid webhook signature"),
          "Webhook",
          config.debug
        );
        return errorResponse("Invalid signature", 401, "INVALID_SIGNATURE");
      }
    } else if (!config.unsafeSkipWebhookSignatureVerification) {
      const webhookSecret = getWebhookSecret(config);
      if (!webhookSecret) {
        return errorResponse(
          "Webhook secret is required",
          500,
          "WEBHOOK_SECRET_MISSING"
        );
      }
      if (!signature) {
        return errorResponse(
          "Missing webhook signature",
          401,
          "INVALID_SIGNATURE"
        );
      }
      const verification = verifyWebhookSignatureDetailed({
        payload: rawBody,
        signature,
        secret: webhookSecret,
        tolerance: config.webhookTolerance,
      });
      if (!verification.valid) {
        return errorResponse(
          verification.error ?? "Invalid signature",
          401,
          "INVALID_SIGNATURE"
        );
      }
    }

    let eventBody: unknown;
    if (rawBody === null) {
      eventBody = parsedBody;
    } else {
      try {
        eventBody = JSON.parse(rawBody);
      } catch {
        return errorResponse("Invalid JSON payload", 400, "INVALID_PAYLOAD");
      }
    }

    const parsed = WebhookEventSchema.safeParse(eventBody);
    if (!parsed.success) {
      logError(
        new Error(`Invalid webhook event: ${parsed.error.message}`),
        "Webhook",
        config.debug
      );
      return errorResponse("Invalid webhook event", 400, "INVALID_PAYLOAD");
    }

    const event = parsed.data;
    await onWebhook?.(event);
    if (isVerifiedWebhook(event.type)) {
      await onVerified?.(event);
    }
    if (isFailedWebhook(event.type)) {
      await onFailed?.(event);
    }

    if (config.debug) {
      console.log("[Authbound] Webhook processed:", {
        eventId: event.id,
        eventType: event.type,
        verificationId: event.data.object.id,
        status: event.data.object.status,
      });
    }

    return {
      status: 200,
      body: { received: true },
    };
  } catch (error) {
    logError(error, "Webhook", config.debug);
    const safeError = createSafeErrorResponse(error, 500, config.debug);
    return errorResponse(safeError.message, 500, safeError.code);
  }
}

export function mapHandlerKernelException(
  error: unknown,
  context: string,
  config: HandlerKernelConfig
): HandlerKernelResponse<HandlerKernelErrorBody> {
  logError(error, context, config.debug);
  const safeError = createSafeErrorResponse(error, 500, config.debug);
  return errorResponse(safeError.message, 500, safeError.code);
}

function errorResponse(
  message: string,
  status: number,
  code: string
): HandlerKernelResponse<HandlerKernelErrorBody> {
  return {
    status,
    body: {
      error: message,
      code,
    },
  };
}

function getWebhookSecret(config: HandlerKernelConfig): string | undefined {
  return config.webhookSecret ?? process.env.AUTHBOUND_WEBHOOK_SECRET;
}

function isVerifiedWebhook(type: WebhookEventType): boolean {
  return type === "verification.completed";
}

function isFailedWebhook(type: WebhookEventType): boolean {
  return (
    type === "verification.failed" ||
    type === "verification.canceled" ||
    type === "verification.expired"
  );
}
