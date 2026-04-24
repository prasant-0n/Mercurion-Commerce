import { spawnSync } from "node:child_process";

const defaultDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/ecommerce_platform?schema=public";

const sharedEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    defaultDatabaseUrl
};

runCommand("npx", [
  "prisma",
  "migrate",
  "deploy",
  "--schema",
  "prisma/schema.prisma"
]);
runCommand("npx", ["vitest", "run", "tests/integration"]);

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    env: sharedEnv,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
