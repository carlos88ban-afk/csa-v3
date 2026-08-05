import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Flujo público (docs/engines/persistence.md): sin sesión, a propósito —
// mismo criterio que la app real (el evaluado nunca tiene cuenta).
test.use({ storageState: { cookies: [], origins: [] } });

const dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixtures() {
  const raw = readFileSync(path.join(dirname, ".auth", "fixtures.json"), "utf-8");
  return JSON.parse(raw) as { evaluationToken: string };
}

test("responder una Evaluación publicada actualiza el progreso y persiste tras recargar", async ({ page }) => {
  const { evaluationToken } = loadFixtures();

  await page.goto(`/evaluations/${evaluationToken}`);
  await expect(page.getByText("0% completado")).toBeVisible();

  await page.getByLabel("Nombre del responsable").fill("María López");
  await page.getByRole("radio", { name: "Sí" }).check();

  // Autosave (debounce 1500ms, ver docs/engines/persistence.md) confirma "Guardado".
  // Sin timeout explícito: el default de `expect` (15s, ver playwright.config.ts)
  // deja margen para el debounce + la latencia real de `next dev`/Neon, que en
  // este entorno local varía bastante (nunca contra producción, ver R-005).
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await expect(page.getByText("100% completado")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Nombre del responsable")).toHaveValue("María López");
  await expect(page.getByRole("radio", { name: "Sí" })).toBeChecked();
  await expect(page.getByText("100% completado")).toBeVisible();
});

test("un token inexistente muestra el mensaje de enlace no disponible", async ({ page }) => {
  await page.goto("/evaluations/token-que-nunca-existio");
  await expect(page.getByText("Este enlace no existe o ya no está disponible.")).toBeVisible();
});
