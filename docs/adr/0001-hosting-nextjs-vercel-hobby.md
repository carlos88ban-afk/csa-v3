# 0001 — Hosting: Next.js + Vercel (Hobby)

Estado: Proposed

## Contexto

NFR-2 exige que la app no tenga cold start ni se suspenda por inactividad. NFR-3 exige plan gratuito estable, open source cuando sea posible, y bajo costo de migración. El proyecto es de uso interno / no comercial (`../VISION.md`, confirmado 2026-08-04).

## Decisión

Next.js como framework full-stack, desplegado en Vercel plan Hobby.

## Alternativas descartadas

- **Render (free):** el servicio web se suspende tras 15 min de inactividad, con cold start de ~1 min al siguiente request — viola NFR-2 directamente.
- **Railway:** ya no ofrece un free tier persistente (solo crédito de prueba que se agota).
- **Fly.io:** eliminó su free tier permanente en 2024 para cuentas nuevas; ahora solo trial de $5/7 días.

## Consecuencias

- Sin cold start ni sleep en Hobby: cumple NFR-2.
- Límites de Hobby (timeout de función serverless, ancho de banda) son suficientes para 20 usuarios concurrentes (NFR-1).

## Riesgos monitoreados

**El plan Hobby de Vercel prohíbe explícitamente el uso comercial en su Terms of Service.** Es válido únicamente mientras el proyecto sea de uso interno / no genere ingresos, directa o indirectamente. Si el proyecto se comercializa (organizaciones externas de pago, o cualquier forma de monetización), esta ADR queda obsoleta y debe reemplazarse por una nueva decisión (Vercel Pro a $20/mes/usuario, u otra alternativa) **antes** de desplegar en producción bajo ese modelo. Verificado 2026-08-04.
