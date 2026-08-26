import { isDeepStrictEqual } from "node:util";
import type {
  AuthboundClient,
  CreateCredentialDefinitionOptions,
  CredentialDefinition,
} from "@authbound/server";
import { AuthboundClientError } from "@authbound/server";
import type { PensionCredentialFixture } from "./utils.ts";

function pensionCredentialDefinitionPayload(
  credentialDefinitionId: string
): CreateCredentialDefinitionOptions {
  return {
    credentialDefinitionId,
    vct: "urn:vc:authbound:pension:1.0",
    format: "dc+sd-jwt",
    title: "Pension Credential",
    aliases: ["pension"],
    claims: [
      {
        path: ["Person", "given_name"],
        mandatory: true,
        displayName: "Given Name",
      },
      {
        path: ["Person", "family_name"],
        mandatory: true,
        displayName: "Family Name",
      },
      {
        path: ["Person", "birth_date"],
        mandatory: true,
        displayName: "Birth Date",
      },
      {
        path: ["Person", "personal_administrative_number"],
        mandatory: true,
        displayName: "Person Identifier",
      },
      {
        path: ["Pension", "typeCode"],
        mandatory: true,
        displayName: "Type Code",
      },
      { path: ["Pension", "typeName"], mandatory: true, displayName: "Type" },
      {
        path: ["Pension", "startDate"],
        mandatory: true,
        displayName: "Start Date",
      },
      { path: ["Pension", "endDate"], displayName: "End Date" },
      { path: ["Pension", "provisional"], displayName: "Provisional" },
    ],
  };
}

// The credential definition declares which pension claims Authbound may put in
// wallet offers. The get-or-create wrapper is demo setup convenience; real
// services usually create definitions during onboarding/deployment and issue
// credentials against the stored definition ID.
function isCredentialDefinitionNotFound(error: unknown): boolean {
  return (
    error instanceof AuthboundClientError &&
    error.code === "credential_definition_not_found"
  );
}

function normalizeClaims(claims: CreateCredentialDefinitionOptions["claims"]) {
  return claims.map((claim) => ({
    name: claim.path.join("."),
    path: claim.path,
    mandatory: claim.mandatory ?? false,
    displayName: claim.displayName ?? claim.path.at(-1) ?? claim.path.join("."),
  }));
}

function walletFacingDefinition(definition: CredentialDefinition) {
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

function expectedWalletFacingDefinition(
  input: CreateCredentialDefinitionOptions
) {
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

function assertMatchingOwnedDraft(
  definition: CredentialDefinition,
  expected: CreateCredentialDefinitionOptions
) {
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

export async function createPensionCredentialDefinition(
  authboundClient: AuthboundClient,
  credentialDefinitionId: string
) {
  const expected = pensionCredentialDefinitionPayload(credentialDefinitionId);

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
    if (!isCredentialDefinitionNotFound(error)) {
      throw error;
    }
    return authboundClient.issuer.credentialDefinitions.create(expected);
  }
}

// The offer payload is just the credential claims. Fixture metadata such as
// JSON-LD context, language tags, and fixture ID stays local to the example.
export function pensionCredentialClaims(
  record: PensionCredentialFixture
): Record<string, unknown> {
  const { Person, Pension } = record.credentialSubject;

  return {
    Person: {
      given_name: Person.given_name,
      family_name: Person.family_name,
      birth_date: Person.birth_date,
      personal_administrative_number: Person.personal_administrative_number,
    },
    Pension: {
      typeCode: Pension.typeCode,
      typeName: Pension.typeName,
      startDate: Pension.startDate,
      ...(Pension.endDate ? { endDate: Pension.endDate } : {}),
      ...(Pension.provisional !== undefined
        ? { provisional: Pension.provisional }
        : {}),
    },
  };
}

export async function createPensionCredentialOffer(
  authboundClient: AuthboundClient,
  options: {
    credentialDefinitionId: string;
    credential: PensionCredentialFixture;
  }
) {
  const definition = await createPensionCredentialDefinition(
    authboundClient,
    options.credentialDefinitionId
  );

  // InTime issuance supplies the credential data when the wallet offer is made.
  return authboundClient.openId4Vc.issuance.createOffer({
    credentialDefinitionId: definition.credentialDefinitionId,
    claims: pensionCredentialClaims(options.credential),
    issuanceMode: "InTime",
  });
}

// The verifier asks an EUDI wallet for a credential matching a policy already
// configured in Authbound.
export async function createPensionVerificationRequest(
  authboundClient: AuthboundClient,
  options: {
    policyId: string;
  }
) {
  return authboundClient.verifications.create({
    policyId: options.policyId,
    provider: "eudi",
  });
}

// The SDK sends status polling without the secret key. Authbound authorizes the
// request with the short-lived client token and the publishable key instead.
export async function getPensionVerificationStatus(
  authboundClient: AuthboundClient,
  options: {
    verificationId: string;
    clientToken: string;
    publishableKey: string;
  }
) {
  return authboundClient.verifications.getStatus(options.verificationId, {
    clientToken: options.clientToken,
    publishableKey: options.publishableKey,
  });
}

// Fetching the signed result is a server-side secret-key operation. The demo
// route only calls this after status polling has observed a verified session.
export async function getPensionVerificationResult(
  authboundClient: AuthboundClient,
  options: {
    verificationId: string;
  }
) {
  return authboundClient.verifications.getResult(options.verificationId);
}
