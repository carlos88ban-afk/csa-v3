import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteTestFixtures } from "@plataforma-csa/db";

// Limpieza de fixtures de e2e (TD-003) — mismo patrón afterAll que los
// tests de packages/db: borra la organización (cascada se lleva
// framework/dimension/indicator/subindicator/evaluation/response) y el
// usuario de prueba creados en global-setup.ts.

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

export default async function globalTeardown() {
  const fixturesPath = path.join(AUTH_DIR, "fixtures.json");
  if (!existsSync(fixturesPath)) return;

  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf-8")) as {
    userId: string;
    organizationId: string;
  };

  await deleteTestFixtures(fixtures.organizationId, fixtures.userId);

  rmSync(AUTH_DIR, { recursive: true, force: true });
}
