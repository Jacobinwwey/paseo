import { describe, expect, it } from "vitest";

import {
  discoverCodexProcessDescriptors,
  parseUnixProcessTableWithTty,
  readCodexProcessLogPath,
  sanitizeCodexProcessCapture,
} from "./codex-process-bridge.js";

describe("codex process bridge discovery", () => {
  it("does not mistake codex retry helper commands for codex sessions", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "723659 723648 pts/18 rg -qi usage limit for /tmp/codex-429-retry.cS8GBi.log",
        "1831372 621663 pts/14 node /usr/local/bin/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
        "1831379 1831372 pts/14 /opt/codex/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
      ].join("\n"),
    );

    const descriptors = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async () => "/workspace/repo-b",
    });

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      tty: "/dev/pts/14",
      sessionId: "019d6145-173e-74a0-88bc-e34f12bd3941",
    });
  });

  it("extracts wrapper log path from script ancestor", () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "1827132 668950 pts/18 script -qefc /usr/local/bin/codex resume 019d7f5b-1d2c-76c2-96e9-0a6496559b68 /tmp/codex-429-retry.cS8GBi.log",
        "1827133 1827132 pts/2 node /usr/local/bin/codex resume 019d7f5b-1d2c-76c2-96e9-0a6496559b68",
        "1827143 1827133 pts/2 /opt/codex/codex resume 019d7f5b-1d2c-76c2-96e9-0a6496559b68",
      ].join("\n"),
    );

    const logPath = readCodexProcessLogPath({
      process: processes[2]!,
      processByPid: new Map(processes.map((process) => [process.pid, process])),
    });

    expect(logPath).toBe("/tmp/codex-429-retry.cS8GBi.log");
  });

  it("uses wrapper tty for pseudo-tty codex children launched through script", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "282241 1007934 pts/15 bash /usr/local/bin/codex-root-wrapper",
        "282246 282241 pts/15 script -qefc /usr/local/bin/codex --no-alt-screen /tmp/codex-429-retry.glX6HS.log",
        "282247 282246 pts/23 node /usr/local/bin/codex --no-alt-screen",
        "282262 282247 pts/23 /opt/codex/codex --no-alt-screen",
      ].join("\n"),
    );

    const descriptors = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async () => "/workspace/project",
    });

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      tty: "/dev/pts/15",
      processTty: "/dev/pts/23",
      sessionId: null,
      logPath: "/tmp/codex-429-retry.glX6HS.log",
      cwd: "/workspace/project",
      title: "project [pts/15]",
    });
  });

  it("recovers rollout session id from open files without changing no-resume agent identity", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "1040376 3081867 pts/13 bash /usr/local/bin/codex-root-wrapper",
        "1040380 1040376 pts/13 script -qefc /usr/local/bin/codex /tmp/codex-429-retry.yqPEH7.log",
        "1040381 1040380 pts/8 node /usr/local/bin/codex",
        "1040388 1040381 pts/8 /opt/codex/codex",
      ].join("\n"),
    );

    const withoutRecoveredSession = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async () => "/home/jacob",
    });
    const withRecoveredSession = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async () => "/home/jacob",
      resolveSessionId: async (pid) =>
        pid === 1040388 ? "019d970a-50d2-7100-b25c-60755836d1d1" : null,
    });

    expect(withoutRecoveredSession).toHaveLength(1);
    expect(withRecoveredSession).toHaveLength(1);
    expect(withRecoveredSession[0]?.agentId).toBe(withoutRecoveredSession[0]?.agentId);
    expect(withRecoveredSession[0]).toMatchObject({
      tty: "/dev/pts/13",
      processTty: "/dev/pts/8",
      sessionId: "019d970a-50d2-7100-b25c-60755836d1d1",
      logPath: "/tmp/codex-429-retry.yqPEH7.log",
      title: "jacob [pts/13]",
      persistenceHandle: {
        sessionId: "019d970a-50d2-7100-b25c-60755836d1d1",
        metadata: {
          sessionId: "019d970a-50d2-7100-b25c-60755836d1d1",
        },
      },
    });
  });

  it("discovers codex sessions by tty", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "1831372 621663 pts/14 node /usr/local/bin/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
        "1831379 1831372 pts/14 /opt/codex/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
        "1832000 621663 pts/27 /opt/codex/codex",
      ].join("\n"),
    );

    const descriptors = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async (pid) => (pid === 1832000 ? "/workspace/repo-c" : "/workspace/repo-b"),
    });

    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]).toMatchObject({
      tty: "/dev/pts/14",
      processTty: "/dev/pts/14",
      sessionId: "019d6145-173e-74a0-88bc-e34f12bd3941",
      logPath: null,
      cwd: "/workspace/repo-b",
    });
    expect(descriptors[1]).toMatchObject({
      tty: "/dev/pts/27",
      sessionId: null,
      logPath: null,
      cwd: "/workspace/repo-c",
    });
  });

  it("skips codex processes whose cwd has been deleted", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "2951059 2951058 pts/36 node /usr/local/bin/codex --no-alt-screen",
        "2951072 2951059 pts/36 /opt/codex/codex --no-alt-screen",
      ].join("\n"),
    );

    const descriptors = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async () => "/tmp/paseo-title-e2e.NFS68a (deleted)",
    });

    expect(descriptors).toHaveLength(0);
  });

  it("skips a broken cwd lookup without dropping other codex descriptors", async () => {
    const processes = parseUnixProcessTableWithTty(
      [
        "1831372 621663 pts/14 node /usr/local/bin/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
        "1831379 1831372 pts/14 /opt/codex/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941",
        "2951072 2951059 pts/36 /opt/codex/codex --no-alt-screen",
      ].join("\n"),
    );

    const descriptors = await discoverCodexProcessDescriptors({
      processes,
      resolveCwd: async (pid) => {
        if (pid === 2951072) {
          const error = new Error("cwd disappeared") as Error & { code?: string };
          error.code = "ENOENT";
          throw error;
        }
        return "/workspace/repo-b";
      },
    });

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      tty: "/dev/pts/14",
      cwd: "/workspace/repo-b",
    });
  });

  it("strips ansi escapes from captured codex output", () => {
    const raw = "\u001b[19;27H\u001b[0mhello\r\n\u001b[31mworld\u001b[0m";
    expect(sanitizeCodexProcessCapture(raw)).toBe("hello\nworld");
  });

  it("drops transient codex working-status lines from captured output", () => {
    const raw = [
      "Reply only PASEO_OK_360",
      "Working (2s • esc to interrupt)Working (3s • esc to interrupt)",
      "PASEO_OK_360",
    ].join("\r\n");

    expect(sanitizeCodexProcessCapture(raw)).toBe("Reply only PASEO_OK_360\nPASEO_OK_360");
  });

  it("keeps ordinary lines that merely use the word working", () => {
    const raw = "Working notes stay visible\r\nResult";
    expect(sanitizeCodexProcessCapture(raw)).toBe("Working notes stay visible\nResult");
  });
});
