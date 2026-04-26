import { PrismaClient } from "@prisma/client";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

type AuthResponseBody = {
  accessToken: string;
};

type CartResponseBody = {
  cart: {
    customerId: string;
    expiresAt: string;
    id: string;
    lines: Array<{
      addedAt: string;
      quantity: number;
      sku: string;
      updatedAt: string;
    }>;
    schemaVersion: number;
    updatedAt: string;
    version: number;
  };
};

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await clearAuthState();
  await seedCustomerRole();
});

afterEach(() => {
  vi.resetModules();
});

afterAll(async () => {
  await clearAuthState();
  await prisma.$disconnect();
});

describe.sequential("cart flows", () => {
  it("returns an empty cart for an authenticated user", async () => {
    const app = await loadApp();
    const accessToken = await registerAndReadAccessToken(
      app,
      "cart-empty@example.com"
    );

    const response = await request(app)
      .get("/api/v1/cart")
      .set("authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(readCartBody(response).cart.lines).toEqual([]);
    expect(readCartBody(response).cart.customerId).toBeTruthy();
    expect(readCartBody(response).cart.schemaVersion).toBe(1);
  });

  it("upserts cart lines, refreshes ttl on read, and increments version", async () => {
    const app = await loadApp();
    const accessToken = await registerAndReadAccessToken(
      app,
      "cart-write@example.com"
    );

    const firstWrite = await request(app)
      .put("/api/v1/cart/items/SKU-1")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        quantity: 2
      });

    expect(firstWrite.status).toBe(200);
    expect(readCartBody(firstWrite).cart.version).toBe(2);
    expect(readCartBody(firstWrite).cart.lines).toHaveLength(1);
    expect(readCartBody(firstWrite).cart.lines[0]?.quantity).toBe(2);

    const firstExpiry = readCartBody(firstWrite).cart.expiresAt;

    const secondWrite = await request(app)
      .put("/api/v1/cart/items/SKU-1")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        quantity: 5
      });

    expect(secondWrite.status).toBe(200);
    expect(readCartBody(secondWrite).cart.version).toBe(3);
    expect(readCartBody(secondWrite).cart.lines[0]?.quantity).toBe(5);

    const readResponse = await request(app)
      .get("/api/v1/cart")
      .set("authorization", `Bearer ${accessToken}`);

    expect(readResponse.status).toBe(200);
    expect(readCartBody(readResponse).cart.version).toBe(3);
    expect(
      new Date(readCartBody(readResponse).cart.expiresAt).getTime()
    ).toBeGreaterThanOrEqual(new Date(firstExpiry).getTime());
  });

  it("removes individual lines and clears the cart", async () => {
    const app = await loadApp();
    const accessToken = await registerAndReadAccessToken(
      app,
      "cart-delete@example.com"
    );

    await request(app)
      .put("/api/v1/cart/items/SKU-1")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        quantity: 1
      });

    await request(app)
      .put("/api/v1/cart/items/SKU-2")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        quantity: 3
      });

    const removeResponse = await request(app)
      .delete("/api/v1/cart/items/SKU-1")
      .set("authorization", `Bearer ${accessToken}`);

    expect(removeResponse.status).toBe(200);
    expect(readCartBody(removeResponse).cart.lines).toHaveLength(1);
    expect(readCartBody(removeResponse).cart.lines[0]?.sku).toBe("SKU-2");

    const clearResponse = await request(app)
      .delete("/api/v1/cart")
      .set("authorization", `Bearer ${accessToken}`);

    expect(clearResponse.status).toBe(200);
    expect(readCartBody(clearResponse).cart.lines).toEqual([]);
  });

  it("rejects unauthenticated access and invalid quantities", async () => {
    const app = await loadApp();

    const unauthenticatedResponse = await request(app).get("/api/v1/cart");
    expect(unauthenticatedResponse.status).toBe(401);

    const accessToken = await registerAndReadAccessToken(
      app,
      "cart-invalid@example.com"
    );

    const invalidQuantityResponse = await request(app)
      .put("/api/v1/cart/items/SKU-1")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        quantity: 0
      });

    expect(invalidQuantityResponse.status).toBe(400);
  });
});

const loadApp = async () => {
  const [
    { createApp },
    { RuntimeState },
    { CartService },
    { InMemoryCartRepository }
  ] = await Promise.all([
    import("../../src/app"),
    import("../../src/shared/runtime/runtime-state"),
    import("../../src/modules/cart/application/services/cart.service"),
    import("../../src/modules/cart/infrastructure/repositories/in-memory-cart.repository")
  ]);

  const cartService = new CartService(new InMemoryCartRepository());

  return createApp(new RuntimeState(), {
    cartService
  });
};

const registerAndReadAccessToken = async (
  app: Parameters<typeof request>[0],
  email: string
) => {
  const registerResponse = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "Password123!"
    });

  expect(registerResponse.status).toBe(201);

  return readAuthBody(registerResponse).accessToken;
};

const clearAuthState = async () => {
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.user.deleteMany()
  ]);
};

const seedCustomerRole = async () => {
  await prisma.role.upsert({
    create: {
      name: "CUSTOMER"
    },
    update: {},
    where: {
      name: "CUSTOMER"
    }
  });
};

const readAuthBody = (response: request.Response) =>
  response.body as AuthResponseBody;

const readCartBody = (response: request.Response) =>
  response.body as CartResponseBody;
