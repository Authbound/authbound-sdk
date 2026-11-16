"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { AgeCheckState } from "@/lib/altid";

type AgeCheck = { walletUrl: string; expiresAt: string | null };

const POLL_INTERVAL_MS = 2000;

const MESSAGES: Record<Exclude<AgeCheckState, "pending">, string> = {
  over_18: "AltID confirmed that you are 18 or older.",
  not_over_18: "AltID answered that you are under 18.",
  declined: "You declined the request in AltID.",
  failed: "The check failed. Start again.",
  expired: "The check expired. Start again.",
  canceled: "The check was canceled.",
  result_invalid: "The answer could not be checked. Start again.",
};

function isPhone(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export default function AgeCheckPage() {
  const [check, setCheck] = useState<AgeCheck | null>(null);
  const [state, setState] = useState<AgeCheckState | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);

  useEffect(() => setPhone(isPhone()), []);

  // The server cancels any open check before it starts a new one.
  async function start() {
    setCheck(null);
    setQrCode(null);
    setState(null);

    const response = await fetch("/api/age-check", { method: "POST" });
    if (!response.ok) {
      setState("failed");
      return;
    }
    const started = (await response.json()) as AgeCheck;
    setCheck(started);
    setState("pending");
    setQrCode(
      await QRCode.toDataURL(started.walletUrl, { margin: 1, width: 240 })
    );
  }

  async function cancel() {
    await fetch("/api/age-check", { method: "DELETE" });
    setCheck(null);
    setState("canceled");
  }

  useEffect(() => {
    if (!check || state !== "pending") return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (stopped || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      let next: AgeCheckState = "pending";
      try {
        const response = await fetch("/api/age-check", { cache: "no-store" });
        if (response.ok)
          next = ((await response.json()) as { state: AgeCheckState }).state;
      } catch {
        // A failed read is retried on the next tick.
      }
      inFlight = false;
      if (stopped) return;
      if (next === "pending") timer = setTimeout(poll, POLL_INTERVAL_MS);
      else setState(next);
    }

    // Phones pause timers while AltID is in front, so check at once on return.
    function onVisible() {
      if (document.visibilityState === "visible") poll();
    }

    document.addEventListener("visibilitychange", onVisible);
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check, state]);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        margin: "4rem auto",
        maxWidth: 420,
      }}
    >
      <h1>Age check</h1>
      <button onClick={start} type="button">
        {check ? "Start again" : "Check my age with AltID"}
      </button>

      {check && state === "pending" ? (
        <>
          {phone ? (
            <p>
              <a href={check.walletUrl}>Open AltID</a>
            </p>
          ) : (
            <>
              <p>Scan the code with AltID on your phone.</p>
              {qrCode ? (
                <img
                  alt="AltID QR code"
                  height={240}
                  src={qrCode}
                  width={240}
                />
              ) : null}
            </>
          )}
          <button onClick={cancel} type="button">
            Cancel
          </button>
        </>
      ) : null}

      {state && state !== "pending" ? <output>{MESSAGES[state]}</output> : null}
      {state === "over_18" ? (
        <p>
          <a href="/adult">Continue to 18+ content</a>
        </p>
      ) : null}
    </main>
  );
}
