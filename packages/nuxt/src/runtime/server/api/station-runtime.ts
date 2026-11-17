import { withAuthboundContractHeaders } from "@authbound/core";
import { redactSensitiveText } from "@authbound/server";
import {
  createError,
  getHeader,
  getQuery,
  getRouterParam,
  type H3Event,
  readBody,
  setHeaders,
} from "h3";
import { useRuntimeConfig } from "nitropack/runtime";

function gatewayUrl(): string {
  return process.env.AUTHBOUND_API_URL ?? "https://api.authbound.io";
}

export function stationParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name);
  if (!value) {
    throw createError({
      statusCode: 400,
      message: `${name} is required`,
    });
  }
  return value;
}

export function queryToken(event: H3Event, ...names: string[]): string {
  const query = getQuery(event);
  for (const name of names) {
    const value = query[name];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  throw createError({
    statusCode: 400,
    message: `${names[0]} is required`,
  });
}

export function stationHeader(event: H3Event, name: string) {
  const h3Header =
    getHeader(event, name) ?? getHeader(event, name.toLowerCase());
  if (h3Header) {
    return h3Header;
  }

  const headers = event.node.req.headers;
  const targetName = name.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== targetName) {
      continue;
    }
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }
}

export function requiredStationHeader(event: H3Event, name: string) {
  const value = stationHeader(event, name);
  if (value) {
    return value;
  }
  throw createError({
    statusCode: 400,
    message: `${name} is required`,
  });
}

export function stationEventCursor(event: H3Event): {
  after?: string;
  lastEventId?: string;
} {
  const query = getQuery(event);
  const after = query.after;
  const lastEventId = getHeader(event, "last-event-id");

  return {
    ...(typeof after === "string" && after.length > 0 ? { after } : {}),
    ...(lastEventId ? { lastEventId } : {}),
  };
}

export async function stationEntryBody(event: H3Event): Promise<{
  clientRef: string;
  transport: "qr" | "nfc" | "link";
  token: string;
}> {
  const query = getQuery(event);
  const body = await readBody<Record<string, unknown>>(event);
  const token =
    typeof query.token === "string"
      ? query.token
      : typeof body.token === "string"
        ? body.token
        : typeof body.entryToken === "string"
          ? body.entryToken
          : undefined;
  const clientRef =
    typeof body.client_ref === "string"
      ? body.client_ref
      : typeof body.clientRef === "string"
        ? body.clientRef
        : undefined;
  const transport =
    body.transport === "qr" ||
    body.transport === "nfc" ||
    body.transport === "link"
      ? body.transport
      : "link";

  if (!(token && clientRef)) {
    throw createError({
      statusCode: 400,
      message: "token and client_ref are required",
    });
  }

  return { clientRef, transport, token };
}

export async function forwardStationRequest<TBody>(
  event: H3Event,
  path: string,
  init: RequestInit
): Promise<TBody> {
  const config = useRuntimeConfig();
  const response = await fetch(`${gatewayUrl()}${path}`, {
    ...init,
    headers: withAuthboundContractHeaders(init.headers),
  });
  const body = await response.json().catch(() => ({
    error: response.statusText,
  }));

  setHeaders(event, {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? redactSensitiveText(String((body as { message?: unknown }).message))
        : "Station runtime request failed";
    if (config.public.authbound?.debug) {
      console.error("[Authbound] Station runtime request failed", {
        status: response.status,
      });
    }
    throw createError({
      statusCode: response.status,
      message,
    });
  }

  return body as TBody;
}

export async function forwardStationStream(
  path: string,
  options: { lastEventId?: string } = {}
): Promise<Response> {
  const requestHeaders = options.lastEventId
    ? { "Last-Event-ID": options.lastEventId }
    : undefined;
  const response = await fetch(`${gatewayUrl()}${path}`, {
    method: "GET",
    headers: withAuthboundContractHeaders(requestHeaders),
  });
  const responseHeaders = new Headers();
  for (const name of [
    "content-type",
    "cache-control",
    "connection",
    "x-accel-buffering",
  ]) {
    const value = response.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
