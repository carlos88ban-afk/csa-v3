import { randomBytes, randomUUID } from "node:crypto";
import type { EvaluationSnapshot } from "@plataforma-csa/sdk-core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "../auth.js";
import type { AppContext } from "../authz.js";
import { db } from "../client.js";
import { account, member, organization, user } from "../schema/auth.js";
import { blockAssignment, inquiry } from "../schema/corporate.js";
import { dimension, framework, indicator, subindicator } from "../schema/domain.js";
import { evaluation } from "../schema/evaluation.js";
import { NotFoundError, ValidationError } from "./service.js";

// ---------------------------------------------------------------- Unidades

export async function listUnits(corporateOrgId: string) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      sigla: organization.sigla,
      active: organization.active,
    })
    .from(organization)
    .where(eq(organization.parentOrganizationId, corporateOrgId))
    .orderBy(asc(organization.name));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createUnit(corporateOrgId: string, input: { name: string; sigla: string }) {
  const name = input.name.trim();
  const sigla = input.sigla.trim();
  if (!name) throw new ValidationError("UNIT_NAME_REQUIRED");
  const id = randomUUID();
  await db.insert(organization).values({
    id,
    name,
    sigla: sigla || null,
    active: true,
    slug: `${slugify(sigla || name) || "unidad"}-${id.slice(0, 6)}`,
    createdAt: new Date(),
    parentOrganizationId: corporateOrgId,
  });
  return { id, name, sigla: sigla || null, active: true };
}

export async function updateUnit(
  corporateOrgId: string,
  id: string,
  input: { name?: string; sigla?: string; active?: boolean },
) {
  const [unit] = await db.select().from(organization).where(eq(organization.id, id));
  if (!unit || unit.parentOrganizationId !== corporateOrgId) throw new NotFoundError("unit");
  const patch: Partial<typeof organization.$inferInsert> = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new ValidationError("UNIT_NAME_REQUIRED");
    patch.name = input.name.trim();
  }
  if (input.sigla !== undefined) patch.sigla = input.sigla.trim() || null;
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length > 0) await db.update(organization).set(patch).where(eq(organization.id, id));
  return { id };
}

// ---------------------------------------------------------------- Usuarios

export type ManagedRole = "corporate_admin" | "unit_admin" | "evaluator";

export async function listUsers(ctx: AppContext) {
  const unitIds =
    ctx.appRole === "corporate_admin"
      ? (await listUnits(ctx.corporateOrgId)).map((u) => u.id)
      : ctx.unitId
        ? [ctx.unitId]
        : [];
  const orgIds = ctx.appRole === "corporate_admin" ? [ctx.corporateOrgId, ...unitIds] : unitIds;
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      orgId: member.organizationId,
      orgName: organization.name,
      sigla: organization.sigla,
      parent: organization.parentOrganizationId,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(inArray(member.organizationId, orgIds))
    .orderBy(asc(organization.name), asc(user.name));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    appRole: (r.parent ? (r.role === "unit_admin" ? "unit_admin" : "evaluator") : "corporate_admin") as ManagedRole,
    unitId: r.parent ? r.orgId : null,
    unitName: r.parent ? r.orgName : null,
    unitSigla: r.parent ? r.sigla : null,
  }));
}

export async function createManagedUser(
  ctx: AppContext,
  input: { name: string; email: string; role: ManagedRole; unitId?: string | null },
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) throw new ValidationError("USER_NAME_EMAIL_REQUIRED");

  let targetOrgId: string;
  let memberRole: string;
  if (input.role === "corporate_admin") {
    if (ctx.appRole !== "corporate_admin") throw new ValidationError("FORBIDDEN_ROLE");
    targetOrgId = ctx.corporateOrgId;
    memberRole = "owner";
  } else {
    const unitId = ctx.appRole === "unit_admin" ? ctx.unitId : (input.unitId ?? null);
    if (!unitId) throw new ValidationError("UNIT_REQUIRED");
    const [unit] = await db.select().from(organization).where(eq(organization.id, unitId));
    if (!unit || unit.parentOrganizationId !== ctx.corporateOrgId) throw new NotFoundError("unit");
    targetOrgId = unit.id;
    memberRole = input.role;
  }

  const initialPassword = randomBytes(9).toString("base64url");
  let created: { id: string };
  try {
    const res = await auth.api.signUpEmail({ body: { name, email, password: initialPassword } });
    created = res.user;
  } catch {
    throw new ValidationError("EMAIL_ALREADY_USED");
  }
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: targetOrgId,
    userId: created.id,
    role: memberRole,
    createdAt: new Date(),
  });
  return { userId: created.id, email, initialPassword };
}

// Genera una contraseña nueva (las vigentes están cifradas y no se pueden mostrar) y
// la devuelve una sola vez para que el administrador la copie.
export async function resetManagedUserPassword(ctx: AppContext, userId: string) {
  const users = await listUsers(ctx);
  const target = users.find((u) => u.userId === userId);
  if (!target) throw new NotFoundError("user");
  const authCtx = await auth.$context;
  const newPassword = randomBytes(9).toString("base64url");
  const hash = await authCtx.password.hash(newPassword);
  const res = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (res.length === 0) throw new NotFoundError("account");
  return { email: target.email, password: newPassword };
}

export async function removeManagedUser(ctx: AppContext, userId: string) {
  if (userId === ctx.userId) throw new ValidationError("CANNOT_REMOVE_SELF");
  const users = await listUsers(ctx);
  if (!users.some((u) => u.userId === userId)) throw new NotFoundError("user");
  // Borrar la cuenta completa: un usuario pertenece a una sola unidad.
  await db.delete(user).where(eq(user.id, userId));
}

// ---------------------------------------------------- Responsables por bloque

type Snap = EvaluationSnapshot["dimensions"][number];

export interface BlockRow {
  subindicatorId: string;
  dimension: string;
  indicator: string | null;
  title: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
}

export async function listBlocks(evaluationId: string, unitId: string): Promise<BlockRow[]> {
  const [ev] = await db.select().from(evaluation).where(eq(evaluation.id, evaluationId));
  if (!ev) throw new NotFoundError("evaluation");
  const assigned = await db
    .select({ subindicatorId: blockAssignment.subindicatorId, userId: blockAssignment.userId, name: user.name, email: user.email })
    .from(blockAssignment)
    .innerJoin(user, eq(user.id, blockAssignment.userId))
    .where(and(eq(blockAssignment.evaluationId, evaluationId), eq(blockAssignment.businessUnitId, unitId)));
  const byBlock = new Map(assigned.map((a) => [a.subindicatorId, a]));
  const rows: BlockRow[] = [];
  const snapshot = ev.snapshot as EvaluationSnapshot;
  const push = (dim: Snap, ind: string | null, sub: Snap["subindicators"][number]) => {
    // Solo bloques que aplican a la unidad (al menos una pregunta).
    if (!blockAppliesToUnit(sub, unitId)) return;
    const a = byBlock.get(sub.id);
    rows.push({
      subindicatorId: sub.id,
      dimension: dim.title,
      indicator: ind,
      title: sub.title,
      userId: a?.userId ?? null,
      userName: a?.name ?? null,
      userEmail: a?.email ?? null,
    });
  };
  for (const dim of snapshot.dimensions) {
    for (const ind of dim.indicators) for (const sub of ind.subindicators) push(dim, ind.title, sub);
    for (const sub of dim.subindicators) push(dim, null, sub);
  }
  return rows;
}

export async function setBlockResponsible(
  evaluationId: string,
  unitId: string,
  subindicatorId: string,
  userId: string | null,
) {
  if (userId === null) {
    await db
      .delete(blockAssignment)
      .where(
        and(
          eq(blockAssignment.evaluationId, evaluationId),
          eq(blockAssignment.businessUnitId, unitId),
          eq(blockAssignment.subindicatorId, subindicatorId),
        ),
      );
    return;
  }
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, unitId)));
  if (!m) throw new ValidationError("USER_NOT_IN_UNIT");
  await db
    .insert(blockAssignment)
    .values({ id: randomUUID(), evaluationId, businessUnitId: unitId, subindicatorId, userId })
    .onConflictDoUpdate({
      target: [blockAssignment.evaluationId, blockAssignment.businessUnitId, blockAssignment.subindicatorId],
      set: { userId },
    });
}

/**
 * Asigna un responsable por correo a varios bloques (alcance dimensión/indicador/bloque).
 * Si el correo no tiene cuenta, se crea como evaluador de la unidad y se devuelve la contraseña.
 */
export async function assignResponsibleByEmail(
  evaluationId: string,
  unitId: string,
  input: { email: string; name?: string | undefined; subindicatorIds: string[] },
) {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new ValidationError("EMAIL_REQUIRED");
  if (input.subindicatorIds.length === 0) throw new ValidationError("NO_BLOCKS");
  const valid = new Set((await listBlocks(evaluationId, unitId)).map((b) => b.subindicatorId));
  const ids = input.subindicatorIds.filter((id) => valid.has(id));
  if (ids.length === 0) throw new ValidationError("NO_BLOCKS");

  let userId: string;
  let created = false;
  let password: string | undefined;
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    const [m] = await db.select().from(member).where(and(eq(member.userId, existing.id), eq(member.organizationId, unitId)));
    if (!m) throw new ValidationError("EMAIL_IN_OTHER_UNIT");
    userId = existing.id;
  } else {
    password = randomBytes(9).toString("base64url");
    const name = (input.name ?? "").trim() || email.split("@")[0]!;
    const res = await auth.api.signUpEmail({ body: { name, email, password } });
    userId = res.user.id;
    created = true;
    await db.insert(member).values({ id: randomUUID(), organizationId: unitId, userId, role: "evaluator", createdAt: new Date() });
  }
  for (const subindicatorId of ids) {
    await db
      .insert(blockAssignment)
      .values({ id: randomUUID(), evaluationId, businessUnitId: unitId, subindicatorId, userId })
      .onConflictDoUpdate({
        target: [blockAssignment.evaluationId, blockAssignment.businessUnitId, blockAssignment.subindicatorId],
        set: { userId },
      });
  }
  return { userId, email, created, assigned: ids.length, ...(password ? { password } : {}) };
}

/** Un evaluador solo puede escribir en los bloques que tiene asignados. */
export async function assertCanWriteBlock(ctx: AppContext, evaluationId: string, subindicatorId: string) {
  if (ctx.appRole !== "evaluator") return;
  const [row] = await db
    .select()
    .from(blockAssignment)
    .where(
      and(
        eq(blockAssignment.evaluationId, evaluationId),
        eq(blockAssignment.businessUnitId, ctx.unitId!),
        eq(blockAssignment.subindicatorId, subindicatorId),
        eq(blockAssignment.userId, ctx.userId),
      ),
    );
  if (!row) throw new ValidationError("BLOCK_NOT_ASSIGNED");
}

// ---------------------------------------------------------------- Consultas

export async function createInquiry(ctx: AppContext, input: { subject: string; body: string }) {
  if (!ctx.unitId) throw new ValidationError("ONLY_UNIT_USERS");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new ValidationError("INQUIRY_TEXT_REQUIRED");
  const id = randomUUID();
  await db.insert(inquiry).values({
    id,
    organizationId: ctx.corporateOrgId,
    businessUnitId: ctx.unitId,
    authorId: ctx.userId,
    authorName: ctx.userName,
    subject,
    body,
  });
  return { id };
}

export async function listInquiries(ctx: AppContext) {
  const where =
    ctx.appRole === "corporate_admin"
      ? eq(inquiry.organizationId, ctx.corporateOrgId)
      : eq(inquiry.businessUnitId, ctx.unitId!);
  return db
    .select({
      id: inquiry.id,
      subject: inquiry.subject,
      body: inquiry.body,
      status: inquiry.status,
      answer: inquiry.answer,
      answeredByName: inquiry.answeredByName,
      answeredAt: inquiry.answeredAt,
      createdAt: inquiry.createdAt,
      authorName: inquiry.authorName,
      unitName: organization.name,
      unitSigla: organization.sigla,
    })
    .from(inquiry)
    .innerJoin(organization, eq(organization.id, inquiry.businessUnitId))
    .where(where)
    .orderBy(desc(inquiry.createdAt));
}

export async function answerInquiry(ctx: AppContext, id: string, answer: string) {
  if (!answer.trim()) throw new ValidationError("ANSWER_REQUIRED");
  const rows = await db
    .update(inquiry)
    .set({ answer: answer.trim(), status: "answered", answeredByName: ctx.userName, answeredAt: new Date() })
    .where(and(eq(inquiry.id, id), eq(inquiry.organizationId, ctx.corporateOrgId)))
    .returning({ id: inquiry.id });
  if (rows.length === 0) throw new NotFoundError("inquiry");
}

// ------------------------------------------------------ Duplicar evaluación

/** Copia completa de la estructura (dimensiones, indicadores, subindicadores y preguntas). */
export async function duplicateFramework(organizationId: string, frameworkId: string, name: string) {
  const [fw] = await db
    .select()
    .from(framework)
    .where(and(eq(framework.id, frameworkId), eq(framework.organizationId, organizationId)));
  if (!fw) throw new NotFoundError("framework");
  const newFwId = randomUUID();
  await db.insert(framework).values({ ...fw, id: newFwId, name: name.trim() || `${fw.name} (copia)`, createdAt: new Date(), updatedAt: new Date() });

  const dims = await db.select().from(dimension).where(eq(dimension.frameworkId, frameworkId));
  for (const d of dims) {
    const newDimId = randomUUID();
    await db.insert(dimension).values({ ...d, id: newDimId, frameworkId: newFwId });
    const inds = await db.select().from(indicator).where(eq(indicator.dimensionId, d.id));
    for (const i of inds) {
      const newIndId = randomUUID();
      await db.insert(indicator).values({ ...i, id: newIndId, dimensionId: newDimId });
      const subs = await db.select().from(subindicator).where(eq(subindicator.indicatorId, i.id));
      for (const s of subs) await db.insert(subindicator).values({ ...s, id: randomUUID(), indicatorId: newIndId });
    }
    const direct = await db.select().from(subindicator).where(eq(subindicator.dimensionId, d.id));
    for (const s of direct) await db.insert(subindicator).values({ ...s, id: randomUUID(), dimensionId: newDimId });
  }
  return { id: newFwId };
}

// ---------------------------------------------------------------- Avance

import {
  componentRegistry,
  deriveStatus,
  isAnswered,
  isElementVisible,
  naKey,
  statusKey,
  type FormElement,
  type ResponseAnswers,
} from "@plataforma-csa/sdk-core";
import { blockAppliesToUnit, getEvaluationForBusinessUnit } from "./business-unit-access.js";
import { listResponses } from "./response-service.js";
import { response } from "../schema/response.js";

const QUESTION_TYPES = new Set<string>(componentRegistry.filter((c) => c.isQuestion).map((c) => c.type));
const isQuestionEl = (el: FormElement) => QUESTION_TYPES.has(el.type);

export interface OverviewRow {
  unitId: string;
  unitName: string;
  unitSigla: string | null;
  subindicatorId: string;
  dimension: string;
  indicator: string | null;
  title: string;
  responsibleId: string | null;
  responsible: string | null;
  total: number;
  answered: number;
  completed: number;
  approved: number;
  submitted: number;
  returned: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Avance por unidad y bloque, con responsable y trazabilidad (solo administrador corporativo). */
export async function getOverview(evaluationId: string, corporateOrgId: string): Promise<OverviewRow[]> {
  const units = (await listUnits(corporateOrgId)).filter((u) => u.active);
  const out: OverviewRow[] = [];
  await Promise.all(units.map(async (unit) => {
    const [filtered, responses, blocks] = await Promise.all([
      getEvaluationForBusinessUnit(evaluationId, unit.id).catch(() => null),
      listResponses(evaluationId, unit.id),
      listBlocks(evaluationId, unit.id),
    ]);
    if (!filtered) return;
    const bySub = new Map(responses.map((r) => [r.subindicatorId, r]));
    const respBy = new Map(blocks.map((b) => [b.subindicatorId, b]));
    const snap = filtered.snapshot as EvaluationSnapshot;
    const visit = (dim: Snap, ind: string | null, sub: Snap["subindicators"][number]) => {
      const row = bySub.get(sub.id);
      const answers = ((row?.answers as ResponseAnswers | undefined) ?? {}) as ResponseAnswers;
      const questions = (sub.formSchema?.elements ?? []).filter(
        (el) => isQuestionEl(el) && isElementVisible(el.visibleIf, answers),
      );
      if (questions.length === 0) return;
      let answered = 0, completed = 0, approved = 0, submitted = 0, returned = 0;
      for (const q of questions) {
        const na = answers[naKey(q.id)] as string | undefined;
        const ok = isAnswered(answers[q.id], na);
        const st = deriveStatus(answers[statusKey(q.id)] as string | undefined, ok);
        if (ok) answered++;
        if (st === "completed" || st === "approved" || st === "submitted") completed++;
        if (st === "approved" || st === "submitted") approved++;
        if (st === "submitted") submitted++;
        if (answers[`${q.id}::review`] && (st === "not_started" || st === "in_progress")) returned++;
      }
      const b = respBy.get(sub.id);
      out.push({
        unitId: unit.id,
        unitName: unit.name,
        unitSigla: unit.sigla,
        subindicatorId: sub.id,
        dimension: dim.title,
        indicator: ind,
        title: sub.title,
        responsibleId: b?.userId ?? null,
        responsible: b?.userName ?? null,
        total: questions.length,
        answered,
        completed,
        approved,
        submitted,
        returned,
        updatedBy: row?.updatedByName ?? null,
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      });
    };
    for (const dim of snap.dimensions) {
      for (const ind of dim.indicators) for (const sub of ind.subindicators) visit(dim, ind.title, sub);
      for (const sub of dim.subindicators) visit(dim, null, sub);
    }
  }));
  void response;
  // Orden estable: el de las unidades (por nombre).
  const order = new Map(units.map((u, i) => [u.id, i]));
  return out.sort((x, y) => (order.get(x.unitId) ?? 0) - (order.get(y.unitId) ?? 0));
}

export async function getCurrentEvaluation(corporateOrgId: string) {
  const [row] = await db
    .select({
      id: evaluation.id,
      frameworkId: evaluation.frameworkId,
      title: evaluation.title,
      dueDate: evaluation.dueDate,
      publishedAt: evaluation.publishedAt,
    })
    .from(evaluation)
    .where(eq(evaluation.organizationId, corporateOrgId))
    .orderBy(desc(evaluation.publishedAt))
    .limit(1);
  return row ?? null;
}

/** Datos crudos para consolidar: snapshot completo + respuestas de todas las unidades. */
export async function getConsolidationData(evaluationId: string, corporateOrgId: string) {
  const [ev] = await db
    .select()
    .from(evaluation)
    .where(and(eq(evaluation.id, evaluationId), eq(evaluation.organizationId, corporateOrgId)));
  if (!ev) throw new NotFoundError("evaluation");
  const units = (await listUnits(corporateOrgId)).filter((u) => u.active);
  const rows = await db.select().from(response).where(eq(response.evaluationId, evaluationId));
  return {
    title: ev.title,
    snapshot: ev.snapshot as EvaluationSnapshot,
    units,
    responses: rows.map((r) => ({
      unitId: r.businessUnitOrganizationId,
      subindicatorId: r.subindicatorId,
      answers: r.answers as ResponseAnswers,
    })),
  };
}

/** Cierra la evaluación: desde ahora no se admiten más respuestas. */
export async function closeEvaluation(corporateOrgId: string, evaluationId: string) {
  const rows = await db
    .update(evaluation)
    .set({ dueDate: new Date() })
    .where(and(eq(evaluation.id, evaluationId), eq(evaluation.organizationId, corporateOrgId)))
    .returning({ id: evaluation.id });
  if (rows.length === 0) throw new NotFoundError("evaluation");
}

/** La evidencia pertenece a una respuesta de esta unidad en esta evaluación. */
export async function unitOwnsEvidenceKey(evaluationId: string, unitId: string, key: string): Promise<boolean> {
  const rows = await db
    .select({ answers: response.answers })
    .from(response)
    .where(and(eq(response.evaluationId, evaluationId), eq(response.businessUnitOrganizationId, unitId)));
  return rows.some((r) => JSON.stringify(r.answers).includes(JSON.stringify(key)));
}

export async function evaluationBelongsToOrg(evaluationId: string, corporateOrgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: evaluation.id })
    .from(evaluation)
    .where(and(eq(evaluation.id, evaluationId), eq(evaluation.organizationId, corporateOrgId)));
  return !!row;
}
