import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HIGHLIGHT_PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const REPO_ROOT = path.resolve(HIGHLIGHT_PACKAGE_ROOT, "../..");
const HIGHLIGHT_DIST_DIR = path.join(HIGHLIGHT_PACKAGE_ROOT, "dist");

function withHighlightDistHidden<T>(run: () => T): T {
  const backupDir = `${HIGHLIGHT_DIST_DIR}.workspace-source-exports-backup`;
  const hadDist = existsSync(HIGHLIGHT_DIST_DIR);

  if (hadDist) {
    renameSync(HIGHLIGHT_DIST_DIR, backupDir);
  }

  try {
    return run();
  } finally {
    if (hadDist && existsSync(backupDir)) {
      renameSync(backupDir, HIGHLIGHT_DIST_DIR);
    }
  }
}

describe("highlight workspace source exports", () => {
  it("resolves root imports in source mode without prebuilt dist artifacts", () => {
    const stdout = withHighlightDistHidden(() =>
      execFileSync(
        process.execPath,
        [
          "--conditions=source",
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          'import("@getpaseo/highlight").then((mod) => console.log(typeof mod.highlightCode))',
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
