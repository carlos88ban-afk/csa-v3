import { randomUUID } from "node:crypto";
import { applySetCookies } from "better-auth/cookies";
import { formSchema } from "@plataforma-csa/sdk-core";
import { auth } from "../src/auth.js";
import { createDimension, createEvaluation, createFramework, createIndicator, createSubindicator, updateSubindicator } from "../src/index.js";
import { replicaData } from "../../../scripts/csa-2026-replica-data.js";

// Réplica de prueba del árbol CSA 2026 (34 ramas, ~161 subindicadores) para
// estresar Builder/Runtime a escala real (ver plan en
// D:\Usuarios\PM75161698\.claude\plans\luminous-moseying-narwhal.md, Parte 2).
// No es parte del producto — herramienta puntual de verificación, no tiene
// tests ni se documenta como ADR. Dry-run por defecto; --write requiere
// confirmación explícita del usuario antes de correr (escribe en Neon real,
// no hay rama de test aislada, TD-002 pendiente).

const WRITE = process.argv.includes("--write");
const FRAMEWORK_NAME = "CSA 2026 — Réplica QA";
const OWNER_EMAIL = `csa-2026-replica-${randomUUID().slice(0, 8)}@example.com`;
const OWNER_PASSWORD = "Csa2026ReplicaQA!23";

function countSubindicators(): number {
  let total = 0;
  for (const dim of replicaData) {
    total += (dim.subindicators ?? []).length;
    for (const ind of dim.indicators) total += ind.subindicators.length;
  }
  return total;
}

function validateAll() {
  let errors = 0;
  for (const dim of replicaData) {
    for (const sub of dim.subindicators ?? []) {
      const result = formSchema.safeParse(sub.formSchema);
      if (!result.success) {
        errors++;
        console.error(`✗ [${dim.title} > ${sub.title}]`, result.error.issues.map((i) => i.message).join("; "));
      }
    }
    for (const ind of dim.indicators) {
      for (const sub of ind.subindicators) {
        const result = formSchema.safeParse(sub.formSchema);
        if (!result.success) {
          errors++;
          console.error(`✗ [${dim.title} > ${ind.title} > ${sub.title}]`, result.error.issues.map((i) => i.message).join("; "));
        }
      }
    }
  }
  return errors;
}

function printSummary() {
  console.log(`\nDimensiones: ${replicaData.length}`);
  let branchCount = 0;
  for (const dim of replicaData) {
    branchCount += dim.indicators.length;
    console.log(`  - ${dim.title}: ${dim.indicators.length} indicadores, ${(dim.subindicators ?? []).length} subindicadores directos`);
  }
  console.log(`Ramas totales (dimensiones + indicadores con hijos directos aparte): ${replicaData.length + branchCount}`);
  console.log(`Subindicadores totales: ${countSubindicators()}`);

  console.log("\nEjemplos:");
  const dim = replicaData[0]!;
  console.log(`  Dimensión: "${dim.title}"`);
  if (dim.subindicators?.[0]) {
    const sub = dim.subindicators[0];
    console.log(`    Subindicador directo: "${sub.title}" (${sub.formSchema.elements.length} elementos: ${sub.formSchema.elements.map((e) => e.type).join(", ")})`);
  }
  const indDim = replicaData.find((d) => d.indicators.length > 0);
  if (indDim) {
    const ind = indDim.indicators[0]!;
    console.log(`  Indicador: "${ind.title}" (bajo "${indDim.title}")`);
    const sub = ind.subindicators[0];
    if (sub) console.log(`    Subindicador: "${sub.title}" (${sub.formSchema.elements.length} elementos: ${sub.formSchema.elements.map((e) => e.type).join(", ")})`);
  }
}

async function main() {
  console.log(`Modo: ${WRITE ? "ESCRITURA REAL contra Neon (producción)" : "DRY-RUN (solo validación, sin escribir)"}`);

  const errors = validateAll();
  if (errors > 0) {
    console.error(`\n${errors} formSchema inválidos contra el contrato zod real. Abortando.`);
    process.exit(1);
  }
  console.log("\n✔ Todos los formSchema son válidos contra el contrato zod real (packages/sdk-core/src/form-schema.ts).");

  printSummary();

  if (!WRITE) {
    console.log("\nDry-run completo. Ejecutar con --write para escribir de verdad (requiere confirmación explícita del usuario).");
    return;
  }

  console.log(`\nCreando organización/usuario de prueba (${OWNER_EMAIL})...`);
  const signUp = await auth.api.signUpEmail({ body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "CSA 2026 Replica QA" } });
  const signIn = await auth.api.signInEmail({ body: { email: OWNER_EMAIL, password: OWNER_PASSWORD }, returnHeaders: true });
  const headers = new Headers();
  applySetCookies(headers, signIn.headers.getSetCookie());
  const org = await auth.api.createOrganization({ body: { name: "CSA 2026 Réplica QA Org", slug: `csa-2026-replica-${randomUUID().slice(0, 8)}` }, headers });
  if (!org) throw new Error("No se pudo crear la organización");
  await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers });
  console.log(`  organizationId=${org.id} userId=${signUp.user.id}`);

  console.log(`\nCreando Framework "${FRAMEWORK_NAME}"...`);
  const framework = await createFramework(org.id, { name: FRAMEWORK_NAME });

  let dimCount = 0, indCount = 0, subCount = 0;
  for (const dimData of replicaData) {
    const dimension = await createDimension(org.id, { frameworkId: framework.id, title: dimData.title, description: dimData.description });
    dimCount++;

    for (const subData of dimData.subindicators ?? []) {
      const sub = await createSubindicator(org.id, { dimensionId: dimension.id, title: subData.title, description: subData.description });
      await updateSubindicator(org.id, sub.id, { formSchema: subData.formSchema });
      subCount++;
    }

    for (const indData of dimData.indicators) {
      const indicator = await createIndicator(org.id, { dimensionId: dimension.id, title: indData.title, description: indData.description });
      indCount++;
      for (const subData of indData.subindicators) {
        const sub = await createSubindicator(org.id, { indicatorId: indicator.id, title: subData.title, description: subData.description });
        await updateSubindicator(org.id, sub.id, { formSchema: subData.formSchema });
        subCount++;
      }
    }
    console.log(`  ✔ ${dimData.title} (${dimCount}/${replicaData.length} dimensiones, ${subCount} subindicadores hasta ahora)`);
  }

  console.log(`\n✔ Creados: ${dimCount} dimensiones, ${indCount} indicadores, ${subCount} subindicadores.`);

  console.log("\nPublicando...");
  const evaluationResult = await createEvaluation(org.id, { frameworkId: framework.id });
  console.log(`\n✔ Publicado. Token: ${evaluationResult.token}`);
  console.log(`  Runtime público: /evaluations/${evaluationResult.token}`);
  console.log(`  Builder: /frameworks/${framework.id}`);
  console.log(`  organizationId=${org.id} (para limpiar después)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
