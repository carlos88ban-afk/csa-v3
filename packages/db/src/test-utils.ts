import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { organization, user } from "./schema/auth.js";

// Helper de limpieza para fixtures de test (packages/db vitest y apps/web
// Playwright, ver TD-003 en docs/TECH_DEBT.md). Mantiene `drizzle-orm`
// contenido dentro de este paquete — apps/web nunca debe importar
// operadores de drizzle directamente, solo funciones ya armadas como esta.
export async function deleteTestFixtures(organizationId: string, userId: string): Promise<void> {
  await db.delete(organization).where(eq(organization.id, organizationId));
  await db.delete(user).where(eq(user.id, userId));
}
