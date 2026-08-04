# 0002 — Base de datos: Neon (Postgres serverless)

Estado: Proposed

## Contexto

NFR-4 exige PostgreSQL real para datos estructurados. NFR-2/NFR-3 exigen disponibilidad estable en plan gratuito, sin sorpresas de suspensión.

## Decisión

Neon (Postgres serverless), acceso vía Drizzle ORM.

## Alternativas descartadas

- **Supabase (free):** pausa el proyecto completo tras 7 días de inactividad, requiere reactivación manual — peor que el auto-resume de Neon.
- **Render Postgres (free):** la base de datos expira tras un periodo limitado (documentación de Render inconsistente entre 30+14 días de gracia y 90 días según la fuente; en cualquier caso, no es una opción estable a largo plazo).
- **Postgres self-hosted en Oracle Cloud Always Free:** evaluado en profundidad. Sin topes de cómputo ni auto-suspend, pero Oracle recortó su cuota Always Free a la mitad (de 4 OCPU/24GB a 2 OCPU/12GB) en junio 2026 **sin previo aviso** — varios usuarios se enteraron cuando sus instancias se apagaron. Este patrón de cambios de política no anunciados se consideró un riesgo mayor y menos predecible que el tope conocido de Neon. Descartado 2026-08-04 tras discusión explícita con el responsable del proyecto.
- **MongoDB u otra BD no relacional:** viola NFR-4 directamente.

## Consecuencias

- Cero mantenimiento de servidor, backups y parches a cargo de Neon.
- Auto-suspend tras ~5 min de inactividad; resume en ~1-2s en el primer request — aceptable para NFR-2 en la práctica (no es un cold start de ~1 min como Render).

## Riesgos monitoreados

Free tier con tope de **100 CU-hours/mes y 0.5GB de storage** (duplicado desde 50 CU-h en oct-2025 — puede volver a cambiar). Al superar el tope, el proyecto se suspende hasta el siguiente ciclo de facturación o hasta añadir tarjeta. Con ~20 usuarios concurrentes se estima muy improbable alcanzarlo, pero debe monitorearse el consumo de CU-hours desde el primer mes en producción (`../RISKS.md`). Plan de contingencia: si se acerca al tope, evaluar Neon paid tier o migrar a Postgres self-hosted con mejor presupuesto operativo.
