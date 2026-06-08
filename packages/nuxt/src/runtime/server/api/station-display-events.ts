import { defineEventHandler } from "h3";
import {
  forwardStationStream,
  queryToken,
  stationEventCursor,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const token = queryToken(event, "token", "display_token", "displayToken");
  const search = new URLSearchParams({ token });
  const cursor = stationEventCursor(event);
  if (cursor.after) {
    search.set("after", cursor.after);
  }

  return forwardStationStream(
    `/v1/stations/public/${encodeURIComponent(stationId)}/display/events/sse?${search.toString()}`,
    { lastEventId: cursor.lastEventId }
  );
});
