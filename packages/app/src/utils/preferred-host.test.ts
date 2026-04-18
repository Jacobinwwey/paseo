import { describe, expect, it } from "vitest";
import type { HostProfile } from "@/types/host-connection";
import { selectPreferredHostServerId } from "./preferred-host";

function makeHost(input: {
  serverId: string;
  updatedAt: string;
  createdAt?: string;
}): HostProfile {
  return {
    serverId: input.serverId,
    label: input.serverId,
    lifecycle: {},
    connections: [],
    preferredConnectionId: null,
    createdAt: input.createdAt ?? input.updatedAt,
    updatedAt: input.updatedAt,
  };
}

describe("selectPreferredHostServerId", () => {
  it("prefers online hosts over stale connecting ones", () => {
    const hosts = [
      makeHost({ serverId: "srv_stale", updatedAt: "2026-04-17T14:00:00.000Z" }),
      makeHost({ serverId: "srv_live", updatedAt: "2026-04-17T14:01:00.000Z" }),
    ];

    const preferred = selectPreferredHostServerId(hosts, (serverId) =>
      serverId === "srv_live"
        ? { connectionStatus: "online", lastOnlineAt: "2026-04-17T14:02:00.000Z" }
        : { connectionStatus: "connecting", lastOnlineAt: null },
    );

    expect(preferred).toBe("srv_live");
  });

  it("prefers most recently online host when multiple are online", () => {
    const hosts = [
      makeHost({ serverId: "srv_old", updatedAt: "2026-04-17T13:00:00.000Z" }),
      makeHost({ serverId: "srv_new", updatedAt: "2026-04-17T13:00:00.000Z" }),
    ];

    const preferred = selectPreferredHostServerId(hosts, (serverId) =>
      serverId === "srv_new"
        ? { connectionStatus: "online", lastOnlineAt: "2026-04-17T14:05:00.000Z" }
        : { connectionStatus: "online", lastOnlineAt: "2026-04-17T14:00:00.000Z" },
    );

    expect(preferred).toBe("srv_new");
  });

  it("falls back to most recently updated host when none are online", () => {
    const hosts = [
      makeHost({ serverId: "srv_old", updatedAt: "2026-04-17T13:00:00.000Z" }),
      makeHost({ serverId: "srv_new", updatedAt: "2026-04-17T14:00:00.000Z" }),
    ];

    const preferred = selectPreferredHostServerId(hosts, () => ({
      connectionStatus: "idle",
      lastOnlineAt: null,
    }));

    expect(preferred).toBe("srv_new");
  });
});
