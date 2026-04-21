import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const issuerSdkContract = [
  {
    method: "get",
    path: "/v1/issuer/credential-definitions",
    operationId: "listCredentialDefinitions",
  },
  {
    method: "post",
    path: "/v1/issuer/credential-definitions",
    operationId: "createCredentialDefinition",
  },
  {
    method: "get",
    path: "/v1/issuer/credential-definitions/{credentialDefinitionId}",
    operationId: "getCredentialDefinition",
  },
  {
    method: "patch",
    path: "/v1/issuer/credential-definitions/{credentialDefinitionId}",
    operationId: "updateCredentialDefinition",
  },
  {
    method: "post",
    path: "/v1/issuer/credential-definitions/{credentialDefinitionId}/archive",
    operationId: "archiveCredentialDefinition",
  },
  {
    method: "post",
    path: "/v1/openid4vc/issuance/offer",
    operationId: "createOpenId4VcIssuanceOffer",
  },
  {
    method: "get",
    path: "/v1/openid4vc/issuance",
    operationId: "listOpenId4VcIssuance",
  },
  {
    method: "get",
    path: "/v1/openid4vc/issuance/{issuanceId}",
    operationId: "getOpenId4VcIssuance",
  },
  {
    method: "patch",
    path: "/v1/openid4vc/issuance/{issuanceId}",
    operationId: "updateOpenId4VcIssuance",
  },
  {
    method: "post",
    path: "/v1/openid4vc/issuance/{issuanceId}/cancel",
    operationId: "cancelOpenId4VcIssuance",
  },
] as const;

describe("public issuer SDK/OpenAPI contract", () => {
  it("keeps documented issuer paths aligned with SDK method paths", () => {
    const openApi = readFileSync(
      resolve(process.cwd(), "../../../../docs/api/openapi.yaml"),
      "utf8"
    );

    for (const route of issuerSdkContract) {
      expect(openApi).toContain(`  ${route.path}:`);
      expect(openApi).toContain(`      operationId: ${route.operationId}`);
      expect(openApi).toContain(`    ${route.method}:`);
    }
  });
});
