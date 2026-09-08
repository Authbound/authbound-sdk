import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthboundClientError } from "@authbound/server";
import { ensureEmployeeCredentialDefinition } from "./credential-definition.mjs";

function mockFunction(implementation) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return implementation(...args);
  };
  fn.calls = calls;
  return fn;
}

function employeeDefinition(overrides = {}) {
  return {
    object: "issuer.credential_definition",
    id: "employee_badge_v1",
    credentialDefinitionId: "employee_badge_v1",
    vct: "urn:vc:authbound:employee-badge:1.0",
    format: "dc+sd-jwt",
    title: "Employee Badge",
    aliases: ["employee_badge"],
    claims: [
      {
        name: "Employee.given_name",
        path: ["Employee", "given_name"],
        mandatory: true,
        displayName: "given_name",
      },
      {
        name: "Employee.family_name",
        path: ["Employee", "family_name"],
        mandatory: true,
        displayName: "family_name",
      },
      {
        name: "Employee.employee_number",
        path: ["Employee", "employee_number"],
        mandatory: true,
        displayName: "employee_number",
      },
      {
        name: "Employee.department",
        path: ["Employee", "department"],
        mandatory: true,
        displayName: "department",
      },
    ],
    lifecycleStatus: "draft",
    metadata: { operatorNote: "management-only metadata is not compared" },
    ...overrides,
  };
}

function createClient(definition, publish) {
  return {
    issuer: {
      credentialDefinitions: {
        get: async () => definition,
        publish,
      },
    },
  };
}

describe("issuer-agent-basic credential-definition recovery", () => {
  it("uses one stable create idempotency key across concurrent first use", async () => {
    const create = mockFunction(async (options) =>
      employeeDefinition({
        credentialDefinitionId: options.credentialDefinitionId,
        lifecycleStatus: "published",
      })
    );
    const client = {
      issuer: {
        credentialDefinitions: {
          get: async () => {
            throw new AuthboundClientError(
              "Credential definition not found",
              "credential_definition_not_found",
              404
            );
          },
          create,
        },
      },
    };

    await Promise.all([
      ensureEmployeeCredentialDefinition(client, "employee_badge_v1"),
      ensureEmployeeCredentialDefinition(client, "employee_badge_v1"),
    ]);

    assert.deepEqual(
      create.calls.map(([options]) => options.idempotencyKey),
      ["create:employee_badge_v1:v1", "create:employee_badge_v1:v1"]
    );
  });

  it("publishes a matching owned employee draft", async () => {
    const publish = mockFunction(async (credentialDefinitionId) => ({
      ...employeeDefinition({ lifecycleStatus: "published" }),
      credentialDefinitionId,
    }));

    await ensureEmployeeCredentialDefinition(
      createClient(employeeDefinition(), publish),
      "employee_badge_v1"
    );

    assert.deepEqual(publish.calls, [
      ["employee_badge_v1", { idempotencyKey: "publish:employee_badge_v1:v1" }],
    ]);
  });

  it("refuses to publish an employee draft with mismatched wallet fields", async () => {
    const publish = mockFunction(async () =>
      employeeDefinition({ lifecycleStatus: "published" })
    );
    const mismatched = employeeDefinition({
      claims: employeeDefinition().claims.map((claim) =>
        claim.name === "Employee.department"
          ? { ...claim, displayName: "Changed department label" }
          : claim
      ),
    });

    await assert.rejects(
      () =>
        ensureEmployeeCredentialDefinition(
          createClient(mismatched, publish),
          "employee_badge_v1"
        ),
      /Inspect the draft and update it before publishing/
    );
    assert.equal(publish.calls.length, 0);
  });
});
