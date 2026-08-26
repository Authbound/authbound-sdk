import { isDeepStrictEqual } from "node:util";
import { AuthboundClientError } from "@authbound/server";

function employeeCredentialDefinitionPayload(credentialDefinitionId) {
  return {
    credentialDefinitionId,
    vct: "urn:vc:authbound:employee-badge:1.0",
    format: "dc+sd-jwt",
    title: "Employee Badge",
    aliases: ["employee_badge"],
    claims: [
      { path: ["Employee", "given_name"], mandatory: true },
      { path: ["Employee", "family_name"], mandatory: true },
      { path: ["Employee", "employee_number"], mandatory: true },
      { path: ["Employee", "department"], mandatory: true },
    ],
    metadata: {
      example: "issuer-agent-basic",
    },
  };
}

function normalizeClaims(claims) {
  return claims.map((claim) => ({
    name: claim.path.join("."),
    path: claim.path,
    mandatory: claim.mandatory ?? false,
    displayName: claim.displayName ?? claim.path.at(-1) ?? claim.path.join("."),
  }));
}

function walletFacingDefinition(definition) {
  return {
    credentialDefinitionId: definition.credentialDefinitionId,
    vct: definition.vct,
    format: definition.format,
    title: definition.title,
    aliases: definition.aliases,
    claims: definition.claims,
    rendering: definition.rendering,
  };
}

function expectedWalletFacingDefinition(input) {
  return {
    credentialDefinitionId: input.credentialDefinitionId,
    vct: input.vct,
    format: input.format,
    title: input.title,
    aliases: input.aliases ?? [],
    claims: normalizeClaims(input.claims),
    rendering: input.rendering,
  };
}

function assertMatchingOwnedDraft(definition, expected) {
  if (
    !isDeepStrictEqual(
      walletFacingDefinition(definition),
      expectedWalletFacingDefinition(expected)
    )
  ) {
    throw new Error(
      "Credential definition draft does not match this example's expected wallet-facing definition. Inspect the draft and update it before publishing; this example will not overwrite it automatically."
    );
  }
}

export async function ensureEmployeeCredentialDefinition(
  authboundClient,
  credentialDefinitionId
) {
  const expected = employeeCredentialDefinitionPayload(credentialDefinitionId);

  try {
    const definition = await authboundClient.issuer.credentialDefinitions.get(
      credentialDefinitionId
    );
    if (definition.lifecycleStatus === "published") {
      return definition;
    }
    if (definition.lifecycleStatus === "draft") {
      assertMatchingOwnedDraft(definition, expected);
      return authboundClient.issuer.credentialDefinitions.publish(
        credentialDefinitionId,
        { idempotencyKey: `publish:${credentialDefinitionId}:v1` }
      );
    }
    throw new Error(
      "Credential definition is archived. Create a new credential definition version."
    );
  } catch (error) {
    if (
      !(error instanceof AuthboundClientError) ||
      error.code !== "credential_definition_not_found"
    ) {
      throw error;
    }
  }

  return authboundClient.issuer.credentialDefinitions.create(expected);
}
