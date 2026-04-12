import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readlink: vi.fn(async (path: string) => {
    if (path === "/proc/1831379/cwd") {
      return "/workspace/repo-b";
    }
    throw new Error(`Unexpected readlink call: ${path}`);
  }),
}));

import { CodexProcessBridgeService } from "./codex-process-bridge-service.js";

function createLogger() {
  const logger = {
    child: vi.fn(() => logger),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

const activeServices: CodexProcessBridgeService[] = [];

function createService(options?: { missingScanGrace?: number }) {
  const state = {
    psOutput:
      "1831372 621663 pts/14 node /usr/local/bin/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941\n1831379 1831372 pts/14 /opt/codex/codex resume 019d6145-173e-74a0-88bc-e34f12bd3941\n",
  };
  const liveAgentIds = new Set<string>();
  const runner = {
    execFile: vi.fn(async (file: string, args: string[]) => {
      if (file === "ps" && args.join(" ") === "-eo pid=,ppid=,tty=,args=") {
        return state.psOutput;
      }
      if (file === "ps" && args[0] === "-p") {
        return state.psOutput.includes(`${args[1]} `) ? String(args[1]) : "";
      }
      if (file === "python3") {
        return "";
      }
      if (file === "tail") {
        return "existing output";
      }
      throw new Error(`Unexpected execFile call: ${file} ${args.join(" ")}`);
    }),
  };

  const adoptSession = vi.fn(async (_session, _config, agentId: string) => {
    liveAgentIds.add(agentId);
    return { id: agentId };
  });
  const closeAgent = vi.fn(async (agentId: string) => {
    liveAgentIds.delete(agentId);
  });
  const getAgent = vi.fn((agentId: string) => (liveAgentIds.has(agentId) ? { id: agentId } : null));

  const service = new CodexProcessBridgeService({
    logger: createLogger() as any,
    paseoHome: "/tmp/paseo-test",
    agentManager: {
      adoptSession,
      closeAgent,
      getAgent,
    } as any,
    projectRegistry: { upsert: vi.fn(async () => {}) } as any,
    workspaceRegistry: { upsert: vi.fn(async () => {}) } as any,
    runner: runner as any,
    scanIntervalMs: 60_000,
    missingScanGrace: options?.missingScanGrace ?? 2,
  });
  activeServices.push(service);

  return { service, state, adoptSession, closeAgent };
}

afterEach(async () => {
  await Promise.all(activeServices.splice(0).map((service) => service.stop()));
});

describe("CodexProcessBridgeService", () => {
  it("adopts live tty-backed codex processes into the agent manager", async () => {
    const { service, adoptSession } = createService();

    await service.syncNow();

    expect(adoptSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "codex",
        cwd: "/workspace/repo-b",
        title: "repo-b [pts/14]",
      }),
      expect.any(String),
      expect.objectContaining({
        labels: {
          source: "external",
          bridge: "codex_process",
          tty: "pts/14",
        },
      }),
    );
  });

  it("closes tracked sessions once the process disappears for long enough", async () => {
    const { service, state, adoptSession, closeAgent } = createService({ missingScanGrace: 1 });

    await service.syncNow();
    const adoptedAgentId = adoptSession.mock.calls[0]?.[2];

    state.psOutput = "";
    await service.syncNow();

    expect(closeAgent).toHaveBeenCalledWith(adoptedAgentId);
  });
});
