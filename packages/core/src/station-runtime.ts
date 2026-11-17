export type StationRuntimeMode = "direct" | "proxy";
export const STATION_DISPLAY_TOKEN_HEADER = "X-Authbound-Station-Display-Token";
export const STATION_OPERATOR_GRANT_TOKEN_HEADER =
  "X-Authbound-Station-Operator-Grant-Token";

interface StationRuntimeUrlOptions {
  baseUrl?: string;
  mode?: StationRuntimeMode;
  stationId: string;
}

interface StationTokenUrlOptions extends StationRuntimeUrlOptions {
  token: string;
}

interface StationDisplayUrlOptions extends StationTokenUrlOptions {
  refreshEntryToken?: boolean;
}

interface StationOperatorEventsUrlOptions extends StationRuntimeUrlOptions {
  grantToken: string;
}

interface StationDisclosureUrlOptions extends StationRuntimeUrlOptions {
  displayToken?: string;
  grantToken: string;
  verificationId: string;
}

function runtimeMode(mode: StationRuntimeMode | undefined): StationRuntimeMode {
  return mode ?? "direct";
}

function defaultBaseUrl(mode: StationRuntimeMode): string | undefined {
  return mode === "direct" ? "https://api.authbound.io" : undefined;
}

function buildUrl(path: string, baseUrl: string | undefined): string {
  if (!baseUrl) {
    return path;
  }
  return new URL(path, baseUrl).toString();
}

function appendQuery(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${path}?${search}`;
}

export function buildStationEntryUrl(options: StationTokenUrlOptions): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(options.stationId)}/entry`
      : `/v1/stations/public/${encodeURIComponent(
          options.stationId
        )}/verifications`;
  return buildUrl(
    appendQuery(path, { token: options.token }),
    options.baseUrl ?? defaultBaseUrl(mode)
  );
}

export function buildStationDisplayUrl(
  options: StationDisplayUrlOptions
): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(
          options.stationId
        )}/display`
      : `/v1/stations/public/${encodeURIComponent(options.stationId)}/display`;
  const params: Record<string, string> = { token: options.token };
  if (options.refreshEntryToken) {
    params.refresh_entry_token = "true";
  }
  return buildUrl(
    appendQuery(path, params),
    options.baseUrl ?? defaultBaseUrl(mode)
  );
}

export function buildStationDisplayEventsUrl(
  options: StationTokenUrlOptions
): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(
          options.stationId
        )}/display/events/sse`
      : `/v1/stations/public/${encodeURIComponent(
          options.stationId
        )}/display/events/sse`;
  return buildUrl(
    appendQuery(path, { token: options.token }),
    options.baseUrl ?? defaultBaseUrl(mode)
  );
}

export function buildStationOperatorUrl(
  options: StationRuntimeUrlOptions
): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(
          options.stationId
        )}/operator`
      : `/v1/stations/public/${encodeURIComponent(options.stationId)}/operator`;
  return buildUrl(path, options.baseUrl ?? defaultBaseUrl(mode));
}

export function buildStationOperatorEventsUrl(
  options: StationOperatorEventsUrlOptions
): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(
          options.stationId
        )}/operator/events/sse`
      : `/v1/stations/public/${encodeURIComponent(
          options.stationId
        )}/operator/events/sse`;
  return buildUrl(
    appendQuery(path, { grant_token: options.grantToken }),
    options.baseUrl ?? defaultBaseUrl(mode)
  );
}

export function buildStationDisclosureUrl(
  options: StationDisclosureUrlOptions
): string {
  const mode = runtimeMode(options.mode);
  const path =
    mode === "proxy"
      ? `/api/authbound/stations/${encodeURIComponent(
          options.stationId
        )}/verifications/${encodeURIComponent(
          options.verificationId
        )}/disclosure`
      : `/v1/stations/public/${encodeURIComponent(
          options.stationId
        )}/verifications/${encodeURIComponent(
          options.verificationId
        )}/disclosure`;
  return buildUrl(path, options.baseUrl ?? defaultBaseUrl(mode));
}
