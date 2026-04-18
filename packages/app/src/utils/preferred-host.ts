import { useMemo, useSyncExternalStore } from "react";
import { getHostRuntimeStore, type HostRuntimeSnapshot } from "@/runtime/host-runtime";
import type { HostProfile } from "@/types/host-connection";

type PreferredHostSnapshot = Pick<HostRuntimeSnapshot, "connectionStatus" | "lastOnlineAt">;

function readConnectionPriority(snapshot: PreferredHostSnapshot | null | undefined): number {
  switch (snapshot?.connectionStatus) {
    case "online":
      return 3;
    case "connecting":
      return 2;
    case "offline":
      return 1;
    case "error":
    case "idle":
    default:
      return 0;
  }
}

function compareIsoDescending(left: string | null, right: string | null): number {
  if (left && right && left !== right) {
    return right.localeCompare(left);
  }
  if (left) {
    return -1;
  }
  if (right) {
    return 1;
  }
  return 0;
}

function isPreferredHostCandidate(input: {
  candidate: HostProfile;
  candidateSnapshot: PreferredHostSnapshot | null | undefined;
  current: HostProfile;
  currentSnapshot: PreferredHostSnapshot | null | undefined;
}): boolean {
  const candidatePriority = readConnectionPriority(input.candidateSnapshot);
  const currentPriority = readConnectionPriority(input.currentSnapshot);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority;
  }

  const onlineDelta = compareIsoDescending(
    input.candidateSnapshot?.lastOnlineAt ?? null,
    input.currentSnapshot?.lastOnlineAt ?? null,
  );
  if (onlineDelta !== 0) {
    return onlineDelta < 0;
  }

  const updatedDelta = compareIsoDescending(input.candidate.updatedAt, input.current.updatedAt);
  if (updatedDelta !== 0) {
    return updatedDelta < 0;
  }

  return input.candidate.createdAt > input.current.createdAt;
}

export function selectPreferredHost(
  hosts: HostProfile[],
  getSnapshot: (serverId: string) => PreferredHostSnapshot | null | undefined,
): HostProfile | null {
  let preferred: HostProfile | null = null;
  let preferredSnapshot: PreferredHostSnapshot | null | undefined;

  for (const host of hosts) {
    const snapshot = getSnapshot(host.serverId);
    if (
      !preferred ||
      isPreferredHostCandidate({
        candidate: host,
        candidateSnapshot: snapshot,
        current: preferred,
        currentSnapshot: preferredSnapshot,
      })
    ) {
      preferred = host;
      preferredSnapshot = snapshot;
    }
  }

  return preferred;
}

export function selectPreferredHostServerId(
  hosts: HostProfile[],
  getSnapshot: (serverId: string) => PreferredHostSnapshot | null | undefined,
): string | null {
  return selectPreferredHost(hosts, getSnapshot)?.serverId ?? null;
}

export function usePreferredHostServerId(hosts: HostProfile[]): string | null {
  const runtime = getHostRuntimeStore();
  const runtimeVersion = useSyncExternalStore(
    (onStoreChange) => runtime.subscribeAll(onStoreChange),
    () => runtime.getVersion(),
    () => runtime.getVersion(),
  );

  return useMemo(
    () => selectPreferredHostServerId(hosts, (serverId) => runtime.getSnapshot(serverId)),
    [hosts, runtime, runtimeVersion],
  );
}
