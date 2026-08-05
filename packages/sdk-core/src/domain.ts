import { z } from "zod";
import { formSchema, type FormSchema } from "./form-schema.js";

// Contratos compartidos del modelo core (ver docs/domain/evaluation-hierarchy.md).
// SDK-first: tanto la API (apps/web) como el futuro Builder (M3) consumen
// estos tipos/schemas, no duplican su propia validación.

export const createFrameworkInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateFrameworkInput = z.infer<typeof createFrameworkInput>;

export const updateFrameworkInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateFrameworkInput = z.infer<typeof updateFrameworkInput>;

export const createDimensionInput = z.object({
  frameworkId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});
export type CreateDimensionInput = z.infer<typeof createDimensionInput>;

export const updateDimensionInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateDimensionInput = z.infer<typeof updateDimensionInput>;

export const createIndicatorInput = z.object({
  dimensionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});
export type CreateIndicatorInput = z.infer<typeof createIndicatorInput>;

export const updateIndicatorInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateIndicatorInput = z.infer<typeof updateIndicatorInput>;

export const createSubindicatorInput = z.object({
  indicatorId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
});
export type CreateSubindicatorInput = z.infer<typeof createSubindicatorInput>;

export const updateSubindicatorInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  formSchema: formSchema.optional(),
});
export type UpdateSubindicatorInput = z.infer<typeof updateSubindicatorInput>;

export interface Framework {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Dimension {
  id: string;
  organizationId: string;
  frameworkId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Indicator {
  id: string;
  organizationId: string;
  dimensionId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subindicator {
  id: string;
  organizationId: string;
  indicatorId: string;
  title: string;
  description: string | null;
  formSchema: FormSchema | null;
  revisionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}
