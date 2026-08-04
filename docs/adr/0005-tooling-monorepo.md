# 0005 — Tooling: pnpm + Turborepo + TypeScript strict

Estado: Accepted (implementado en VS-001, 2026-08-04)

## Contexto

El proyecto crecerá en módulos (`sdk-core`, motores, apps) durante años. Se necesita un monorepo simple, sin sobre-ingeniería, con typecheck estricto por paquete y caché de tareas.

## Decisión

pnpm workspaces + Turborepo para orquestación de `build`/`test`/`typecheck`/`lint`, TypeScript en modo `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) como base compartida (`tsconfig.base.json`), Vitest para unit tests, Playwright para e2e (se añade cuando exista una app real que probar).

## Alternativas descartadas

- **Nx:** más potente pero sobredimensionado para el tamaño de este proyecto (NFR-1); curva de aprendizaje y superficie de configuración innecesarias.
- **Jest + Cypress:** más pesados en tiempo de ejecución y configuración que Vitest + Playwright para un proyecto JS/TS-nativo.

## Consecuencias

- `pnpm build && pnpm test && pnpm typecheck` (alias `pnpm slice:close`) es el gate de cierre de cada vertical slice.
- Cada paquete nuevo (`packages/*`, `apps/*`) hereda `tsconfig.base.json` y expone los scripts `build`/`test`/`typecheck`/`lint` para que Turborepo los orqueste automáticamente.

## Riesgos monitoreados

Ninguno. Verificado en verde en CI local el 2026-08-04 (`packages/sdk-core`).
