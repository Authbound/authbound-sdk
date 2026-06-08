import { defineEventHandler } from "h3";
import {
  forwardStationRequest,
  stationEntryBody,
  stationParam,
} from "./station-runtime";

export default defineEventHandler(async (event) => {
  const stationId = stationParam(event, "stationId");
  const body = await stationEntryBody(event);
  const search = new URLSearchParams({ token: body.token });

  return forwardStationRequest(
    event,
    `/v1/stations/public/${encodeURIComponent(stationId)}/verifications?${search.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_ref: body.clientRef,
        transport: body.transport,
      }),
    }
  );
});
