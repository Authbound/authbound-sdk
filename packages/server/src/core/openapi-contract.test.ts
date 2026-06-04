import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type OpenApiSchema = Record<string, unknown>;
type OpenApiDocument = {
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
};

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
  function readRootOpenApiText(): string {
    return readFileSync(
      resolve(process.cwd(), "../../../../docs/api/openapi.yaml"),
      "utf8"
    );
  }

  function readRootOpenApi(): OpenApiDocument {
    return parse(readRootOpenApiText()) as OpenApiDocument;
  }

  function getSchema(document: OpenApiDocument, name: string): OpenApiSchema {
    const schema = document.components?.schemas?.[name];
    if (!schema) {
      throw new Error(`Missing OpenAPI schema: ${name}`);
    }
    return schema;
  }

  it("keeps documented issuer paths aligned with SDK method paths", () => {
    const openApi = readRootOpenApiText();

    for (const route of issuerSdkContract) {
      expect(openApi).toContain(`  ${route.path}:`);
      expect(openApi).toContain(`      operationId: ${route.operationId}`);
      expect(openApi).toContain(`    ${route.method}:`);
    }
  });

  it("documents nullable public verification fields accepted by the SDK parser", () => {
    const openApi = readRootOpenApi();
    const verificationStatus = getSchema(openApi, "VerificationStatus");
    const verificationStatusProperties = verificationStatus.properties as
      | Record<string, OpenApiSchema>
      | undefined;
    const verification = getSchema(openApi, "Verification");
    const verificationProperties = verification.properties as
      | Record<string, OpenApiSchema>
      | undefined;

    expect(verificationStatus.type).toBe("object");
    expect(verificationStatus.description).toBe(
      "Lightweight status for client-side polling"
    );
    expect(verificationStatus.required).toEqual(["object", "id", "status"]);
    expect(verificationStatusProperties?.object).toMatchObject({
      enum: ["verification_status"],
      type: "string",
    });
    expect(verificationStatusProperties?.failure_code).toMatchObject({
      type: ["string", "null"],
    });
    expect(verificationProperties?.terminal_at).toMatchObject({
      type: ["string", "null"],
    });
  });

  it("documents public verification provider vocabulary and cancel response shape", () => {
    const openApi = readRootOpenApi();
    const verification = getSchema(openApi, "Verification");
    const verificationProperties = verification.properties as
      | Record<string, OpenApiSchema>
      | undefined;
    const cancelRoute = openApi.paths?.["/v1/verifications/{id}/cancel"]
      ?.post as
      | {
          responses: Record<
            string,
            { content: { "application/json": { schema: { $ref: string } } } }
          >;
        }
      | undefined;

    expect(verificationProperties?.provider).toMatchObject({
      enum: ["vcs", "eudi", "eudiplo"],
      type: "string",
    });
    expect(verificationProperties?.failure_code).toMatchObject({
      enum: [
        "presentation_invalid",
        "credential_expired",
        "credential_revoked",
        "issuer_untrusted",
        "missing_requested_assertions",
        "policy_not_satisfied",
        "processing_timeout",
        "provider_error",
        "user_declined",
        "wallet_error",
        null,
      ],
      type: ["string", "null"],
    });
    expect(
      cancelRoute?.responses["200"].content["application/json"].schema.$ref
    ).toBe("#/components/schemas/Verification");
  });
});
