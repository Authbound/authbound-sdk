import {
  buildStationDisclosureUrl,
  buildStationDisplayEventsUrl,
  buildStationDisplayUrl,
  STATION_DISPLAY_TOKEN_HEADER,
  STATION_OPERATOR_GRANT_TOKEN_HEADER,
  type StationDisplay,
  StationDisplaySchema,
  type StationRuntimeMode,
  StationSafeAssertionsSchema,
  type StationVerification,
  type StationVerificationDisclosure,
  StationVerificationDisclosureSchema,
  StationVerificationSchema,
} from "@authbound/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TERMINAL_STATUSES = new Set([
  "verified",
  "failed",
  "canceled",
  "expired",
]);
const ENTRY_REFRESH_BEFORE_EXPIRY_MS = 55_000;
const ENTRY_REFRESH_RETRY_MS = 5000;

export interface UseStationOperatorFeedOptions {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  displayToken: string;
  grantToken?: string;
  connectEvents?: boolean;
  refreshEntryToken?: boolean;
}

export interface UseStationOperatorFeedReturn {
  display: StationDisplay | null;
  verifications: StationVerification[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<StationDisplay>;
  readDisclosure: (
    verificationId: string
  ) => Promise<StationVerificationDisclosure>;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : response.statusText;
    throw new Error(message);
  }
  return body;
}

function eventVerification(
  data: Record<string, unknown>
): StationVerification | null {
  if (
    typeof data.verification_id !== "string" ||
    typeof data.station_id !== "string"
  ) {
    return null;
  }

  const assertions = StationSafeAssertionsSchema.safeParse(data.assertions);
  const status = typeof data.status === "string" ? data.status : "processing";
  const now = new Date().toISOString();
  const parsed = StationVerificationSchema.safeParse({
    object: "station_verification",
    station_id: data.station_id,
    verification_id: data.verification_id,
    status,
    created_at: typeof data.created_at === "string" ? data.created_at : now,
    terminal_at:
      typeof data.terminal_at === "string"
        ? data.terminal_at
        : TERMINAL_STATUSES.has(status)
          ? now
          : null,
    transport:
      data.transport === "qr" ||
      data.transport === "nfc" ||
      data.transport === "link"
        ? data.transport
        : "link",
    client_ref: typeof data.client_ref === "string" ? data.client_ref : null,
    failure_code:
      typeof data.failure_code === "string" ? data.failure_code : null,
    outcome_reason:
      typeof data.outcome_reason === "string" ? data.outcome_reason : null,
    assertions: assertions.success ? assertions.data : undefined,
  });

  return parsed.success ? parsed.data : null;
}

function upsertVerification(
  verifications: StationVerification[],
  next: StationVerification
): StationVerification[] {
  return [
    next,
    ...verifications.filter(
      (item) => item.verification_id !== next.verification_id
    ),
  ];
}

function upsertDisplayVerification(
  display: StationDisplay,
  next: StationVerification
): StationDisplay {
  return {
    ...display,
    verifications: upsertVerification(display.verifications, next),
  };
}

function mergePendingVerifications(
  display: StationDisplay,
  pending: StationVerification[]
): StationDisplay {
  return pending.reduceRight(upsertDisplayVerification, display);
}

export function useStationOperatorFeed(
  options: UseStationOperatorFeedOptions
): UseStationOperatorFeedReturn {
  const [display, setDisplay] = useState<StationDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingEventsRef = useRef<StationVerification[]>([]);

  const runtimeBaseUrl = options.runtimeBaseUrl ?? options.gatewayBaseUrl;
  const verifications = useMemo(() => display?.verifications ?? [], [display]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = buildStationDisplayUrl({
        baseUrl: runtimeBaseUrl,
        mode: options.runtimeMode,
        stationId: options.stationId,
        token: options.displayToken,
        refreshEntryToken: options.refreshEntryToken,
      });
      const parsed = StationDisplaySchema.parse(
        await readJson(await fetch(url))
      );
      const merged = mergePendingVerifications(
        parsed,
        pendingEventsRef.current
      );
      pendingEventsRef.current = [];
      setDisplay(merged);
      return merged;
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause));
      setError(nextError);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, [
    runtimeBaseUrl,
    options.runtimeMode,
    options.stationId,
    options.displayToken,
    options.refreshEntryToken,
  ]);

  const readDisclosure = useCallback(
    async (verificationId: string) => {
      if (!options.grantToken) {
        throw new Error("grantToken is required");
      }
      const url = buildStationDisclosureUrl({
        baseUrl: runtimeBaseUrl,
        mode: options.runtimeMode,
        stationId: options.stationId,
        verificationId,
        displayToken: options.displayToken,
        grantToken: options.grantToken,
      });
      return StationVerificationDisclosureSchema.parse(
        await readJson(
          await fetch(url, {
            headers: {
              [STATION_DISPLAY_TOKEN_HEADER]: options.displayToken,
              [STATION_OPERATOR_GRANT_TOKEN_HEADER]: options.grantToken,
            },
          })
        )
      );
    },
    [
      runtimeBaseUrl,
      options.runtimeMode,
      options.stationId,
      options.displayToken,
      options.grantToken,
    ]
  );

  useEffect(() => {
    pendingEventsRef.current = [];
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const runRefresh = () => {
      refresh().catch(() => {
        if (active && options.refreshEntryToken) {
          retryTimer = setTimeout(runRefresh, ENTRY_REFRESH_RETRY_MS);
        }
      });
    };
    runRefresh();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [options.refreshEntryToken, refresh]);

  useEffect(() => {
    if (
      !(
        options.refreshEntryToken &&
        display?.station.status === "active" &&
        display.station.entry.token_expires_at
      )
    ) {
      return;
    }

    const expiresAtMs = Date.parse(display.station.entry.token_expires_at);
    if (!Number.isFinite(expiresAtMs)) {
      return;
    }

    const delayMs = Math.max(
      ENTRY_REFRESH_RETRY_MS,
      expiresAtMs - Date.now() - ENTRY_REFRESH_BEFORE_EXPIRY_MS
    );
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (nextDelayMs: number) => {
      timer = setTimeout(() => {
        refresh().catch(() => {
          if (active) {
            schedule(ENTRY_REFRESH_RETRY_MS);
          }
        });
      }, nextDelayMs);
    };
    schedule(delayMs);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    display?.station.entry.token_expires_at,
    display?.station.status,
    options.refreshEntryToken,
    refresh,
  ]);

  useEffect(() => {
    if (options.connectEvents === false || typeof EventSource === "undefined") {
      return;
    }
    const url = buildStationDisplayEventsUrl({
      baseUrl: runtimeBaseUrl,
      mode: options.runtimeMode,
      stationId: options.stationId,
      token: options.displayToken,
    });
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    for (const eventName of [
      "station.verification.created",
      "station.verification.state_changed",
      "station.verification.completed",
    ]) {
      eventSource.addEventListener(eventName, (event) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return;
        }
        const next = eventVerification(data as Record<string, unknown>);
        if (!next) return;
        setDisplay((current) => {
          if (!current) {
            pendingEventsRef.current = upsertVerification(
              pendingEventsRef.current,
              next
            );
            return current;
          }
          return upsertDisplayVerification(current, next);
        });
      });
    }
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [
    runtimeBaseUrl,
    options.runtimeMode,
    options.stationId,
    options.displayToken,
    options.connectEvents,
  ]);

  return { display, verifications, isLoading, error, refresh, readDisclosure };
}
