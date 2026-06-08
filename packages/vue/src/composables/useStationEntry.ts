import {
  buildStationEntryUrl,
  type StationRuntimeMode,
  type StationSpawn,
  StationSpawnSchema,
} from "@authbound/core";
import { ref } from "vue";

export interface UseStationEntryOptions {
  gatewayBaseUrl?: string;
  runtimeBaseUrl?: string;
  runtimeMode?: StationRuntimeMode;
  stationId: string;
  entryToken: string;
  clientRef?: string;
  transport?: "qr" | "nfc" | "link";
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

export function useStationEntry(options: UseStationEntryOptions) {
  const spawn = ref<StationSpawn | null>(null);
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  async function start() {
    isLoading.value = true;
    error.value = null;
    try {
      const url = buildStationEntryUrl({
        baseUrl: options.runtimeBaseUrl ?? options.gatewayBaseUrl,
        mode: options.runtimeMode,
        stationId: options.stationId,
        token: options.entryToken,
      });
      const parsed = StationSpawnSchema.parse(
        await readJson(
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_ref: options.clientRef ?? generateClientRef(),
              transport: options.transport ?? "link",
            }),
          })
        )
      );
      spawn.value = parsed;
      return parsed;
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause));
      error.value = nextError;
      throw nextError;
    } finally {
      isLoading.value = false;
    }
  }

  return { spawn, isLoading, error, start };
}
