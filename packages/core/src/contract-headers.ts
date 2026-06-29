import {
  AUTHBOUND_API_VERSION,
  AUTHBOUND_API_VERSION_HEADER,
  AUTHBOUND_CONTRACT_REVISION,
  AUTHBOUND_CONTRACT_REVISION_HEADER,
} from "./generated/api-contract";

export {
  AUTHBOUND_API_VERSION,
  AUTHBOUND_API_VERSION_HEADER,
  AUTHBOUND_CONTRACT_REVISION,
  AUTHBOUND_CONTRACT_REVISION_HEADER,
};

export function authboundContractHeaders(): Record<string, string> {
  return {
    [AUTHBOUND_API_VERSION_HEADER]: AUTHBOUND_API_VERSION,
    [AUTHBOUND_CONTRACT_REVISION_HEADER]: AUTHBOUND_CONTRACT_REVISION,
  };
}

export function withAuthboundContractHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  for (const [name, value] of Object.entries(authboundContractHeaders())) {
    merged.set(name, value);
  }
  return merged;
}
