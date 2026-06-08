import { defineEventHandler } from "h3";
import {
  forwardStationRequest,
  queryToken,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const token = queryToken(event, "token", "display_token", "displayToken");
  const search = new URLSearchParams({ token });

  return forwardStationRequest(
    event,
    `/v1/stations/public/${encodeURIComponent(stationId)}/display?${search.toString()}`,
    { method: "GET" }
  );
});
