import {
  AuthboundClient,
  AuthboundClientError,
  ResultTokenVerificationError,
  verifyClaimsDigest,
} from "@authbound/server";

export type AgeCheckState =
  | "pending"
  | "over_18"
  | "not_over_18"
  | "declined"
  | "failed"
  | "expired"
  | "canceled"
  | "result_invalid";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

let client: AuthboundClient | undefined;

function authbound(): AuthboundClient {
  client ??= new AuthboundClient({
    apiKey: requiredEnv("AUTHBOUND_SECRET_KEY"),
    apiUrl: requiredEnv("AUTHBOUND_API_URL"),
  });
  return client;
}

const VERIFICATION_ID_PATTERN = /^vrf_[A-Za-z0-9]{8,64}$/;

export function isVerificationId(value: string): boolean {
  return VERIFICATION_ID_PATTERN.test(value);
}

/** Pass your user's ID when visitors sign in, so a webhook can find whose check it was. */
export async function startAgeCheck(customerUserRef?: string) {
  const verification = await authbound().verifications.create({
    policyId: requiredEnv("AUTHBOUND_ALTID_POLICY_ID"),
    customerUserRef,
    provider: "eudi",
    // AltID answers only unencrypted direct_post.
    providerOptions: { eudi: { responseMode: "direct_post" } },
  });

  // The AltID link: encode it in a QR code on desktop, or open it on the phone.
  const walletUrl = verification.clientAction?.data;
  if (!walletUrl?.startsWith("https://")) {
    throw new Error("The verification has no AltID link");
  }

  return {
    verificationId: verification.id,
    walletUrl,
    expiresAt:
      verification.clientAction?.expiresAt ?? verification.expiresAt ?? null,
  };
}

export async function readAgeCheck(
  verificationId: string
): Promise<{ state: AgeCheckState; customerUserRef: string | null }> {
  const verification = await authbound().verifications.get(verificationId);
  const customerUserRef = verification.customerUserRef ?? null;
  switch (verification.status) {
    case "verified":
      return { state: await readAgeOutcome(verificationId), customerUserRef };
    case "failed":
      return {
        state:
          verification.failureCode === "user_declined" ? "declined" : "failed",
        customerUserRef,
      };
    case "expired":
    case "canceled":
      return { state: verification.status, customerUserRef };
    default:
      return { state: "pending", customerUserRef };
  }
}

/**
 * `verified` means AltID sent a valid answer, and "not over 18" is a valid
 * answer too. Only the signed claim value decides.
 */
async function readAgeOutcome(verificationId: string): Promise<AgeCheckState> {
  const result = await authbound().verifications.getResult(verificationId);
  if (result.status !== "verified" || !result.claims || !result.claimsSalt) {
    return "result_invalid";
  }

  try {
    // Checks the signature against /v1/jwks, plus the issuer, subject and expiry.
    const token = await authbound().verifications.verifyResultToken(
      result.resultToken,
      {
        verificationId,
      }
    );
    if (token.payload.status !== "verified") return "result_invalid";
    // Checks that the claims are the ones the signed token commits to.
    if (!(await verifyClaimsDigest(result.claims, result.claimsSalt, token))) {
      return "result_invalid";
    }
  } catch (error) {
    if (error instanceof ResultTokenVerificationError) return "result_invalid";
    throw error;
  }

  const ageProof = result.claims["eu.europa.ec.av.1"] as
    | Record<string, unknown>
    | undefined;
  if (ageProof?.age_over_18 === true) return "over_18";
  if (ageProof?.age_over_18 === false) return "not_over_18";
  return "result_invalid";
}

export async function cancelAgeCheck(verificationId: string): Promise<void> {
  try {
    await authbound().verifications.cancel(verificationId);
  } catch (error) {
    // 409: the check already finished, so there is nothing to cancel.
    if (error instanceof AuthboundClientError && error.statusCode === 409)
      return;
    throw error;
  }
}
