import { expect, test } from "@playwright/test";

// Flujo autenticado del Builder — workspace split-view (VS-031,
// docs/slices/VS-031.md): Framework → Dimensión → workspace (árbol) →
// indicador → subindicador → elemento → Publicar → link público. La sesión
// ya viene inyectada vía storageState (ver e2e/global-setup.ts) — este
// archivo nunca escribe una contraseña en un formulario del navegador.

test("Framework → Dimensión → Builder → Subindicador → Elemento → Publicar → link público", async ({ page }) => {
  const suffix = Date.now().toString(36);

  await page.goto("/frameworks");
  await page.getByLabel("Nombre").fill(`Framework E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("link", { name: `Framework E2E ${suffix}` }).click();

  await expect(page.getByRole("heading", { name: `Framework E2E ${suffix}` })).toBeVisible();
  await page.getByLabel("Título").fill(`Dim E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear" }).click();

  // La dimensión recién creada lleva directo al workspace (?s=dim).
  await page.getByRole("link", { name: `Dim E2E ${suffix}` }).click();
  await expect(page).toHaveURL(/\/builder\?s=/);

  // Dimensión vacía: el panel central ofrece crear el primer indicador.
  // (exact: true — sin él matchea también el aria-label "Crear indicador en X"
  // del árbol, strict mode violation.)
  await expect(page.getByRole("button", { name: "Crear indicador", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Crear indicador", exact: true }).click();
  await page.getByLabel("Título del indicador").fill(`Ind E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  // Flujo continuo: el indicador creado abre directo el form del primer
  // subindicador (panel central + form inline en el árbol).
  await page.getByLabel("Título del subindicador").fill(`Sub E2E ${suffix}`);
  await page.getByRole("button", { name: "Crear", exact: true }).click();

  // El subindicador creado queda seleccionado con su editor a la derecha.
  await expect(page.getByRole("heading", { name: `Sub E2E ${suffix}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Framework", exact: true })).toBeVisible();

  // Form Editor: el tipo por default ya es texto_corto (ver
  // apps/web/components/subindicator-editor.tsx), alcanza con click en
  // "Agregar elemento".
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
