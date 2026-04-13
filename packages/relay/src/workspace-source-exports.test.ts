import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const RELAY_PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const REPO_ROOT = path.resolve(RELAY_PACKAGE_ROOT, "../..");
const RELAY_DIST_DIR = path.join(RELAY_PACKAGE_ROOT, "dist");

function withRelayDistHidden<T>(run: () => T): T {
  const backupDir = `${RELAY_DIST_DIR}.workspace-source-exports-backup`;
  const hadDist = existsSync(RELAY_DIST_DIR);

  if (hadDist) {
    renameSync(RELAY_DIST_DIR, backupDir);
  }

  try {
    return run();
  } finally {
    if (hadDist && existsSync(backupDir)) {
      renameSync(backupDir, RELAY_DIST_DIR);
    }
  }
}

describe("relay workspace source exports", () => {
  it("resolves e2ee imports in source mode without prebuilt dist artifacts", () => {
    const stdout = withRelayDistHidden(() =>
      execFileSync(
        process.execPath,
        [
          "--conditions=source",
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          'import("@getpaseo/relay/e2ee").then((mod) => console.log(typeof mod.createClientChannel))',
        ],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
        },
      ),
    );

    expect(stdout.trim()).toBe("function");
  });
});
