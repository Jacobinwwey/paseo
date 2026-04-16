import { buildHostSettingsRoute } from "@/utils/host-routes";

export const LEGACY_SETTINGS_FALLBACK_ROUTE = "/welcome" as const;

export function resolveLegacySettingsTargetRoute(
  serverId: string | null | undefined,
): ReturnType<typeof buildHostSettingsRoute> | typeof LEGACY_SETTINGS_FALLBACK_ROUTE {
  const normalizedServerId = typeof serverId === "string" ? serverId.trim() : "";
  if (!normalizedServerId) {
    return LEGACY_SETTINGS_FALLBACK_ROUTE;
  }
  return buildHostSettingsRoute(normalizedServerId);
}
