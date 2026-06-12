import { STATION_OPERATOR_GRANT_TOKEN_HEADER } from "@authbound/core";
import { defineEventHandler } from "h3";
import {
  forwardStationRequest,
  requiredStationHeader,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const grantToken = requiredStationHeader(
    event,
    STATION_OPERATOR_GRANT_TOKEN_HEADER
  );

  return forwardStationRequest(
    event,
    `/v1/stations/public/${encodeURIComponent(stationId)}/operator`,
    {
      method: "GET",
      headers: {
        [STATION_OPERATOR_GRANT_TOKEN_HEADER]: grantToken,
      },
    }
  );
});
