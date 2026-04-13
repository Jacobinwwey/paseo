const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const appNodeModulesRoot = path.resolve(projectRoot, "node_modules");
const workspaceNodeModulesRoot = path.resolve(workspaceRoot, "node_modules");
const workspacePackages = [
  "packages/expo-two-way-audio",
  "packages/highlight",
  "packages/server",
  "packages/app",
  "packages/relay",
  "packages/website",
  "packages/desktop",
  "packages/cli",
];
const appSrcRoot = path.resolve(projectRoot, "src");
const serverSrcRoot = path.resolve(projectRoot, "../server/src");
const relaySrcRoot = path.resolve(projectRoot, "../relay/src");
const highlightSrcRoot = path.resolve(projectRoot, "../highlight/src");
const jsToTsSourceRoots = [serverSrcRoot, relaySrcRoot, highlightSrcRoot];
const useProjectScopedMetroRoot = process.env.EXPO_NO_METRO_WORKSPACE_ROOT === "1";
const projectScopedWorkspaceAliases = useProjectScopedMetroRoot
  ? {
      // Windows project-scoped Metro does not reliably resolve npm workspace junctions.
      "@getpaseo/expo-two-way-audio": path.resolve(
        workspaceRoot,
        "packages/expo-two-way-audio/src",
      ),
      "@getpaseo/highlight": path.resolve(workspaceRoot, "packages/highlight/src"),
      "@getpaseo/relay": path.resolve(workspaceRoot, "packages/relay/src"),
    }
  : {};
const customWebPlatform = (process.env.PASEO_WEB_PLATFORM ?? "")
  .trim()
  .replace(/^\./, "")
  .toLowerCase();

const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest ?? resolve;
const escapedAppSrcRoot = appSrcRoot
  .split(path.sep)
  .map((segment) => segment.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"))
  .join("[\\\\/]");
const pathSeparatorPattern = "[\\\\/]";

if (useProjectScopedMetroRoot) {
  config.watchFolders = [
    workspaceNodeModulesRoot,
    ...workspacePackages.map((workspacePackage) => path.resolve(workspaceRoot, workspacePackage)),
  ];
  config.resolver.nodeModulesPaths = [appNodeModulesRoot, workspaceNodeModulesRoot];
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...projectScopedWorkspaceAliases,
  react: path.join(appNodeModulesRoot, "react"),
  "react-dom": path.join(appNodeModulesRoot, "react-dom"),
  "react/jsx-runtime": path.join(appNodeModulesRoot, "react/jsx-runtime"),
  "react/jsx-dev-runtime": path.join(appNodeModulesRoot, "react/jsx-dev-runtime"),
};
config.resolver.blockList = new RegExp(
  `(^${escapedAppSrcRoot}${pathSeparatorPattern}.*\\.(test|spec)\\.(ts|tsx)$|${pathSeparatorPattern}__tests__${pathSeparatorPattern}.*)$`,
);

function isLocalModuleImport(moduleName) {
  return (
    moduleName.startsWith("./") ||
    moduleName.startsWith("../") ||
    moduleName.startsWith("@/") ||
    path.isAbsolute(moduleName)
  );
}

function resolveWithCustomWebOverlay(context, moduleName, platform) {
  const shouldResolveCustomWebVariant =
    platform === "web" &&
    customWebPlatform.length > 0 &&
    customWebPlatform !== "web" &&
    isLocalModuleImport(moduleName);

  if (shouldResolveCustomWebVariant) {
    const overlayContext = {
      ...context,
      // Resolve only "<custom-platform>.<ext>" variants in overlay mode.
      sourceExts: context.sourceExts.map((ext) => `${customWebPlatform}.${ext}`),
      preferNativePlatform: false,
    };

    try {
      return defaultResolveRequest(overlayContext, moduleName, null);
    } catch {
      // Ignore overlay misses and continue with normal web resolution.
    }
  }

  return defaultResolveRequest(context, moduleName, platform);
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath;
  if (origin && moduleName.endsWith(".js") && jsToTsSourceRoots.some((root) => origin.startsWith(root))) {
    const tsModuleName = moduleName.replace(/\.js$/, ".ts");
    const candidatePath = path.resolve(path.dirname(origin), tsModuleName);
    if (fs.existsSync(candidatePath)) {
      return resolveWithCustomWebOverlay(context, tsModuleName, platform);
    }
  }

  return resolveWithCustomWebOverlay(context, moduleName, platform);
};

module.exports = config;
