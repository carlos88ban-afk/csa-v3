import { expect, test } from "@playwright/test";

// Flujo autenticado del Builder (docs/architecture/accessibility.md no
// aplica aquí — este spec cubre el flujo funcional, no a11y). La sesión ya
// viene inyectada vía storageState (ver e2e/global-setup.ts) — este archivo
// nunca escribe una contraseña en un formulario del navegador.

test("Framework → Dimensión → Indicador → Subindicador → Elemento → Publicar → link público", async ({ page }) => {
  const suffix = Date.now().toString(36);

  await page.goto("/frameworks");
  await page.getByLabel("Nombre").fill(`Framework E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("link", { name: `Framework E2E ${suffix}` }).click();

  await expect(page.getByRole("heading", { name: `Framework E2E ${suffix}` })).toBeVisible();
  await page.getByLabel("Título").fill(`Dim E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("link", { name: `Dim E2E ${suffix}` }).click();

  await expect(page.getByRole("heading", { name: `Dim E2E ${suffix}` })).toBeVisible();
  await page.getByLabel("Título").fill(`Ind E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("link", { name: `Ind E2E ${suffix}` }).click();

  await expect(page.getByRole("heading", { name: `Ind E2E ${suffix}` })).toBeVisible();
  await page.getByLabel("Título").fill(`Sub E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("link", { name: `Sub E2E ${suffix}` }).click();

  // Form Editor: el tipo por default ya es texto_corto (ver
  // apps/web/.../subindicators/[subindicatorId]/page.tsx), alcanza con
  // click en "Agregar elemento".
  await expect(page.getByRole("heading", { name: `Sub E2E ${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Agregar elemento" }).click();
  await page.getByLabel("Texto").fill(`Pregunta E2E ${suffix}`);
  await expect(page.getByText(/^Guardado/)).toBeVisible();

  // Volver al Framework (breadcrumb) y publicar.
  await page.getByRole("link", { name: "Framework", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Framework E2E ${suffix}` })).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();

  await expect(page.getByText("Publicada")).toBeVisible();
  const publicLink = page.getByRole("link", { name: /\/evaluations\// });
  const href = await publicLink.getAttribute("href");
  expect(href).toBeTruthy();

  // El link público debe mostrar el árbol recién publicado, sin sesión.
  await page.context().clearCookies();
  await page.goto(href!);
  await expect(page.getByText(`Framework E2E ${suffix}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Sub E2E ${suffix}` })).toBeVisible();
  await expect(page.getByLabel(`Pregunta E2E ${suffix}`)).toBeVisible();
});
