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

// VS-030 (docs/adr/0006): editor WYSIWYG (TipTap) del comentario
// confidencial — cobertura que no existía para el <textarea> markdown-lite
// anterior (VS-028). Cada pregunta tiene su propio comentario confidencial
// (uno por elemento, VS-019); el fixture de esta spec tiene 2 preguntas, así
// que hay que acotar a la de "Nombre del responsable" con `.runtime-question`.
//
// Se usa `.comment-editor__content` en vez de `getByLabel("Comentario
// confidencial")` por costumbre/estabilidad del locator, no por ambigüedad:
// naCommentRow ya no vive dentro del <label> del control principal (ver
// comentario en page.tsx sobre por qué — un <label> redirige el foco a su
// control asociado en cualquier click dentro de él, y un contentEditable no
// es un control de formulario nativo que lo intercepte).
test("el comentario confidencial se escribe con formato, autoguarda y persiste tras recargar", async ({ page }) => {
  const { evaluationToken } = loadFixtures();

  await page.goto(`/evaluations/${evaluationToken}`);
  const question = page.locator(".runtime-question", { hasText: "Nombre del responsable" });
  const comment = question.locator(".comment-editor__content");
  await comment.click();
  await question.getByRole("button", { name: "Negrita" }).click();
  await page.keyboard.type("Texto en negrita");

  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();

  await page.reload();
  const commentAfterReload = page.locator(".runtime-question", { hasText: "Nombre del responsable" }).locator(".comment-editor__content");
  await expect(commentAfterReload.locator("strong")).toHaveText("Texto en negrita");
});
