import { getEvaluation, listResponses, requireActiveMember } from "@plataforma-csa/db";
import type { EvaluationSnapshot, ResponseAnswers } from "@plataforma-csa/sdk-core";
import { toErrorResponse } from "@/lib/api-errors";
import { buildExportRows, EXPORT_HEADER, sanitizeExportFilename } from "@/lib/evaluation-export";

// Motor engine/export v1 (ver docs/engines/export.md). Autenticado y
// tenant-scoped (a diferencia de persistence.md/evidences.md): exportar es
// una acción de revisión del administrador sobre datos de su propia
// Organización, no algo que el evaluado (sin cuenta) necesite hacer.
//
// La lógica de serialización de cada tipo de pregunta vive en
// @/lib/evaluation-export.ts, compartida con el export XLSX consolidado de
// evaluaciones en modo corporativo (VS-055, docs/domain/business-units.md).

interface Params {
  params: Promise<{ id: string }>;
}

// RFC 4180: comillas alrededor de cualquier valor con coma, comilla o salto
// de línea; las comillas internas se duplican. Sin librería — es una función
// de pocas líneas, no justifica una dependencia nueva (NFR-3).
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildCsv(snapshot: EvaluationSnapshot, answersBySub: Map<string, ResponseAnswers>): string {
  const rows = [EXPORT_HEADER, ...buildExportRows(snapshot, answersBySub)];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `﻿${body}`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { organizationId } = await requireActiveMember(request.headers);
    const evaluation = await getEvaluation(organizationId, id);
    if (!evaluation) return Response.json({ error: "evaluation_NOT_FOUND" }, { status: 404 });

    const responses = await listResponses(evaluation.id);
    const answersBySub = new Map(responses.map((r) => [r.subindicatorId, r.answers as ResponseAnswers]));
    const csv = buildCsv(evaluation.snapshot as EvaluationSnapshot, answersBySub);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitizeExportFilename(evaluation.title)}.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
