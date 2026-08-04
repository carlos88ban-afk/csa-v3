# Plataforma CSA — Constructor de Evaluaciones Empresariales

Plataforma SaaS no-code para construir, publicar y gestionar evaluaciones empresariales configurables (ESG, CSA, ISO, auditorías, checklists, autoevaluaciones, etc.) sin escribir código.

## Estado

En fase de gobierno y diseño (M0). Ver `docs/checkpoints/CHECKPOINT.md` para el estado exacto y `docs/ROADMAP.md` para el plan completo.

## Documentación

Toda decisión de producto y arquitectura vive en `docs/`. La documentación es la única fuente de verdad: ante cualquier discrepancia entre código y documentación, se corrige primero la documentación.

Empieza por:

- [`docs/README.md`](docs/README.md) — índice de la documentación
- [`docs/VISION.md`](docs/VISION.md)
- [`docs/architecture/overview.md`](docs/architecture/overview.md)
- [`docs/adr/`](docs/adr/) — decisiones arquitectónicas

## Desarrollo

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Estructura

```
apps/        # aplicaciones desplegables (Next.js, cuando exista)
packages/    # paquetes compartidos (sdk-core, engines, ui...)
docs/        # gobierno del proyecto: visión, ADRs, roadmap, checkpoints
```
