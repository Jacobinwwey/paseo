import { afterEach, describe, expect, it, vi } from "vitest";

import { TmuxCodexBridgeService } from "./tmux-codex-bridge-service.js";

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

const activeServices: TmuxCodexBridgeService[] = [];

function createRunnerState() {
  return {
    listPanesOutput: "%42\tworkspace-a\t@1\tbash\t1001\t/dev/pts/21\t/workspace/project\n",
    psOutput:
      "1001 1 tmux: server\n1002 1001 node /usr/local/bin/codex resume 019d7f5b-1d2c-76c2-96e9-0a6496559b68\n1003 1002 /opt/codex/codex resume 019d7f5b-1d2c-76c2-96e9-0a6496559b68\n",
  };
}

function createService(options?: { missingScanGrace?: number }) {
  const state = createRunnerState();
  const liveAgentIds = new Set<string>();
  const runner = {
    execFile: vi.fn(async (file: string, args: string[]) => {
      if (file === "tmux" && args[0] === "list-panes") {
        return state.listPanesOutput;
      }
      if (file === "tmux" && args[0] === "capture-pane") {
        return "existing output";
      }
      if (file === "tmux" && args[0] === "send-keys") {
        return "";
      }
      if (file === "ps" && args.join(" ") === "-eo pid=,ppid=,args=") {
        return state.psOutput;
      }
      if (file === "ps" && args[0] === "-p") {
        return String(args[1]);
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

  const service = new TmuxCodexBridgeService({
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

describe("TmuxCodexBridgeService", () => {
  it("adopts live tmux codex panes into the agent manager", async () => {
    const { service, adoptSession } = createService();

    await service.syncNow();

    expect(adoptSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "codex",
        cwd: "/workspace/project",
        title: "project [tmux:%42]",
      }),
      expect.any(String),
      expect.objectContaining({
        labels: {
          source: "tmux",
          bridge: "codex",
          pane: "%42",
        },
      }),
    );
  });

  it("closes tracked sessions once their pane disappears for long enough", async () => {
    const { service, state, adoptSession, closeAgent } = createService({ missingScanGrace: 1 });

    await service.syncNow();
    const adoptedAgentId = adoptSession.mock.calls[0]?.[2];

    state.listPanesOutput = "";
    state.psOutput = "";
    await service.syncNow();

    expect(closeAgent).toHaveBeenCalledWith(adoptedAgentId);
  });
});
