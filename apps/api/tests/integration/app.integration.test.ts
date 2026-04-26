import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

type EnvOverrideMap = Record<string, string>;
type ErrorBody = {
  error?: {
    code?: string;
  };
  status?: string;
};

const envKeys = [
  "AUTH_RATE_LIMIT_MAX_REQUESTS",
  "CART_RATE_LIMIT_MAX_REQUESTS",
  "RATE_LIMIT_MAX_REQUESTS",
  "RATE_LIMIT_WINDOW_MS"
] as const;

afterEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }

  vi.resetModules();
});

describe("app middleware", () => {
  it("serves liveness and readiness probes", async () => {
    const app = await loadApp();

    const livezResponse = await request(app).get("/api/v1/livez");
    expect(livezResponse.status).toBe(200);
    expect(readBody(livezResponse).status).toBe("ok");

    const readyzResponse = await request(app).get("/api/v1/readyz");
    expect(readyzResponse.status).toBe(503);
    expect(readBody(readyzResponse).status).toBe("not_ready");
  });

  it("allows bodyless post requests without a JSON content-type", async () => {
    const app = await loadApp();

    const response = await request(app).post("/api/v1/auth/logout");
    expect(response.status).toBe(204);
  });

  it("rejects non-json payloads for body-bearing requests", async () => {
    const app = await loadApp();

    const response = await request(app)
      .post("/api/v1/unknown")
      .set("content-type", "text/plain")
      .send("not-json");

    expect(response.status).toBe(415);
    expect(readBody(response).error?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("enforces the global api rate limit", async () => {
    const app = await loadApp({
      RATE_LIMIT_MAX_REQUESTS: "2",
      RATE_LIMIT_WINDOW_MS: "60000"
    });

    const firstResponse = await request(app).get("/api/v1/unknown");
    const secondResponse = await request(app).get("/api/v1/unknown");
    const thirdResponse = await request(app).get("/api/v1/unknown");

    expect(firstResponse.status).toBe(404);
    expect(secondResponse.status).toBe(404);
    expect(thirdResponse.status).toBe(429);
    expect(readBody(thirdResponse).error?.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("skips global rate limiting for system health routes", async () => {
    const app = await loadApp({
      RATE_LIMIT_MAX_REQUESTS: "1",
      RATE_LIMIT_WINDOW_MS: "60000"
    });

    const responses = await Promise.all([
      request(app).get("/api/v1/livez"),
      request(app).get("/api/v1/livez"),
      request(app).get("/api/v1/livez")
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200
    ]);
  });

  it("enforces the auth rate limit independently", async () => {
    const app = await loadApp({
      AUTH_RATE_LIMIT_MAX_REQUESTS: "2",
      RATE_LIMIT_MAX_REQUESTS: "100",
      RATE_LIMIT_WINDOW_MS: "60000"
    });

    const firstResponse = await request(app).get("/api/v1/auth/me");
    const secondResponse = await request(app).get("/api/v1/auth/me");
    const thirdResponse = await request(app).get("/api/v1/auth/me");

    expect(firstResponse.status).toBe(401);
    expect(secondResponse.status).toBe(401);
    expect(thirdResponse.status).toBe(429);
    expect(readBody(thirdResponse).error?.code).toBe(
      "AUTH_RATE_LIMIT_EXCEEDED"
    );
  });

  it("enforces the cart rate limit independently", async () => {
    const app = await loadApp({
      CART_RATE_LIMIT_MAX_REQUESTS: "2",
      RATE_LIMIT_MAX_REQUESTS: "100",
      RATE_LIMIT_WINDOW_MS: "60000"
    });

    const firstResponse = await request(app).get("/api/v1/cart");
    const secondResponse = await request(app).get("/api/v1/cart");
    const thirdResponse = await request(app).get("/api/v1/cart");

    expect(firstResponse.status).toBe(401);
    expect(secondResponse.status).toBe(401);
    expect(thirdResponse.status).toBe(429);
    expect(readBody(thirdResponse).error?.code).toBe(
      "CART_RATE_LIMIT_EXCEEDED"
    );
  });
});

const loadApp = async (overrides: EnvOverrideMap = {}) => {
  applyEnvOverrides(overrides);
  vi.resetModules();

  const [{ createApp }, { RuntimeState }] = await Promise.all([
    import("../../src/app"),
    import("../../src/shared/runtime/runtime-state")
  ]);

  return createApp(new RuntimeState());
};

const applyEnvOverrides = (overrides: EnvOverrideMap) => {
  for (const key of envKeys) {
    delete process.env[key];
  }

  Object.entries(overrides).forEach(([key, value]) => {
    process.env[key] = value;
  });
};

const readBody = (response: request.Response) => response.body as ErrorBody;
