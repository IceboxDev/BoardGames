import { defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const _boardgamesserver = service("@boardgames/server", {
    source: github("IceboxDev/BoardGames", { branch: "master", checkSuites: false }),
    build: {
      buildCommand: "pnpm --filter @boardgames/server build",
      buildEnvironment: "V3",
      builder: "RAILPACK",
      watchPatterns: [
        "packages/server/**",
        "packages/core/**",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        ".railway/**",
      ],
    },
    start: "node packages/server/dist/index.js",
    preDeploy: "node packages/server/dist/migrations/cli.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 30,
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "boardgamesserver" },
    env: {
      ADMIN_EMAIL: preserve(),
      AI_GATEWAY_API_KEY: preserve(),
      AI_MODEL_FALLBACKS: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      NODE_ENV: preserve(),
      OPENAI_API_KEY: preserve(),
      OPENAI_MODEL: preserve(),
      PORT: preserve(),
      TURSO_AUTH_TOKEN: preserve(),
      TURSO_DATABASE_URL: preserve(),
      VESTAUTH_ALLOWED_AGENT_UIDS: preserve(),
      WEB_ORIGIN: preserve(),
    },
  });

  return project("BoardGameLab", {
    resources: [_boardgamesserver],
  });
});
