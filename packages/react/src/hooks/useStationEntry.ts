import {
  authboundContractHeaders,
  buildStationEntryUrl,
  type StationRuntimeMode,
  type StationSpawn,
  StationSpawnSchema,
} from "@authbound/core";
import { useCallback, useState } from "react";

export interface UseStationEntryOptions {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  entryToken: string;
  clientRef?: string;
  transport?: "qr" | "nfc" | "link";
}

export interface UseStationEntryReturn {
  spawn: StationSpawn | null;
  isLoading: boolean;
  error: Error | null;
  start: () => Promise<StationSpawn>;
}

function generateClientRef(): string {
  return `clref_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : response.statusText;
    throw new Error(message);
  }
  return body;
}

export function useStationEntry(
  options: UseStationEntryOptions
): UseStationEntryReturn {
  const [spawn, setSpawn] = useState<StationSpawn | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const start = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = buildStationEntryUrl({
        baseUrl: options.runtimeBaseUrl ?? options.gatewayBaseUrl,
        mode: options.runtimeMode,
        stationId: options.stationId,
        token: options.entryToken,
      });
      const payload = await readJson(
        await fetch(url, {
          method: "POST",
          headers: {
            ...authboundContractHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_ref: options.clientRef ?? generateClientRef(),
            transport: options.transport ?? "link",
          }),
        })
      );
      const parsed = StationSpawnSchema.parse(payload);
      setSpawn(parsed);
      return parsed;
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause));
      setError(nextError);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, [
    options.gatewayBaseUrl,
    options.runtimeBaseUrl,
    options.runtimeMode,
    options.stationId,
    options.entryToken,
    options.clientRef,
    options.transport,
  ]);

  return { spawn, isLoading, error, start };
}
