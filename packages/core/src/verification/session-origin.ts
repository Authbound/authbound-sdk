export type SessionOriginRequest = {
  url: string;
  headers: {
    get(name: string): string | null | undefined;
  };
};

export type SessionOriginOptions = {
  allowedOrigins?: string | string[];
  trustProxy?: boolean;
};

function firstHeaderValue(
  value: string | null | undefined
): string | undefined {
  const first = value?.split(",")[0]?.trim();
  return first || undefined;
}

function unquoteHeaderValue(value: string | undefined): string | undefined {
  return value?.replace(/^"|"$/g, "");
}

export function normalizeBrowserOrigin(
  value: string | null | undefined
): string | undefined {
  if (!value) {
    return;
  }

  try {
    const origin = new URL(value).origin;
    return origin === "null" ? undefined : origin;
  } catch {
    return;
  }
}

function originFromParts(
  protocol: string | undefined,
  host: string | undefined
): string | undefined {
  const normalizedProtocol = unquoteHeaderValue(protocol)
    ?.trim()
    .replace(/:$/, "")
    .toLowerCase();
  const normalizedHost = unquoteHeaderValue(host)?.trim();

  if (
    !(
      normalizedProtocol &&
      normalizedHost &&
      ["http", "https"].includes(normalizedProtocol)
    )
  ) {
    return;
  }

  return normalizeBrowserOrigin(`${normalizedProtocol}://${normalizedHost}`);
}

function originFromForwardedHeader(
  value: string | null | undefined
): string | undefined {
  const firstEntry = firstHeaderValue(value);
  if (!firstEntry) {
    return;
  }

  let proto: string | undefined;
  let host: string | undefined;
  for (const rawPart of firstEntry.split(";")) {
    const separatorIndex = rawPart.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = rawPart.slice(0, separatorIndex).trim().toLowerCase();
    const headerValue = rawPart.slice(separatorIndex + 1).trim();
    if (key === "proto") {
      proto = headerValue;
    } else if (key === "host") {
      host = headerValue;
    }
  }

  return originFromParts(proto, host);
}

function hasForwardedOriginHeaders(request: SessionOriginRequest): boolean {
  return Boolean(
    request.headers.get("forwarded") ||
      request.headers.get("x-forwarded-host") ||
      request.headers.get("x-forwarded-proto")
  );
}

export function publicRequestOrigin(
  request: SessionOriginRequest,
  options: Pick<SessionOriginOptions, "trustProxy"> = {}
): string | undefined {
  const requestUrl = new URL(request.url);

  if (options.trustProxy) {
    const forwardedOrigin = originFromForwardedHeader(
      request.headers.get("forwarded")
    );
    if (forwardedOrigin) {
      return forwardedOrigin;
    }

    const forwardedHost = firstHeaderValue(
      request.headers.get("x-forwarded-host")
    );
    if (forwardedHost) {
      return originFromParts(
        firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
          requestUrl.protocol,
        forwardedHost
      );
    }
  }

  const host = firstHeaderValue(request.headers.get("host"));
  if (host) {
    const protocol =
      options.trustProxy
        ? firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
          requestUrl.protocol
        : hasForwardedOriginHeaders(request)
          ? "http"
          : requestUrl.protocol;
    return originFromParts(protocol, host);
  }

  if (!options.trustProxy && hasForwardedOriginHeaders(request)) {
    return originFromParts("http", requestUrl.host);
  }

  return normalizeBrowserOrigin(request.url);
}

function normalizeAllowedOrigins(
  allowedOrigins: string | string[] | undefined
): Set<string> | undefined {
  if (allowedOrigins === undefined) {
    return;
  }

  const values = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : [allowedOrigins];
  return new Set(
    values
      .map((value) => normalizeBrowserOrigin(value))
      .filter((value): value is string => Boolean(value))
  );
}

export function isSameOriginSessionRequest(
  request: SessionOriginRequest,
  options: SessionOriginOptions = {}
): boolean {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    return false;
  }

  const originHeader = request.headers.get("origin");
  const origin = normalizeBrowserOrigin(originHeader);
  if (!origin) {
    return false;
  }

  const configuredOrigins = normalizeAllowedOrigins(options.allowedOrigins);
  if (configuredOrigins) {
    return configuredOrigins.has(origin);
  }

  return publicRequestOrigin(request, options) === origin;
}

export function originForStatusProxy(
  request: SessionOriginRequest,
  options: Pick<SessionOriginOptions, "trustProxy"> = {}
): string | undefined {
  return (
    normalizeBrowserOrigin(request.headers.get("origin")) ??
    publicRequestOrigin(request, options)
  );
}
