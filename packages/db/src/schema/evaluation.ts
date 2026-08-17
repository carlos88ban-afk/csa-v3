import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization } from "./auth.js";
import { framework } from "./domain.js";

// Motor engine/publishing v1 (ver docs/engines/publishing.md). `snapshot`
// guarda una copia completa e inmutable del árbol Framework→Dimensión→
// Indicador→Subindicador tomada al publicar — no un puntero a
// revisionNumber, porque el schema actual no conserva historial de
// formSchema (ver "Decisión central" en la spec).

export const evaluation = pgTable(
  "evaluation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    frameworkId: text("framework_id")
      .notNull()
      .references(() => framework.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    title: text("title").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    // VS-052 (docs/domain/business-units.md, "Plazo de recepción (dueDate) y
    // comportamiento del banner"): nullable = sin plazo (comportamiento
    // histórico). Una vez fijado, solo se actualiza a fechas futuras — nunca
    // vuelve a `null` (el bloqueo de escritura y el banner se derivan de
    // comparar now contra este campo en cada request).
    dueDate: timestamp("due_date"),
    contactEmail: text("contact_email"),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("evaluation_organizationId_idx").on(table.organizationId),
    index("evaluation_frameworkId_idx").on(table.frameworkId),
    unique("evaluation_token_unique").on(table.token),
  ],
);
