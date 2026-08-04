# Stack tecnológico

Decisiones formalizadas en `adr/0001` a `adr/0005`. Este documento es el resumen vivo; si el stack cambia, se actualiza aquí y se registra una nueva ADR (nunca se edita una ADR aceptada — se supersede).

| Capa | Elegido | Alternativas descartadas y por qué |
|---|---|---|
| App / Deploy | Next.js + Vercel (Hobby) | Render free ❌ (spin-down 15min, cold start ~1min); Railway ❌ (sin free tier persistente); Fly.io ❌ (free tier eliminado en 2024 para cuentas nuevas). Válido solo mientras el proyecto sea no comercial — ver `adr/0001`. |
| BD PostgreSQL | Neon (serverless) | Supabase ⚠️ (pausa proyecto tras 7 días de inactividad); Oracle Cloud Always Free self-hosted ⚠️ (evaluado y descartado: recortó su cuota sin aviso en jun-2026, riesgo de política impredecible mayor que el tope conocido de Neon); Render DB ❌ (expira); MongoDB ❌ (viola NFR-4). Ver `adr/0002`. |
| ORM / Migraciones | Drizzle | Prisma ⚠️ (engine binario, más pesado); Knex ⚠️ (menos tipado). |
| Almacenamiento de archivos | Cloudflare R2 | AWS S3 ❌ (free tier expira a 12 meses, cobra egress); Azure Blob ❌ (free tier mínimo, cobra egress — mismo problema que S3 pese a que la organización ya usa Azure). Ver `adr/0003`. |
| Auth | Better Auth | Auth0 ❌ (pago al crecer); Clerk ⚠️ (núcleo propietario). Ver `adr/0004`. |
| Tests | Vitest + Playwright | Jest + Cypress ⚠️ (más pesados). |
| Tooling | pnpm + Turborepo + TypeScript strict | Nx ⚠️ (sobredimensionado para este alcance). Ver `adr/0005`. |

## Costo mensual estimado

$0 base + ~$0.08–0.15/mes por excedente de storage en R2 (15GB reales vs 10GB gratis). Sin costos de egress, sin costos de cómputo mientras el uso se mantenga dentro de los topes de Neon (100 CU-h/mes, 0.5GB). Ver `../RISKS.md` para el monitoreo de estos topes.
