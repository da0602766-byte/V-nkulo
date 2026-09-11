import { requireTenantPermission } from "./tenant";

export async function requireVisitorCategoryManagement() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access;
  if (
    !access.context.isOwner &&
    !access.context.permissions.includes("visitor.categories.manage")
  ) {
    return {
      error: Response.json(
        { error: "Você não possui permissão para gerenciar categorias." },
        { status: 403 },
      ),
    } as const;
  }
  return access;
}
