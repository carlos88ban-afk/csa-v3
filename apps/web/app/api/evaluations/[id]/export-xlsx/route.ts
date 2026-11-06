import ExcelJS from "exceljs";
import {
  getEvaluation,
  getEvaluationForBusinessUnit,
  getAssignmentForBusinessUnit,
  getConsolidationData,
  listResponses,
  listUnits,
  requireCorporateAdmin,
} from "@plataforma-csa/db";
import type { EvaluationSnapshot, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";
import { buildConsolidation } from "@/lib/consolidation";
import { buildExportRows, EXPORT_HEADER, sanitizeExportFilename } from "@/lib/evaluation-export";

// VS-055 (docs/domain/business-units.md, "Exportación consolidada"): export
// XLSX multi-pestaña para Evaluaciones en modo corporativo (con al menos
// una unidad de negocio asignada) — pestaña "Consolidado" (todas las
// unidades, con columna Unidad de negocio) + una pestaña por unidad
// (mismo formato que el CSV de siempre, respetando sus exclusiones). El
// export CSV existente (export/route.ts) sigue siendo el camino para
// Evaluaciones sin unidades de negocio — no se toca.
//
// Solo la organización matriz puede pedirlo: `getEvaluation(organizationId,
// id)` ya tenant-scopea a la organización dueña de la Evaluación — una
// unidad de negocio (que no es la dueña) recibe 404 acá, mismo criterio que
// el resto del dominio.

interface Params {
  params: Promise<{ id: string }>;
}

// Nombres de hoja de Excel: máx. 31 caracteres, sin \ / ? * [ ] : — se
// truncan y sanitizan; duplicados (dos unidades con nombre idéntico tras
// sanitizar) se desambiguan con un sufijo numérico.
function sheetName(raw: string, usedNames: Set<string>): string {
  const base = raw.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Unidad";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const suffixStr = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - suffixStr.length)}${suffixStr}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function writeSheet(workbook: ExcelJS.Workbook, name: string, header: string[], rows: string[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((col) => {
    col.width = 24;
  });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { corporateOrgId: organizationId } = await requireCorporateAdmin(request.headers);

    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const unitList = (await listUnits(organizationId)).filter((u) => u.active);
    const assignments: Array<{ businessUnitOrganizationId: string }> = [];
    for (const u of unitList) {
      if (await getAssignmentForBusinessUnit(id, u.id)) assignments.push({ businessUnitOrganizationId: u.id });
    }
    const nameById = new Map(unitList.map((u) => [u.id, u.sigla ? `${u.sigla} - ${u.name}` : u.name]));

    // Primera pasada: resolver el snapshot filtrado + respuestas de cada
    // unidad ANTES de escribir ninguna hoja, para poder escribir
    // "Consolidado" primero (ExcelJS agrega hojas en el orden en que se
    // llama a addWorksheet — no hay forma de insertar una hoja antes de
    // otra ya creada).
    const perUnit = await Promise.all(
      assignments.map(async (assignment) => {
        const unitName = nameById.get(assignment.businessUnitOrganizationId) ?? assignment.businessUnitOrganizationId;
        const [filteredEvaluation, responses] = await Promise.all([
          getEvaluationForBusinessUnit(id, assignment.businessUnitOrganizationId),
          listResponses(id, assignment.businessUnitOrganizationId),
        ]);
        const answersBySub = new Map(responses.map((r) => [r.subindicatorId, r.answers as ResponseAnswers]));
        const rows = buildExportRows(filteredEvaluation.snapshot as EvaluationSnapshot, answersBySub);
        return { unitName, rows };
      }),
    );

    const workbook = new ExcelJS.Workbook();
    const data = await getConsolidationData(id, organizationId);
    const consolidation = buildConsolidation(data.snapshot, data.units, data.responses);
    writeSheet(
      workbook,
      "Consolidación corporativa",
      ["Dimensión", "Indicador", "Bloque", "Pregunta", "Regla", "Consolidado", "Unidades que respondieron", "Aportes por unidad"],
      consolidation.map((r) => [r.dimension, r.indicator, r.block, r.question, r.rule, r.value, `${r.answeredUnits}/${r.applicableUnits}`, r.contributions]),
    );
    const consolidatedRows = perUnit.flatMap(({ unitName, rows }) => rows.map((row) => [unitName, ...row]));
    writeSheet(workbook, "Detalle por unidad", ["Unidad de negocio", ...EXPORT_HEADER], consolidatedRows);

    const usedNames = new Set<string>();
    for (const { unitName, rows } of perUnit) {
      writeSheet(workbook, sheetName(unitName, usedNames), EXPORT_HEADER, rows);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${sanitizeExportFilename(evaluation.title)}-consolidado.xlsx"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
