export interface Me {
  userId: string;
  name: string;
  email: string;
  appRole: "corporate_admin" | "unit_admin" | "evaluator";
  unitId: string | null;
  unitName: string | null;
  unitSigla: string | null;
}

export const ROLE_LABEL: Record<Me["appRole"], string> = {
  corporate_admin: "Administrador corporativo",
  unit_admin: "Administrador de unidad",
  evaluator: "Evaluador",
};

export const HOME_BY_ROLE: Record<Me["appRole"], string> = {
  corporate_admin: "/evaluations",
  unit_admin: "/mi-evaluacion",
  evaluator: "/mi-evaluacion",
};
