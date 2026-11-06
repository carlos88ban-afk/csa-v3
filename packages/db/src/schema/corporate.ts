import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";
import { evaluation } from "./evaluation.js";

// Responsable de un bloque (subindicador) dentro de una unidad de negocio.
// `subindicatorId` sin FK: el snapshot de la evaluación es la fuente de verdad.
export const blockAssignment = pgTable(
  "block_assignment",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => evaluation.id, { onDelete: "cascade" }),
    businessUnitId: text("business_unit_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subindicatorId: text("subindicator_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("block_assignment_unit_idx").on(t.evaluationId, t.businessUnitId),
    unique("block_assignment_unique").on(t.evaluationId, t.businessUnitId, t.subindicatorId),
  ],
);

// Mesa de ayuda interna: no forma parte de la evaluación ni se exporta.
export const inquiry = pgTable(
  "inquiry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    businessUnitId: text("business_unit_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("open"), // open | answered
    answer: text("answer"),
    answeredByName: text("answered_by_name"),
    answeredAt: timestamp("answered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("inquiry_org_idx").on(t.organizationId), index("inquiry_unit_idx").on(t.businessUnitId)],
);
