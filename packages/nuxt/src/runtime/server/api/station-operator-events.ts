import { defineEventHandler } from "h3";
import {
  forwardStationStream,
  queryToken,
  stationEventCursor,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const grantToken = queryToken(event, "grant_token", "grantToken");
  const search = new URLSearchParams({ grant_token: grantToken });
  const cursor = stationEventCursor(event);
  if (cursor.after) {
    search.set("after", cursor.after);
  }

  return forwardStationStream(
    `/v1/stations/public/${encodeURIComponent(
      stationId
    )}/operator/events/sse?${search.toString()}`,
    { lastEventId: cursor.lastEventId }
  );
});
