import type {
  StationRuntimeMode,
  StationVerification,
  StationVerificationDisclosure,
} from "@authbound/core";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useStationEntry } from "../hooks/useStationEntry";
import { useStationOperatorFeed } from "../hooks/useStationOperatorFeed";
import { QRCode } from "./qr-code";

export interface StationEntryProps {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  entryToken: string;
  children?: ReactNode;
}

export function StationEntry({
  gatewayBaseUrl,
  runtimeBaseUrl,
  runtimeMode,
  stationId,
  entryToken,
  children,
}: StationEntryProps) {
  const entry = useStationEntry({
    gatewayBaseUrl,
    runtimeBaseUrl,
    runtimeMode,
    stationId,
    entryToken,
  });
  const action = entry.spawn?.client_action;

  return (
    <div data-authbound-station-entry>
      {children}
      {action ? (
        <a href={action.data}>Open wallet</a>
      ) : (
        <button
          disabled={entry.isLoading}
          onClick={() => entry.start()}
          type="button"
        >
          {entry.isLoading ? "Preparing" : "Start verification"}
        </button>
      )}
      {entry.error ? <p role="alert">{entry.error.message}</p> : null}
    </div>
  );
}

export interface StationEntryDisplayProps {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  displayToken: string;
}

export function StationEntryDisplay({
  gatewayBaseUrl,
  runtimeBaseUrl,
  runtimeMode,
  stationId,
  displayToken,
}: StationEntryDisplayProps) {
  const feed = useStationOperatorFeed({
    gatewayBaseUrl,
    runtimeBaseUrl,
    runtimeMode,
    stationId,
    displayToken,
  });
  const payload = feed.display?.station.entry.qr_payload;

  return (
    <div data-authbound-station-entry-display>
      {payload ? (
        <QRCode value={payload} />
      ) : (
        <span>{feed.isLoading ? "Loading" : "Unavailable"}</span>
      )}
      {feed.error ? <p role="alert">{feed.error.message}</p> : null}
    </div>
  );
}

export interface StationOperatorConsoleProps {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  displayToken: string;
  grantToken?: string;
}

function preferredVerification(
  verifications: StationVerification[],
  selectedId: string | null
): StationVerification | null {
  return (
    verifications.find((item) => item.verification_id === selectedId) ??
    verifications.find((item) => item.status === "verified") ??
    verifications[0] ??
    null
  );
}

function booleanLabel(value: unknown): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : "--";
}

function disclosureCacheKey(params: {
  displayToken: string;
  grantToken?: string;
  stationId: string;
  verificationId?: string;
}): string | null {
  if (!(params.grantToken && params.verificationId)) {
    return null;
  }
  return [
    params.stationId,
    params.displayToken,
    params.grantToken,
    params.verificationId,
  ].join("\u0000");
}

function disclosureIsActive(
  disclosure: StationVerificationDisclosure | undefined
): disclosure is StationVerificationDisclosure {
  if (!disclosure) {
    return false;
  }
  const expiresAt = Date.parse(disclosure.expires_at);
  return Number.isNaN(expiresAt) || expiresAt > Date.now();
}

export function StationOperatorConsole({
  gatewayBaseUrl,
  runtimeBaseUrl,
  runtimeMode,
  stationId,
  displayToken,
  grantToken,
}: StationOperatorConsoleProps) {
  const feed = useStationOperatorFeed({
    gatewayBaseUrl,
    runtimeBaseUrl,
    runtimeMode,
    stationId,
    displayToken,
    grantToken,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [disclosures, setDisclosures] = useState<
    Record<string, StationVerificationDisclosure>
  >({});
  const [disclosureError, setDisclosureError] = useState<Error | null>(null);
  const [isDisclosureLoading, setIsDisclosureLoading] = useState(false);
  const disclosureScopeKey = useMemo(
    () => [stationId, displayToken, grantToken ?? ""].join("\u0000"),
    [stationId, displayToken, grantToken]
  );
  const previousDisclosureScopeKey = useRef(disclosureScopeKey);
  const selectedVerification = useMemo(
    () => preferredVerification(feed.verifications, selectedId),
    [feed.verifications, selectedId]
  );
  const selectedDisclosureKey = disclosureCacheKey({
    displayToken,
    grantToken,
    stationId,
    verificationId: selectedVerification?.verification_id,
  });
  const selectedCachedDisclosure = selectedDisclosureKey
    ? disclosures[selectedDisclosureKey]
    : undefined;
  const selectedDisclosure = disclosureIsActive(selectedCachedDisclosure)
    ? selectedCachedDisclosure
    : undefined;

  useEffect(() => {
    if (!(selectedVerification && selectedId === null)) {
      return;
    }
    setSelectedId(selectedVerification.verification_id);
  }, [selectedId, selectedVerification]);

  useEffect(() => {
    if (previousDisclosureScopeKey.current === disclosureScopeKey) {
      return;
    }
    previousDisclosureScopeKey.current = disclosureScopeKey;
    setDisclosures({});
    setDisclosureError(null);
    setIsDisclosureLoading(false);
  });

  useEffect(() => {
    if (
      !(
        grantToken &&
        selectedDisclosureKey &&
        selectedVerification?.status === "verified" &&
        !selectedCachedDisclosure
      )
    ) {
      return;
    }

    let active = true;
    setDisclosureError(null);
    setIsDisclosureLoading(true);
    feed
      .readDisclosure(selectedVerification.verification_id)
      .then((disclosure) => {
        if (!active) return;
        setDisclosures((current) => ({
          ...current,
          [selectedDisclosureKey]: disclosure,
        }));
      })
      .catch((cause) => {
        if (!active) return;
        setDisclosureError(
          cause instanceof Error ? cause : new Error(String(cause))
        );
      })
      .finally(() => {
        if (active) {
          setIsDisclosureLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    grantToken,
    selectedDisclosureKey,
    selectedVerification?.verification_id,
    selectedVerification?.status,
    selectedCachedDisclosure,
    feed.readDisclosure,
  ]);

  return (
    <div data-authbound-station-operator-console>
      {feed.error ? <p role="alert">{feed.error.message}</p> : null}
      <ol>
        {feed.verifications.map((verification) => (
          <li key={verification.verification_id}>
            <button
              onClick={() => setSelectedId(verification.verification_id)}
              type="button"
            >
              <strong>{verification.status}</strong>{" "}
              <span>
                {verification.outcome_reason ??
                  verification.failure_code ??
                  verification.verification_id}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {selectedVerification ? (
        <section data-authbound-station-operator-detail>
          <strong>{selectedVerification.status}</strong>
          <dl>
            <div>
              <dt>Age over 18</dt>
              <dd>
                {booleanLabel(selectedVerification.assertions?.age_over_18)}
              </dd>
            </div>
            <div>
              <dt>Ticket valid</dt>
              <dd>
                {booleanLabel(selectedVerification.assertions?.ticket_valid)}
              </dd>
            </div>
          </dl>
          {selectedDisclosure ? (
            <div data-authbound-station-disclosure>
              {selectedDisclosure.fields.portrait ? (
                <img
                  alt="Verified portrait"
                  height={96}
                  src={selectedDisclosure.fields.portrait}
                  width={96}
                />
              ) : null}
              <dl>
                <div>
                  <dt>Given name</dt>
                  <dd>{selectedDisclosure.fields.given_name ?? "--"}</dd>
                </div>
                <div>
                  <dt>Family name</dt>
                  <dd>{selectedDisclosure.fields.family_name ?? "--"}</dd>
                </div>
                <div>
                  <dt>Birth date</dt>
                  <dd>{selectedDisclosure.fields.birth_date ?? "--"}</dd>
                </div>
              </dl>
            </div>
          ) : isDisclosureLoading ? (
            <p>Loading protected details</p>
          ) : disclosureError ? (
            <p role="alert">{disclosureError.message}</p>
          ) : grantToken ? null : (
            <p>Protected identity details require an operator device grant.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
