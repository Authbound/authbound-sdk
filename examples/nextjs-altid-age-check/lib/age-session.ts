import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isVerificationId, requiredEnv } from "@/lib/altid";

/** The visitor's open check. The browser never sends a verification ID itself. */
const CHECK_COOKIE = "altid_check";
/** Set by the server only after it has verified a signed "over 18" answer. */
const OVER_18_COOKIE = "age_over_18";
const CHECK_MAX_AGE_SECONDS = 30 * 60;
const OVER_18_MAX_AGE_SECONDS = 24 * 60 * 60;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

function sign(value: string): string {
  return createHmac("sha256", requiredEnv("AGE_CHECK_COOKIE_SECRET"))
    .update(value)
    .digest("base64url");
}

export async function rememberCheck(verificationId: string): Promise<void> {
  (await cookies()).set(CHECK_COOKIE, verificationId, {
    ...cookieOptions,
    maxAge: CHECK_MAX_AGE_SECONDS,
  });
}

export async function currentCheck(): Promise<string | null> {
  const verificationId = (await cookies()).get(CHECK_COOKIE)?.value;
  return verificationId && isVerificationId(verificationId)
    ? verificationId
    : null;
}

export async function forgetCheck(): Promise<void> {
  (await cookies()).delete(CHECK_COOKIE);
}

export async function rememberOver18(verificationId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + OVER_18_MAX_AGE_SECONDS;
  const value = `${verificationId}.${expiresAt}`;
  (await cookies()).set(OVER_18_COOKIE, `${value}.${sign(value)}`, {
    ...cookieOptions,
    maxAge: OVER_18_MAX_AGE_SECONDS,
  });
}

/** Gate 18+ content on this, never on what the browser says. */
export async function isOver18(): Promise<boolean> {
  const [verificationId, expiresAt, signature] =
    (await cookies()).get(OVER_18_COOKIE)?.value.split(".") ?? [];
  if (!(verificationId && expiresAt && signature)) return false;

  const expected = Buffer.from(sign(`${verificationId}.${expiresAt}`));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return false;
  return Number(expiresAt) > Date.now() / 1000;
}
