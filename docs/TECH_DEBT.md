# Deuda técnica

Deuda aceptada conscientemente, con razón y plan de pago. No incluir aquí trabajo simplemente "pendiente" (eso va en `BACKLOG.md`).

| ID | Deuda | Por qué se aceptó | Plan de pago |
|---|---|---|---|
| TD-001 | `drizzle-kit push` en vez de migraciones versionadas (`generate`/`migrate`) | Proyecto en etapa temprana, un solo entorno (Neon real), sin necesidad de rollback histórico todavía | Migrar a migraciones versionadas antes de tener un segundo entorno (staging) o colaboradores adicionales tocando el esquema |
| TD-002 | Tests de `packages/db` corren contra el proyecto Neon de producción, no una BD de test aislada | No había Docker ni un segundo proyecto Neon disponible al implementar VS-003; decisión explícita del responsable del proyecto (2026-08-04) | Si se provisiona un segundo proyecto Neon (o rama de Neon) para test, migrar los tests a apuntar ahí — ver `docs/RISKS.md` R-005 |
