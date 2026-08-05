import { defineConfig, devices } from "@playwright/test";

// E2E (TD-003, ver docs/TECH_DEBT.md). Corre contra un `next dev` LOCAL —
// nunca contra producción, eso ensuciaría datos reales de verdad (mismo
// riesgo que docs/RISKS.md R-005, que ya aplica a los tests de packages/db
// contra Neon). `reuseExistingServer: true` sin condicionar a CI: no hay
// pipeline de CI para e2e todavía, y preferimos reusar cualquier servidor
// que ya esté corriendo en el puerto 3000 antes que levantar uno propio.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  // Un solo `next dev` local + la misma Neon compartida (sin un segundo
  // entorno todavía, ver TD-002) — correr specs en paralelo generó
  // contención real (páginas atascadas en "Cargando..." indefinidamente).
  workers: 1,
  retries: 0,
  reporter: "list",
  // 15s (no los 5s por default): Turbopack compila cada ruta on-demand la
  // primera vez que se pide en `next dev` — la primera visita a una ruta
  // nunca antes compilada puede tardar más que el timeout por default.
  expect: { timeout: 15_000 },
  // 120s (no los 30s por default): flujos largos como builder-publish.spec.ts
  // encadenan 8+ pasos de crear+navegar; en `next dev` cada request puede
  // tardar 1-6s (Turbopack + Strict Mode duplicando efectos + latencia de
  // Neon), y esa latencia se acumula por todo el flujo.
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    storageState: "./e2e/.auth/state.json",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
