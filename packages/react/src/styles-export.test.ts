import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readManifest() {
  const manifest = await readFile(join(packageDir, "package.json"), "utf8");

  return JSON.parse(manifest) as {
    exports?: Record<string, unknown>;
    files?: string[];
  };
}

describe("@authbound/react stylesheet export", () => {
  test("keeps the CSS entrypoint available at the package root", async () => {
    const manifest = await readManifest();
    const stylesheet = await readFile(join(packageDir, "styles.css"), "utf8");

    expect(manifest.exports?.["./styles.css"]).toBe("./styles.css");
    expect(manifest.files).toContain("styles.css");
    expect(stylesheet).toContain("--ab-color-primary");
  });
});
