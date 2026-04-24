import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roleDefinitions = {
  ADMIN: [
    "catalog:write",
    "checkout:create",
    "inventory:adjust",
    "orders:read:any",
    "orders:read:self",
    "users:manage"
  ],
  CUSTOMER: ["checkout:create", "orders:read:self"],
  OPS: ["catalog:write", "inventory:adjust", "orders:read:any"]
} as const;

async function main() {
  const permissionNames = Array.from(
    new Set(
      Object.values(roleDefinitions).flatMap((permissions) => permissions)
    )
  );

  await prisma.$transaction(
    permissionNames.map((permissionName) =>
      prisma.permission.upsert({
        create: {
          name: permissionName
        },
        update: {},
        where: {
          name: permissionName
        }
      })
    )
  );

  const permissions = await prisma.permission.findMany();
  const permissionByName = new Map(
    permissions.map((permission) => [permission.name, permission.id])
  );

  for (const [roleName, permissionNamesForRole] of Object.entries(
    roleDefinitions
  )) {
    const role = await prisma.role.upsert({
      create: {
        name: roleName
      },
      update: {},
      where: {
        name: roleName
      }
    });

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id
      }
    });

    await prisma.rolePermission.createMany({
      data: permissionNamesForRole.map((permissionName) => ({
        permissionId: requirePermissionId(permissionByName, permissionName),
        roleId: role.id
      })),
      skipDuplicates: true
    });
  }
}

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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("Failed to seed RBAC data", error);
    await prisma.$disconnect();
    process.exit(1);
  });
