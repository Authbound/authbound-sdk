import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
  SignJWT,
} from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaimsUnavailableError, verifyClaimsDigest } from "./claims-digest";
import { AuthboundClient } from "./client";
import {
  ResultTokenVerificationError,
  type VerifiedResultToken,
  verifyResultToken,
} from "./result-token";

type ClaimsDigestVector = {
  name: string;
  claims: Record<string, unknown>;
  salt: string;
  expected_sha256: string;
};

const { vectors } = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/claims-digest-vectors.json", import.meta.url),
    "utf8"
  )
) as { vectors: ClaimsDigestVector[] };

const ISSUER = "https://edge.authbound.test";
const VERIFICATION_ID = "vrf_123";

let signingKey: KeyLike;
let jwks: { keys: JWK[] };
let otherKey: KeyLike;
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  const signing = await generateKeyPair("ES256");
  signingKey = signing.privateKey;
  jwks = {
    keys: [
      {
        ...(await exportJWK(signing.publicKey)),
        kid: "result-1",
        alg: "ES256",
      },
    ],
  };
  otherKey = (await generateKeyPair("ES256")).privateKey;
  jwksServer = createServer((request, response) => {
    response.writeHead(request.url === "/v1/jwks" ? 200 : 404, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) =>
    jwksServer.listen(0, "127.0.0.1", resolve)
  );
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}`;
});

afterAll(
  () => new Promise<void>((resolve) => jwksServer.close(() => resolve()))
);

function resultToken(
  claimsSha256: string | null,
  overrides: {
    key?: KeyLike;
    kid?: string;
    sub?: string;
    exp?: number;
    iss?: string;
  } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ status: "verified", claims_sha256: claimsSha256 })
    .setProtectedHeader({ alg: "ES256", kid: overrides.kid ?? "result-1" })
    .setIssuer(overrides.iss ?? ISSUER)
    .setSubject(overrides.sub ?? VERIFICATION_ID)
    .setAudience("prj_123")
    .setIssuedAt(now - 60)
    .setExpirationTime(overrides.exp ?? now + 3600)
    .sign(overrides.key ?? signingKey);
}

function verify(token: string, options: { audience?: string } = {}) {
  return verifyResultToken(token, {
    keys: createLocalJWKSet(jwks),
    issuer: ISSUER,
    verificationId: VERIFICATION_ID,
    ...options,
  });
}

describe("verifyResultToken", () => {
  it("accepts a token signed by a published key for this verification", async () => {
    const verified = await verify(await resultToken("a".repeat(64)), {
      audience: "prj_123",
    });
    expect(verified.payload).toMatchObject({
      iss: ISSUER,
      sub: VERIFICATION_ID,
      status: "verified",
      claims_sha256: "a".repeat(64),
    });
  });

  // Keys exist only after beforeAll, so each case builds its overrides lazily.
  it.each([
    ["a forged signature", () => ({ key: otherKey }), "invalid_signature"],
    [
      "a key from another installation",
      () => ({ key: otherKey, kid: "other-installation" }),
      "unknown_key",
    ],
    ["another verification", () => ({ sub: "vrf_other" }), "wrong_subject"],
    [
      "an expired token",
      () => ({ exp: Math.floor(Date.now() / 1000) - 60 }),
      "expired",
    ],
    [
      "another issuer",
      () => ({ iss: "https://other.authbound.test" }),
      "wrong_issuer",
    ],
  ])("rejects %s with a reason", async (_case, overrides, reason) => {
    const token = await resultToken("a".repeat(64), overrides());
    const error = await verify(token).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResultTokenVerificationError);
    expect(error).toMatchObject({ code: "RESULT_TOKEN_INVALID", reason });
  });

  it("names the expected and actual values in claim failures", async () => {
    await expect(
      verify(await resultToken("a".repeat(64), { sub: "vrf_other" }))
    ).rejects.toThrow(/"vrf_other", expected "vrf_123"/);
    await expect(
      verify(
        await resultToken("a".repeat(64), {
          iss: "https://other.authbound.test",
        })
      )
    ).rejects.toThrow(/resultIssuer/);
    await expect(
      verify(
        await resultToken("a".repeat(64), {
          key: otherKey,
          kid: "other-installation",
        })
      )
    ).rejects.toThrow(/another Authbound host/);
  });

  it("rejects a token for another project when the audience is checked", async () => {
    await expect(
      verify(await resultToken("a".repeat(64)), { audience: "prj_other" })
    ).rejects.toMatchObject({ reason: "wrong_audience" });
  });

  it("rejects a value that is not a JWT as malformed", async () => {
    await expect(verify("not-a-jwt")).rejects.toMatchObject({
      reason: "malformed",
    });
  });

  // Plain JavaScript callers can leave out a required option; without the
  // check jose would skip the `sub` comparison and accept any verification.
  it("refuses to verify without a verificationId", async () => {
    const token = await resultToken("a".repeat(64), { sub: "vrf_any" });
    const options = {
      keys: createLocalJWKSet(jwks),
      issuer: ISSUER,
    } as unknown as Parameters<typeof verifyResultToken>[1];

    await expect(verifyResultToken(token, options)).rejects.toThrow(
      /verificationId/
    );
    await expect(
      verifyResultToken(token, { ...options, verificationId: "" })
    ).rejects.toThrow(TypeError);
  });

  it("refuses an empty audience instead of skipping the check", async () => {
    await expect(
      verify(await resultToken("a".repeat(64)), { audience: "" })
    ).rejects.toThrow(TypeError);
  });

  // A caller's own jose (here its CJS build) throws instances of other classes.
  it("names the reason when the keys come from another jose copy", async () => {
    const cjsJose = createRequire(import.meta.url)(
      "jose"
    ) as typeof import("jose");
    const keys = cjsJose.createLocalJWKSet(jwks);
    const options = { keys, issuer: ISSUER, verificationId: VERIFICATION_ID };

    await expect(
      verifyResultToken(
        await resultToken(null, { key: otherKey, kid: "other-installation" }),
        options
      )
    ).rejects.toMatchObject({ reason: "unknown_key" });
    await expect(
      verifyResultToken(await resultToken(null, { key: otherKey }), options)
    ).rejects.toMatchObject({ reason: "invalid_signature" });
  });

  it("reports unreachable keys as keys_unavailable", async () => {
    await expect(
      verifyResultToken(await resultToken(null), {
        keys: async () => {
          throw new TypeError("fetch failed");
        },
        issuer: ISSUER,
        verificationId: VERIFICATION_ID,
      })
    ).rejects.toMatchObject({ reason: "keys_unavailable" });
  });

  it("fetches the keys from the client's /v1/jwks", async () => {
    const client = new AuthboundClient({
      apiKey: `sk_test_${"x".repeat(32)}`,
      apiUrl: jwksUrl,
      resultIssuer: ISSUER,
    });
    const token = await resultToken(null);

    await expect(
      client.verifications.verifyResultToken(token, {
        verificationId: VERIFICATION_ID,
      })
    ).resolves.toMatchObject({ payload: { claims_sha256: null } });
    await expect(
      client.verifications.verifyResultToken(
        await resultToken(null, { key: otherKey }),
        { verificationId: VERIFICATION_ID }
      )
    ).rejects.toBeInstanceOf(ResultTokenVerificationError);
    await expect(
      client.verifications.verifyResultToken(
        token,
        {} as unknown as { verificationId: string }
      )
    ).rejects.toThrow(/verificationId/);
  });
});

describe("verifyClaimsDigest", () => {
  it("verifyClaimsDigest matches the shared vectors", async () => {
    expect(vectors.length).toBeGreaterThan(0);
    for (const vector of vectors) {
      const token = await verify(await resultToken(vector.expected_sha256));
      await expect(
        verifyClaimsDigest(vector.claims, vector.salt, token),
        vector.name
      ).resolves.toBe(true);
    }
  });

  it("rejects claims, a salt or a token digest that differ from the vector", async () => {
    const [vector] = vectors;
    if (!vector) {
      throw new Error("missing claims digest vector");
    }
    const token = await verify(await resultToken(vector.expected_sha256));

    await expect(
      verifyClaimsDigest({ ...vector.claims, extra: true }, vector.salt, token)
    ).resolves.toBe(false);
    await expect(
      verifyClaimsDigest(vector.claims, `${vector.salt}x`, token)
    ).resolves.toBe(false);
    await expect(
      verifyClaimsDigest(
        vector.claims,
        vector.salt,
        await verify(await resultToken(null))
      )
    ).resolves.toBe(false);
  });

  it("names the claims status when the claims are no longer returned", async () => {
    const withDigest = await verify(await resultToken("a".repeat(64)));
    const error = await verifyClaimsDigest(
      undefined,
      undefined,
      withDigest
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ClaimsUnavailableError);
    expect(error).toMatchObject({
      code: "CLAIMS_UNAVAILABLE",
      claimsStatus: "expired",
    });

    await expect(
      verifyClaimsDigest(
        undefined,
        undefined,
        await verify(await resultToken(null))
      )
    ).rejects.toMatchObject({ claimsStatus: "none" });
  });

  it("refuses a token that verifyResultToken did not return", async () => {
    const [vector] = vectors;
    if (!vector) {
      throw new Error("missing claims digest vector");
    }
    const decodedOnly = {
      payload: { claims_sha256: vector.expected_sha256 },
    } as unknown as VerifiedResultToken;

    await expect(
      verifyClaimsDigest(vector.claims, vector.salt, decodedOnly)
    ).rejects.toThrow(TypeError);
  });

  it("rejects values that have no RFC 8785 representation", async () => {
    const token = await verify(await resultToken("0".repeat(64)));
    for (const claims of [
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: "\uD800" },
      { value: undefined },
    ]) {
      await expect(verifyClaimsDigest(claims, "salt", token)).rejects.toThrow(
        TypeError
      );
    }
  });
});
