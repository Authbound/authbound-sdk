import {
  STATION_DISPLAY_TOKEN_HEADER,
  STATION_OPERATOR_GRANT_TOKEN_HEADER,
} from "@authbound/core";
import { createError, defineEventHandler, getHeader, type H3Event } from "h3";
import { forwardStationRequest, stationParam } from "./station-runtime";

function stationHeader(event: H3Event, name: string) {
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

function requiredStationHeader(event: H3Event, name: string) {
  const value = stationHeader(event, name);
  if (value) {
    return value;
  }
  throw createError({
    statusCode: 400,
    message: `${name} is required`,
  });
}

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const verificationId = stationParam(event, "verificationId");
  const displayToken = requiredStationHeader(
    event,
    STATION_DISPLAY_TOKEN_HEADER
  );
  const grantToken = requiredStationHeader(
    event,
    STATION_OPERATOR_GRANT_TOKEN_HEADER
  );

  return forwardStationRequest(
    event,
    `/v1/stations/public/${encodeURIComponent(stationId)}/verifications/${encodeURIComponent(verificationId)}/disclosure`,
    {
      method: "GET",
      headers: {
        [STATION_DISPLAY_TOKEN_HEADER]: displayToken,
        [STATION_OPERATOR_GRANT_TOKEN_HEADER]: grantToken,
      },
    }
  );
});
