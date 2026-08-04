import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth.js";

// Modelo core M2 (ver docs/domain/evaluation-hierarchy.md).
// `formSchema`/`revisionNumber` en subindicator: el motor de formularios
// (elementos, condiciones) es M4 — aquí solo existe la columna, se mantiene
// null hasta VS-007.

export const framework = pgTable(
  "framework",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("framework_organizationId_idx").on(table.organizationId)],
);

export const dimension = pgTable(
  "dimension",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    frameworkId: text("framework_id")
      .notNull()
      .references(() => framework.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("dimension_organizationId_idx").on(table.organizationId),
    index("dimension_frameworkId_idx").on(table.frameworkId),
  ],
);

export const indicator = pgTable(
  "indicator",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    dimensionId: text("dimension_id")
      .notNull()
      .references(() => dimension.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("indicator_organizationId_idx").on(table.organizationId),
    index("indicator_dimensionId_idx").on(table.dimensionId),
  ],
);

export const subindicator = pgTable(
  "subindicator",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    indicatorId: text("indicator_id")
      .notNull()
      .references(() => indicator.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    formSchema: jsonb("form_schema"),
    revisionNumber: integer("revision_number").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subindicator_organizationId_idx").on(table.organizationId),
    index("subindicator_indicatorId_idx").on(table.indicatorId),
  ],
);

export const frameworkRelations = relations(framework, ({ many }) => ({
  dimensions: many(dimension),
}));

export const dimensionRelations = relations(dimension, ({ one, many }) => ({
  framework: one(framework, { fields: [dimension.frameworkId], references: [framework.id] }),
  indicators: many(indicator),
}));

export const indicatorRelations = relations(indicator, ({ one, many }) => ({
  dimension: one(dimension, { fields: [indicator.dimensionId], references: [dimension.id] }),
  subindicators: many(subindicator),
}));

export const subindicatorRelations = relations(subindicator, ({ one }) => ({
  indicator: one(indicator, { fields: [subindicator.indicatorId], references: [indicator.id] }),
}));
