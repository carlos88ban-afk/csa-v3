# Requisitos no funcionales (NFR)

| ID | Requisito | Justificación |
|---|---|---|
| NFR-1 | ~20 usuarios concurrentes máximo | No sobredimensionar: descarta microservicios, colas, cache distribuido, etc. desde el día uno |
| NFR-2 | Sin cold start ni suspensión por inactividad | La app debe sentirse en tiempo real; descarta Render free, Railway free, Fly.io free (ver `stack.md`) |
| NFR-3 | Stack de plan gratuito estable, open source, bajo costo de migración | Presupuesto $0 mientras el proyecto sea de uso interno (ver `VISION.md`); toda elección debe justificar por qué se descartaron alternativas |
| NFR-4 | PostgreSQL para datos estructurados, S3-compatible para binarios. Prohibido guardar binarios en la BD | Rendimiento, costo, y separación de responsabilidades |
| NFR-5 | WCAG 2.2 AA, base para i18n futura | Accesibilidad no es opcional; i18n se diseña pero no se implementa en M0–M12 (ver `SCOPE.md`) |
| NFR-6 | Sensación de tiempo real | UI optimista + polling ligero; no se justifica WebSockets/SSE con 20 usuarios concurrentes |

## Riesgos aceptados y monitoreados

Estos NFR se cumplen dentro de límites de free tier que tienen topes conocidos. Ver `RISKS.md` para el registro vivo; resumen al 2026-08-04:

- **Neon (NFR-3, NFR-2):** auto-suspend tras ~5 min de inactividad, resume en ~1-2s (no viola NFR-2 en la práctica). Tope de **100 CU-hours/mes y 0.5GB de storage** — al superarlo, el proyecto se suspende hasta el siguiente ciclo de facturación. Con 20 usuarios es improbable, pero se monitorea. Ver `adr/0002-database-neon.md`.
- **Cloudflare R2 (NFR-3, NFR-4):** free tier de 10GB perpetuo. Estimado de uso real: ~15GB (20 usuarios × evidencias de evaluación) → ~5GB de excedente a $0.015/GB/mes (~$0.08–0.15/mes). Egress siempre gratuito, sin límite. Ver `adr/0003-object-storage-cloudflare-r2.md`.
- **Vercel Hobby (NFR-3):** válido únicamente mientras el proyecto sea de uso interno/no comercial — el plan Hobby prohíbe uso comercial en su ToS. Si el proyecto se comercializa, esta ADR debe revisarse (migrar a Vercel Pro $20/mes u otra alternativa). Ver `adr/0001-hosting-nextjs-vercel-hobby.md`.
