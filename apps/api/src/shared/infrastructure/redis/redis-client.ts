import { createClient } from "redis";

import { env } from "@/config/env";
import { logger } from "@/shared/observability/logger";

type RedisClientInstance = ReturnType<typeof createClient>;

type RedisGlobal = typeof globalThis & {
  redisClient: RedisClientInstance | null;
  redisConnectPromise: Promise<RedisClientInstance> | null;
};

const redisGlobal = globalThis as RedisGlobal;
redisGlobal.redisClient ??= null;
redisGlobal.redisConnectPromise ??= null;

export const ensureRedisClient = async (): Promise<RedisClientInstance> => {
  const client = getRedisClient();

  if (client.isOpen) {
    return client;
  }

  if (redisGlobal.redisConnectPromise === null) {
    redisGlobal.redisConnectPromise = client
      .connect()
      .then(() => client)
      .finally(() => {
        redisGlobal.redisConnectPromise = null;
      });
  }

  return redisGlobal.redisConnectPromise;
};

export const closeRedisClient = async () => {
  if (redisGlobal.redisClient === null || !redisGlobal.redisClient.isOpen) {
    return;
  }

  await redisGlobal.redisClient.quit();
};

const getRedisClient = (): RedisClientInstance => {
  if (redisGlobal.redisClient === null) {
    const client = createClient({
      url: env.REDIS_URL
    });

    client.on("error", (error) => {
      logger.error({ error }, "Redis client error");
    });

    redisGlobal.redisClient = client;
  }

  return redisGlobal.redisClient;
};
