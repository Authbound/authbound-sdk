import {
  currentCheck,
  forgetCheck,
  rememberCheck,
  rememberOver18,
} from "@/lib/age-session";
import { cancelAgeCheck, readAgeCheck, startAgeCheck } from "@/lib/altid";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

/** Starts a check, replacing any open one, and ties it to this browser. */
export async function POST() {
  const previous = await currentCheck();
  if (previous) await cancelAgeCheck(previous);

  const { verificationId, walletUrl, expiresAt } = await startAgeCheck();
  await rememberCheck(verificationId);
  return Response.json(
    { walletUrl, expiresAt },
    { status: 201, headers: noStore }
  );
}

/** The state of this browser's check, as one word. Never claims or tokens. */
export async function GET() {
  const verificationId = await currentCheck();
  if (!verificationId) {
    return Response.json(
      { error: "no_check" },
      { status: 404, headers: noStore }
    );
  }

  const { state } = await readAgeCheck(verificationId);
  if (state === "over_18") await rememberOver18(verificationId);
  if (state !== "pending") await forgetCheck();
  return Response.json({ state }, { headers: noStore });
}

/** Cancels this browser's open check. */
export async function DELETE() {
  const verificationId = await currentCheck();
  if (verificationId) await cancelAgeCheck(verificationId);
  await forgetCheck();
  return new Response(null, { status: 204 });
}
