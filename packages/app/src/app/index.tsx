import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useHostRuntimeBootstrapState, useStoreReady } from "@/app/_layout";
import { useHosts } from "@/runtime/host-runtime";
import { buildHostRootRoute } from "@/utils/host-routes";
import { usePreferredHostServerId } from "@/utils/preferred-host";

const WELCOME_ROUTE = "/welcome";

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const bootstrapState = useHostRuntimeBootstrapState();
  const storeReady = useStoreReady();
  const hosts = useHosts();
  const preferredServerId = usePreferredHostServerId(hosts);

  useEffect(() => {
    if (!storeReady) {
      return;
    }
    if (pathname !== "/" && pathname !== "") {
      return;
    }

    const targetRoute = preferredServerId ? buildHostRootRoute(preferredServerId) : WELCOME_ROUTE;
    router.replace(targetRoute);
  }, [pathname, preferredServerId, router, storeReady]);

  return <StartupSplashScreen bootstrapState={bootstrapState} />;
}
