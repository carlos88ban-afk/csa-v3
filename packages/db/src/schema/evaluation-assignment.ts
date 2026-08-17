import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization } from "./auth.js";
import { evaluation } from "./evaluation.js";

// Unidades de negocio (VS-050, ver docs/domain/business-units.md). Una
// Evaluación puede asignarse a múltiples organizaciones-unidad-de-negocio
// (cada una hija de la organización dueña de la Evaluación vía
// `organization.parentOrganizationId`) — validado en el service, no aquí,
// mismo patrón que el resto del dominio.

export const evaluationAssignment = pgTable(
  "evaluation_assignment",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluation.id, { onDelete: "cascade" }),
    businessUnitOrganizationId: text("business_unit_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("evaluation_assignment_evaluationId_idx").on(table.evaluationId),
    index("evaluation_assignment_businessUnitOrganizationId_idx").on(table.businessUnitOrganizationId),
    unique("evaluation_assignment_evaluationId_businessUnitOrganizationId_unique").on(
      table.evaluationId,
      table.businessUnitOrganizationId,
    ),
  ],
);

// Exclusiones (no inclusiones): por defecto una unidad ve todo el snapshot;
// esta tabla marca qué se le oculta. `elementId = null` excluye el
// Subindicador completo; `elementId` puntual excluye solo ese elemento
// dentro del formSchema del Subindicador. `subindicatorId`/`elementId` SIN
// foreign key — mismo patrón que `response.subindicatorId`: el snapshot
// congelado es la fuente de verdad, no las tablas de dominio vivas.
//
// Sin unique constraint a nivel DB para la fila "Subindicador completo"
// (elementId = null): Postgres trata cada NULL como distinto en un unique
// compuesto, así que no deduplicaría ese caso. La deduplicación de esa fila
// se hace en el service layer (SELECT antes de INSERT) en vez de perseguir
// un índice único parcial — más simple y suficiente para el volumen
// esperado (exclusiones administradas a mano por el admin, no en bulk).
export const evaluationAssignmentExclusion = pgTable(
  "evaluation_assignment_exclusion",
  {
    id: text("id").primaryKey(),
    evaluationAssignmentId: text("evaluation_assignment_id")
      .notNull()
      .references(() => evaluationAssignment.id, { onDelete: "cascade" }),
    subindicatorId: text("subindicator_id").notNull(),
    elementId: text("element_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("evaluation_assignment_exclusion_assignmentId_idx").on(table.evaluationAssignmentId),
  ],
);
