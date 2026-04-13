import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PACKAGE_JSON_PATH = path.resolve(THIS_DIR, "../../package.json");

type PackageJson = {
  scripts?: Record<string, string>;
};

function readServerPackageJson(): PackageJson {
  return JSON.parse(readFileSync(SERVER_PACKAGE_JSON_PATH, "utf8")) as PackageJson;
}

describe("server workspace source dev scripts", () => {
  it("enables source resolution for source-mode dev entrypoints", () => {
    const scripts = readServerPackageJson().scripts ?? {};

    expect(scripts.dev).toContain("NODE_OPTIONS=--conditions=source");
    expect(scripts["dev:tsx"]).toContain("NODE_OPTIONS=--conditions=source");
  });
});
