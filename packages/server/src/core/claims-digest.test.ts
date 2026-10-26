import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyClaimsDigest } from "./claims-digest";

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

const signingKey = new TextEncoder().encode("claims-digest-test-key-32-bytes!");

function resultToken(claimsSha256: string | null): Promise<string> {
  return new SignJWT({ claims_sha256: claimsSha256 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("vrf_123")
    .sign(signingKey);
}

describe("verifyClaimsDigest", () => {
  it("verifyClaimsDigest matches the shared vectors", async () => {
    expect(vectors.length).toBeGreaterThan(0);
    for (const vector of vectors) {
      const token = await resultToken(vector.expected_sha256);
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
    const token = await resultToken(vector.expected_sha256);

    await expect(
      verifyClaimsDigest({ ...vector.claims, extra: true }, vector.salt, token)
    ).resolves.toBe(false);
    await expect(
      verifyClaimsDigest(vector.claims, `${vector.salt}x`, token)
    ).resolves.toBe(false);
    await expect(
      verifyClaimsDigest(vector.claims, vector.salt, await resultToken(null))
    ).resolves.toBe(false);
  });

  it("rejects values that have no RFC 8785 representation", async () => {
    const token = await resultToken("0".repeat(64));
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
