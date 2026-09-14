const esbuild = require("esbuild");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

async function build() {
  console.log("[esbuild] Bundling k6 test suite from tests/k6/main.ts...");

  const defineEnv = {
    "process.env.GRAPHQL_API_URL": JSON.stringify(
      process.env.GRAPHQL_API_URL || "https://api.stage.us-1.veritone.com/v3/graphql"
    ),
    "process.env.AUTH_USER_NAME": JSON.stringify(
      process.env.AUTH_USER_NAME || ""
    ),
    "process.env.AUTH_PASSWORD": JSON.stringify(
      process.env.AUTH_PASSWORD || ""
    ),
  };

  try {
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, "tests/k6/main.ts")],
      bundle: true,
      outfile: path.resolve(__dirname, "dist/k6/main.js"),
      format: "esm",
      target: "es2020",
      platform: "neutral",
      external: ["k6", "k6/*", "https://*"],
      define: defineEnv,
      sourcemap: "inline",
    });

    console.log("[esbuild] Successfully compiled k6 bundle to dist/k6/main.js");
  } catch (err) {
    console.error("[esbuild] Build failed:", err);
    process.exit(1);
  }
}

build();
