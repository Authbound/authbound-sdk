import { defineEventHandler, getQuery } from "h3";
import {
  forwardStationRequest,
  queryToken,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const token = queryToken(event, "token", "display_token", "displayToken");
  const search = new URLSearchParams({ token });
  const query = getQuery(event);
  if (query.refresh_entry_token === "true") {
    search.set("refresh_entry_token", "true");
  }

  return forwardStationRequest(
    event,
    `/v1/stations/public/${encodeURIComponent(stationId)}/display?${search.toString()}`,
    { method: "GET" }
  );
});
