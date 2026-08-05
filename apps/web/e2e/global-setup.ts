import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySetCookies } from "better-auth/cookies";
import {
  auth,
  createDimension,
  createEvaluation,
  createFramework,
  createIndicator,
  createSubindicator,
  updateSubindicator,
} from "@plataforma-csa/db";

// Setup de fixtures para e2e (TD-003, ver docs/TECH_DEBT.md y
// docs/project_notes/decisions.md). REGLA DE SEGURIDAD: esto NUNCA escribe
// una contraseña en un formulario del navegador ni la envía por HTTP —
// llama `auth.api.signUpEmail`/`signInEmail` directo en Node, exactamente
// el mismo patrón ya usado por los tests de integración de packages/db
// desde VS-003. La sesión resultante se serializa a un `storageState.json`
// que Playwright carga ya autenticado; los specs de browser jamás tocan un
// campo de contraseña.

const runId = randomUUID().slice(0, 8);
export const E2E_EMAIL = `e2e-${runId}@example.com`;
const PASSWORD = "E2ePlaywright!23";
const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  expires: number;
}

function parseSetCookie(raw: string): ParsedCookie {
  const parts = raw.split(";").map((s) => s.trim());
  const [name, value] = parts[0]!.split("=");
  const attrs = new Map(
    parts.slice(1).map((part) => {
      const [k, v] = part.split("=");
      return [k!.toLowerCase(), v ?? "true"];
    }),
  );
  const sameSiteRaw = attrs.get("samesite")?.toLowerCase();
  const sameSite: ParsedCookie["sameSite"] = sameSiteRaw === "strict" ? "Strict" : sameSiteRaw === "none" ? "None" : "Lax";
  return {
    name: name!,
    value: value ?? "",
    domain: "localhost",
    path: attrs.get("path") ?? "/",
    httpOnly: attrs.has("httponly"),
    secure: attrs.has("secure"),
    sameSite,
    expires: -1, // cookie de sesión: vive lo que dure la corrida de e2e
  };
}

export default async function globalSetup() {
  const signUp = await auth.api.signUpEmail({ body: { email: E2E_EMAIL, password: PASSWORD, name: "E2E Playwright" } });
  const signIn = await auth.api.signInEmail({ body: { email: E2E_EMAIL, password: PASSWORD }, returnHeaders: true });
  const rawCookies = signIn.headers.getSetCookie();

  const headers = new Headers();
  applySetCookies(headers, rawCookies);

  const org = await auth.api.createOrganization({
    body: { name: `E2E Org ${runId}`, slug: `e2e-org-${runId}` },
    headers,
  });
  if (!org) throw new Error("No se pudo crear la organización de fixtures de e2e");
  await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers });

  // Fixture para public-runtime.spec.ts: un Framework publicado con un
  // Subindicador de preguntas reales, sin necesidad de sesión para responder.
  const framework = await createFramework(org.id, { name: "E2E Runtime Framework" });
  const dimension = await createDimension(org.id, { frameworkId: framework.id, title: "Dimensión E2E" });
  const indicator = await createIndicator(org.id, { dimensionId: dimension.id, title: "Indicador E2E" });
  const subindicator = await createSubindicator(org.id, { indicatorId: indicator.id, title: "Subindicador E2E" });
  await updateSubindicator(org.id, subindicator.id, {
    formSchema: {
      schemaVersion: 1,
      elements: [
        { id: "el-texto", type: "texto_corto", label: "Nombre del responsable" },
        {
          id: "el-unica",
          type: "seleccion_unica",
          label: "¿Aplica?",
          options: [
            { id: "si", label: "Sí" },
            { id: "no", label: "No" },
          ],
        },
      ],
    },
  });
  const evaluation = await createEvaluation(org.id, { frameworkId: framework.id });

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(
    path.join(AUTH_DIR, "state.json"),
    JSON.stringify({ cookies: rawCookies.map(parseSetCookie), origins: [] }, null, 2),
  );
  writeFileSync(
    path.join(AUTH_DIR, "fixtures.json"),
    JSON.stringify(
      {
        userId: signUp.user.id,
        organizationId: org.id,
        frameworkId: framework.id,
        evaluationToken: evaluation.token,
      },
      null,
      2,
    ),
  );
}
