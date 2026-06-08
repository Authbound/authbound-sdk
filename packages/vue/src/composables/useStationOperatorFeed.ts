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
import {
  type ComputedRef,
  computed,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  type Ref,
  ref,
} from "vue";

const TERMINAL_STATUSES = new Set([
  "verified",
  "failed",
  "canceled",
  "expired",
]);

export interface UseStationOperatorFeedOptions {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  displayToken: string;
  grantToken?: string;
  connectEvents?: boolean;
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

export interface UseStationOperatorFeedReturn {
  display: Ref<StationDisplay | null>;
  verifications: ComputedRef<StationVerification[]>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  refresh: () => Promise<StationDisplay>;
  readDisclosure: (
    verificationId: string
  ) => Promise<StationVerificationDisclosure>;
  connect: () => void;
  close: () => void;
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
  const display = ref<StationDisplay | null>(null);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);
  const runtimeBaseUrl = options.runtimeBaseUrl ?? options.gatewayBaseUrl;
  let eventSource: EventSource | null = null;
  let pendingEvents: StationVerification[] = [];
  const verifications = computed<StationVerification[]>(
    () => display.value?.verifications ?? []
  );

  async function refresh() {
    isLoading.value = true;
    error.value = null;
    try {
      const url = buildStationDisplayUrl({
        baseUrl: runtimeBaseUrl,
        mode: options.runtimeMode,
        stationId: options.stationId,
        token: options.displayToken,
      });
      const parsed = StationDisplaySchema.parse(
        await readJson(await fetch(url))
      );
      const merged = mergePendingVerifications(parsed, pendingEvents);
      pendingEvents = [];
      display.value = merged;
      return merged;
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause));
      error.value = nextError;
      throw nextError;
    } finally {
      isLoading.value = false;
    }
  }

  async function readDisclosure(verificationId: string) {
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
  }

  function connectEvents() {
    if (options.connectEvents === false || typeof EventSource === "undefined") {
      return;
    }
    eventSource?.close();
    const url = buildStationDisplayEventsUrl({
      baseUrl: runtimeBaseUrl,
      mode: options.runtimeMode,
      stationId: options.stationId,
      token: options.displayToken,
    });
    eventSource = new EventSource(url);
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
        if (!display.value) {
          pendingEvents = upsertVerification(pendingEvents, next);
          return;
        }
        display.value = upsertDisplayVerification(display.value, next);
      });
    }
  }

  function close() {
    eventSource?.close();
    eventSource = null;
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      refresh().catch(() => undefined);
      connectEvents();
    });
    onUnmounted(close);
  }

  return {
    display,
    verifications,
    isLoading,
    error,
    refresh,
    readDisclosure,
    connect: connectEvents,
    close,
  };
}
