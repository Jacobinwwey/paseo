const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const configPath = path.resolve(__dirname, "metro.config.cjs");
const originalLoad = Module._load;
const originalFlag = process.env.EXPO_NO_METRO_WORKSPACE_ROOT;

function loadConfig() {
  delete require.cache[configPath];
  return require(configPath);
}

test.afterEach(() => {
  Module._load = originalLoad;
  if (originalFlag === undefined) {
    delete process.env.EXPO_NO_METRO_WORKSPACE_ROOT;
  } else {
    process.env.EXPO_NO_METRO_WORKSPACE_ROOT = originalFlag;
  }
});

test("adds workspace root module resolution when project-scoped Metro is enabled", () => {
  process.env.EXPO_NO_METRO_WORKSPACE_ROOT = "1";

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "expo/metro-config") {
      return {
        getDefaultConfig() {
          return {
            resolver: {},
          };
        },
      };
    }

    if (request === "metro-resolver") {
      return {
        resolve() {
          throw new Error("resolver should not be invoked in this config test");
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const config = loadConfig();
  const projectRoot = path.resolve(__dirname);
  const workspaceRoot = path.resolve(projectRoot, "../..");

  assert.ok(Array.isArray(config.watchFolders));
  assert.ok(config.watchFolders.includes(path.resolve(workspaceRoot, "node_modules")));
  assert.ok(
    config.watchFolders.includes(path.resolve(workspaceRoot, "packages/expo-two-way-audio")),
  );
  assert.deepEqual(config.resolver.nodeModulesPaths, [
    path.resolve(projectRoot, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ]);
  assert.equal(
    config.resolver.extraNodeModules["@getpaseo/expo-two-way-audio"],
    path.resolve(workspaceRoot, "packages/expo-two-way-audio/src"),
  );
  assert.equal(
    config.resolver.extraNodeModules["@getpaseo/highlight"],
    path.resolve(workspaceRoot, "packages/highlight/src"),
  );
  assert.equal(
    config.resolver.extraNodeModules["@getpaseo/relay"],
    path.resolve(workspaceRoot, "packages/relay/src"),
  );
});

test("rewrites highlight source .js imports to .ts when project-scoped Metro is enabled", () => {
  process.env.EXPO_NO_METRO_WORKSPACE_ROOT = "1";

  let resolvedModuleName = null;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "expo/metro-config") {
      return {
        getDefaultConfig() {
          return {
            resolver: {},
          };
        },
      };
    }

    if (request === "metro-resolver") {
      return {
        resolve(context, moduleName) {
          resolvedModuleName = moduleName;
          return { type: "sourceFile", filePath: path.resolve(context.originModulePath) };
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const config = loadConfig();
  const workspaceRoot = path.resolve(__dirname, "../..");

  config.resolver.resolveRequest(
    {
      originModulePath: path.resolve(workspaceRoot, "packages/highlight/src/index.ts"),
      sourceExts: ["ts", "tsx", "js", "jsx"],
      preferNativePlatform: true,
    },
    "./parsers.js",
    "android",
  );

  assert.equal(resolvedModuleName, "./parsers.ts");
});
