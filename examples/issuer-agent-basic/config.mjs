export const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Resolve the example's listening port from a raw PORT environment value.
 * An unset PORT falls back to 3000; any other value must be a valid TCP port.
 */
export function resolvePort(rawValue) {
  if (rawValue === undefined) {
    return DEFAULT_PORT;
  }

  const text = String(rawValue).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `Invalid PORT ${JSON.stringify(rawValue)}: expected an integer between ${MIN_PORT} and ${MAX_PORT}`
    );
  }

  const port = Number(text);
  if (port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid PORT ${JSON.stringify(rawValue)}: expected an integer between ${MIN_PORT} and ${MAX_PORT}`
    );
  }

  return port;
}
