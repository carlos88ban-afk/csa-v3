import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization } from "./auth.js";
import { evaluation } from "./evaluation.js";

// Motor engine/persistence v1 (ver docs/engines/persistence.md). Una fila por
// (Evaluación, Subindicador, Unidad de negocio) — mismo grano que
// `formSchema` en subindicator. `subindicatorId` es intencionalmente SIN
// foreign key hacia subindicator.id: la Evaluación es un snapshot congelado
// (engine/publishing), el Subindicador original puede editarse/borrarse
// después de publicar sin afectar Respuestas ya guardadas.
// `response-service.ts` valida contra el snapshot en su lugar.
//
// VS-051 (docs/domain/business-units.md, "Aislamiento de progreso entre
// unidades"): `businessUnitOrganizationId` es NOT NULL con un valor siempre
// real — `evaluation.organizationId` (la organización dueña) cuando la
// Evaluación no tiene unidades de negocio asignadas, o la unidad de negocio
// real cuando sí las tiene. Se descartó nullable: Postgres trata cada NULL
// de una columna en un unique compuesto como NO-igual a cualquier otro NULL,
// así que con la columna nullable dos filas con el mismo
// `(evaluationId, subindicatorId)` y ambas NULL no violarían el unique,
// permitiendo filas duplicadas para evaluaciones sin unidades — justo el
// invariante que se quería preservar. Con un valor no-nulo siempre presente,
// la igualdad estándar deduplica correctamente en ambos casos sin casos
// especiales.

export const response = pgTable(
  "response",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluation.id, { onDelete: "cascade" }),
    subindicatorId: text("subindicator_id").notNull(),
    businessUnitOrganizationId: text("business_unit_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    answers: jsonb("answers").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("response_evaluationId_idx").on(table.evaluationId),
    index("response_businessUnitOrganizationId_idx").on(table.businessUnitOrganizationId),
    unique("response_evaluationId_subindicatorId_businessUnit_unique").on(
      table.evaluationId,
      table.subindicatorId,
      table.businessUnitOrganizationId,
    ),
  ],
);
