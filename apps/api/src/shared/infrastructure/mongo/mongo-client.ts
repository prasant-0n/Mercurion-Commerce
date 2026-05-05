import { MongoClient } from "mongodb";

import { env } from "@/config/env";
import { logger } from "@/shared/observability/logger";

type MongoGlobal = typeof globalThis & {
  mongoClient: MongoClient | null;
  mongoConnectPromise: Promise<MongoClient> | null;
};

const mongoGlobal = globalThis as MongoGlobal;
mongoGlobal.mongoClient ??= null;
mongoGlobal.mongoConnectPromise ??= null;

export const ensureMongoClient = async (): Promise<MongoClient> => {
  if (mongoGlobal.mongoClient === null) {
    const client = new MongoClient(env.MONGODB_URL, {
      ignoreUndefined: true
    });

    client.on("error", (error) => {
      logger.error({ error }, "MongoDB client error");
    });

    mongoGlobal.mongoClient = client;
  }

  if (mongoGlobal.mongoConnectPromise === null) {
    mongoGlobal.mongoConnectPromise = mongoGlobal.mongoClient
      .connect()
      .catch((error: unknown) => {
        mongoGlobal.mongoConnectPromise = null;
        throw error;
      });
  }

  return mongoGlobal.mongoConnectPromise;
};

export const getMongoDatabase = async () => {
  const client = await ensureMongoClient();

  return client.db();
};

export const closeMongoClient = async () => {
  if (mongoGlobal.mongoClient === null) {
    return;
  }

  await mongoGlobal.mongoClient.close();
  mongoGlobal.mongoClient = null;
  mongoGlobal.mongoConnectPromise = null;
};
