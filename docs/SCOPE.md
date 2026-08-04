# Alcance

## Dentro de alcance

- Builder no-code jerárquico (Framework → Dimensión → Indicador → Subindicador → Elementos).
- Motor de formularios metadata-driven con componentes pluggable y versionados.
- Publicación de evaluaciones y respuesta vía enlaces seguros.
- Autosave de progreso, adjuntos de evidencia (Cloudflare R2).
- Exportación de resultados.
- RBAC básico (dueño / editor / evaluador).
- Multi-tenant a nivel de Organización.

## Fuera de alcance (por ahora)

- Microservicios / infraestructura distribuida — ver [`architecture/overview.md`](architecture/overview.md), se descarta explícitamente por sobredimensionado para ~20 usuarios concurrentes.
- Internacionalización completa (i18n) — se diseña la base (NFR-5) pero no se implementan traducciones en M0–M12.
- Analítica avanzada / BI sobre resultados — solo exportación básica.
- Integraciones con terceros (SSO externo, Slack, etc.) — no está en el roadmap M0–M12.
- Monetización / facturación — el proyecto es de uso interno, no comercial (ver `VISION.md`).

## Revisar si cambia

Si el proyecto pasa a ser comercial, o si el número de usuarios concurrentes crece significativamente por encima de ~20, este documento y `architecture/requirements.md` deben revisarse antes de continuar el roadmap.
