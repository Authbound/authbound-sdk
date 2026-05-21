import {
  AuthboundClient,
  AuthboundClientError,
  type CreateCredentialDefinitionOptions,
  type CreateOpenId4VcIssuanceOfferOptions,
  type CreateVerificationOptions,
  type CredentialDefinition,
  type OpenId4VcIssuanceOffer,
  type SignedVerificationResult,
  type Verification,
} from '@authbound/server';

import type { PensionClaims } from './credential-catalog.ts';

export const PENSION_CREDENTIAL_DEFINITION_ID = 'pension-credential';
export const PENSION_VCT = 'urn:vc:authbound:pension:1.0';
export const PENSION_VERIFICATION_POLICY_ID = 'pol_authbound_pension_v1';

export type PensionIssuanceSession = OpenId4VcIssuanceOffer & {
  credentialSessionId: string;
  credentialOfferUri: string;
};

export type PensionVerificationSession = Verification & {
  verificationId: string;
  authorizationRequestUrl?: string;
};

export function createAuthboundClient(): AuthboundClient {
  const apiKey = process.env.AUTHBOUND_SECRET_KEY;
  if (!apiKey) {
    throw new Error('AUTHBOUND_SECRET_KEY is required');
  }

  return new AuthboundClient({
    apiKey,
    apiUrl: process.env.AUTHBOUND_API_URL,
    debug: process.env.AUTHBOUND_DEBUG === 'true',
  });
}

export function requirePublishableKey(): string {
  const publishableKey =
    process.env.AUTHBOUND_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_AUTHBOUND_PK ??
    process.env.AUTHBOUND_PK;
  if (!publishableKey) {
    throw new Error(
      'AUTHBOUND_PUBLISHABLE_KEY (or NEXT_PUBLIC_AUTHBOUND_PK) is required for verification status polling'
    );
  }
  return publishableKey;
}

function pensionCredentialDefinition(
  credentialDefinitionId = PENSION_CREDENTIAL_DEFINITION_ID
): CreateCredentialDefinitionOptions {
  return {
    credentialDefinitionId,
    vct: PENSION_VCT,
    format: 'dc+sd-jwt',
    title: 'Pension Credential',
    aliases: ['pension', 'elakela'],
    claims: [
      { path: ['Person', 'given_name'], mandatory: true, displayName: 'Given Name' },
      { path: ['Person', 'family_name'], mandatory: true, displayName: 'Family Name' },
      { path: ['Person', 'birth_date'], mandatory: true, displayName: 'Birth Date' },
      {
        path: ['Person', 'personal_administrative_number'],
        mandatory: true,
        displayName: 'Person Identifier',
      },
      { path: ['Pension', 'typeCode'], mandatory: true, displayName: 'Type Code' },
      { path: ['Pension', 'typeName'], mandatory: true, displayName: 'Pension Type' },
      { path: ['Pension', 'startDate'], mandatory: true, displayName: 'Start Date' },
      { path: ['Pension', 'endDate'], displayName: 'End Date' },
      { path: ['Pension', 'provisional'], displayName: 'Provisional' },
    ],
    rendering: {
      backgroundColor: '#003580',
      textColor: '#ffffff',
    },
    metadata: {
      demo: 'elakela',
      source: 'issuer-agent-pension',
    },
  };
}

function isCredentialDefinitionNotFound(error: unknown): boolean {
  return error instanceof AuthboundClientError && error.code === 'credential_definition_not_found';
}

export async function createPensionCredentialDefinition(
  client: AuthboundClient
): Promise<CredentialDefinition> {
  try {
    return await client.issuer.credentialDefinitions.get(PENSION_CREDENTIAL_DEFINITION_ID);
  } catch (error) {
    if (!isCredentialDefinitionNotFound(error)) {
      throw error;
    }
  }

  return client.issuer.credentialDefinitions.create(pensionCredentialDefinition());
}

function toIssuanceSession(offer: OpenId4VcIssuanceOffer): PensionIssuanceSession {
  return {
    ...offer,
    credentialSessionId: offer.id,
    credentialOfferUri: offer.offerUri,
  };
}

export async function createPensionCredentialOffer(
  client: AuthboundClient,
  claims: PensionClaims
): Promise<PensionIssuanceSession> {
  const definition = await createPensionCredentialDefinition(client);
  const request: CreateOpenId4VcIssuanceOfferOptions = {
    credentialDefinitionId: definition.credentialDefinitionId,
    claims,
    issuanceMode: 'InTime',
    metadata: {
      credentialDefinitionId: definition.credentialDefinitionId,
      demo: 'elakela',
    },
  };

  const offer = await client.openId4Vc.issuance.createOffer(request);
  return toIssuanceSession(offer);
}

function toVerificationSession(verification: Verification): PensionVerificationSession {
  return {
    ...verification,
    verificationId: verification.id,
    authorizationRequestUrl: verification.clientAction?.data,
  };
}

export async function createPensionVerificationRequest(
  client: AuthboundClient
): Promise<PensionVerificationSession> {
  const options: CreateVerificationOptions = {
    policyId: PENSION_VERIFICATION_POLICY_ID,
    provider: 'eudi',
    metadata: {
      demo: 'elakela',
      flow: 'verify',
    },
  };

  const verification = await client.verifications.create(options);
  return toVerificationSession(verification);
}

export async function getPensionVerificationStatus(
  client: AuthboundClient,
  verificationId: string,
  clientToken: string
) {
  return client.verifications.getStatus(verificationId, {
    clientToken,
    publishableKey: requirePublishableKey(),
  });
}

export async function getPensionVerificationResult(
  client: AuthboundClient,
  verificationId: string
): Promise<SignedVerificationResult> {
  return client.verifications.getResult(verificationId);
}
