import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { evaluation } from "./evaluation.js";

// Motor engine/persistence v1 (ver docs/engines/persistence.md). Una fila por
// (Evaluación, Subindicador) — mismo grano que `formSchema` en subindicator.
// `subindicatorId` es intencionalmente SIN foreign key hacia subindicator.id:
// la Evaluación es un snapshot congelado (engine/publishing), el Subindicador
// original puede editarse/borrarse después de publicar sin afectar Respuestas
// ya guardadas. `response-service.ts` valida contra el snapshot en su lugar.

export const response = pgTable(
  "response",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluation.id, { onDelete: "cascade" }),
    subindicatorId: text("subindicator_id").notNull(),
    answers: jsonb("answers").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("response_evaluationId_idx").on(table.evaluationId),
    unique("response_evaluationId_subindicatorId_unique").on(table.evaluationId, table.subindicatorId),
  ],
);
