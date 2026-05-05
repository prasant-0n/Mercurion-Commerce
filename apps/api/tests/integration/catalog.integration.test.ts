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

type CatalogProductResponseBody = {
  product: {
    brand: {
      id: string;
    };
    id: string;
    slug: string;
    title: string;
  };
};

type CatalogProductsResponseBody = {
  count: number;
  products: Array<{
    id: string;
    slug: string;
  }>;
};

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await clearAuthState();
  await seedRoles();
});

afterEach(() => {
  vi.resetModules();
});

afterAll(async () => {
  await clearAuthState();
  await prisma.$disconnect();
});

describe.sequential("catalog authoring flows", () => {
  it("requires authentication and catalog permission", async () => {
    const app = await loadApp();

    const unauthenticatedResponse = await request(app)
      .post("/api/v1/catalog/products")
      .send(buildCatalogProductInput());

    expect(unauthenticatedResponse.status).toBe(401);

    const customerToken = await registerAndLogin(app, {
      email: "customer-catalog@example.com",
      roleName: "CUSTOMER"
    });

    const forbiddenResponse = await request(app)
      .post("/api/v1/catalog/products")
      .set("authorization", `Bearer ${customerToken}`)
      .send(buildCatalogProductInput());

    expect(forbiddenResponse.status).toBe(403);
  });

  it("creates, updates, lists, and fetches authoring products for admins", async () => {
    const app = await loadApp();
    const adminToken = await registerAndLogin(app, {
      email: "catalog-admin@example.com",
      roleName: "ADMIN"
    });

    const createResponse = await request(app)
      .post("/api/v1/catalog/products")
      .set("authorization", `Bearer ${adminToken}`)
      .send(buildCatalogProductInput());

    expect(createResponse.status).toBe(201);
    expect(readCatalogProductBody(createResponse).product.slug).toBe(
      "nike-air-zoom-pegasus-41"
    );

    const productId = readCatalogProductBody(createResponse).product.id;

    const updateResponse = await request(app)
      .put(`/api/v1/catalog/products/${productId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        ...buildCatalogProductInput(),
        brand: {
          id: "brand_nike",
          name: "Nike Running"
        },
        title: "Air Zoom Pegasus 41 Premium"
      });

    expect(updateResponse.status).toBe(200);
    expect(readCatalogProductBody(updateResponse).product.title).toBe(
      "Air Zoom Pegasus 41 Premium"
    );
    expect(readCatalogProductBody(updateResponse).product.brand.id).toBe(
      "brand_nike"
    );

    const listResponse = await request(app)
      .get("/api/v1/catalog/products")
      .query({
        brandId: "brand_nike",
        status: "DRAFT"
      })
      .set("authorization", `Bearer ${adminToken}`);

    expect(listResponse.status).toBe(200);
    expect(readCatalogProductsBody(listResponse).count).toBe(1);
    expect(readCatalogProductsBody(listResponse).products[0]?.id).toBe(
      productId
    );

    const getResponse = await request(app)
      .get(`/api/v1/catalog/products/${productId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(getResponse.status).toBe(200);
    expect(readCatalogProductBody(getResponse).product.id).toBe(productId);
  });
});

const loadApp = async () => {
  const [
    { createApp },
    { RuntimeState },
    { CatalogService },
    { InMemoryCatalogRepository }
  ] = await Promise.all([
    import("../../src/app"),
    import("../../src/shared/runtime/runtime-state"),
    import("../../src/modules/catalog/application/services/catalog.service"),
    import("../../src/modules/catalog/infrastructure/repositories/in-memory-catalog.repository")
  ]);

  const catalogService = new CatalogService(new InMemoryCatalogRepository());

  return createApp(new RuntimeState(), {
    catalogService
  });
};

const registerAndLogin = async (
  app: Parameters<typeof request>[0],
  input: {
    email: string;
    roleName: "ADMIN" | "CUSTOMER";
  }
) => {
  const password = "Password123!";

  const registerResponse = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: input.email,
      password
    });

  expect(registerResponse.status).toBe(201);

  const user = await prisma.user.findUniqueOrThrow({
    where: {
      email: input.email
    }
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: {
      name: input.roleName
    }
  });

  await prisma.userRole.deleteMany({
    where: {
      userId: user.id
    }
  });
  await prisma.userRole.create({
    data: {
      roleId: role.id,
      userId: user.id
    }
  });

  const loginResponse = await request(app).post("/api/v1/auth/login").send({
    email: input.email,
    password
  });

  expect(loginResponse.status).toBe(200);

  return readAuthBody(loginResponse).accessToken;
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

const seedRoles = async () => {
  const permissions = await prisma.permission.createManyAndReturn({
    data: [
      {
        name: "catalog:write"
      },
      {
        name: "orders:read:self"
      }
    ],
    skipDuplicates: true
  });
  const permissionByName = new Map(
    permissions.map((permission) => [permission.name, permission.id])
  );

  const customerRole = await prisma.role.upsert({
    create: {
      name: "CUSTOMER"
    },
    update: {},
    where: {
      name: "CUSTOMER"
    }
  });
  const adminRole = await prisma.role.upsert({
    create: {
      name: "ADMIN"
    },
    update: {},
    where: {
      name: "ADMIN"
    }
  });

  await prisma.rolePermission.createMany({
    data: [
      {
        permissionId: requirePermissionId(permissionByName, "orders:read:self"),
        roleId: customerRole.id
      },
      {
        permissionId: requirePermissionId(permissionByName, "catalog:write"),
        roleId: adminRole.id
      }
    ],
    skipDuplicates: true
  });
};

const requirePermissionId = (
  permissionByName: Map<string, string>,
  permissionName: string
) => {
  const permissionId = permissionByName.get(permissionName);

  if (!permissionId) {
    throw new Error(`Permission ${permissionName} was not created`);
  }

  return permissionId;
};

const readAuthBody = (response: request.Response) =>
  response.body as AuthResponseBody;

const readCatalogProductBody = (response: request.Response) =>
  response.body as CatalogProductResponseBody;

const readCatalogProductsBody = (response: request.Response) =>
  response.body as CatalogProductsResponseBody;

const buildCatalogProductInput = () => ({
  attributes: {
    gender: "men",
    material: "mesh"
  },
  brand: {
    id: "brand_nike",
    name: "Nike"
  },
  categories: [
    {
      id: "running",
      name: "Running"
    }
  ],
  description: {
    long: "Daily trainer for neutral runners.",
    short: "Neutral running shoe"
  },
  media: [
    {
      alt: "Front view",
      type: "image",
      url: "https://cdn.example.com/p/pegasus/front.jpg"
    }
  ],
  seo: {
    description: "Shop Nike Air Zoom Pegasus 41 with fast shipping.",
    title: "Nike Air Zoom Pegasus 41 Running Shoes"
  },
  slug: "nike-air-zoom-pegasus-41",
  status: "DRAFT",
  title: "Air Zoom Pegasus 41",
  variants: [
    {
      attributes: {
        color: "black",
        size: "10"
      },
      barcode: "123456789",
      isActive: true,
      price: {
        amount: 1299900,
        currency: "INR"
      },
      sku: "PEG41-BLK-10",
      title: "Black / 10",
      weightGrams: 320
    }
  ]
});
