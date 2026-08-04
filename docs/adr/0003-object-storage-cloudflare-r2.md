# 0003 — Almacenamiento de archivos: Cloudflare R2

Estado: Proposed

## Contexto

NFR-4 prohíbe guardar binarios en la base de datos; se requiere almacenamiento de objetos S3-compatible para evidencias adjuntas a Respuestas. Estimado real de uso: ~15GB totales para 20 usuarios completando evaluaciones con evidencias adjuntas.

## Decisión

Cloudflare R2 (API compatible con S3).

## Alternativas descartadas

- **AWS S3:** su free tier expira a los 12 meses (no perpetuo), y cobra egress (descarga de archivos) desde el primer byte fuera del free tier — impredecible para un caso de uso donde evaluadores descargan evidencias con frecuencia.
- **Azure Blob Storage:** aunque la organización ya usa Azure, su free tier es mínimo (~5GB durante 12 meses en cuenta nueva, no perpetuo) y también cobra egress por GB — mismo problema que S3. Descartado explícitamente pese a la conveniencia de "ya tener la cuenta", porque el requisito central (evitar costos impredecibles) no se cumple.
- **Backblaze B2:** viable pero con menor adopción/comunidad que R2.

## Consecuencias

- 10GB de storage gratis **sin caducar** (a diferencia de S3), y **egress siempre gratuito, sin límite** — la ventaja decisiva frente a S3 y Azure.
- Con ~15GB reales, ~5GB quedan fuera del free tier.

## Riesgos monitoreados

Costo estimado por el excedente de 5GB: $0.015/GB/mes ≈ **$0.08–0.15/mes**. Costo residual, no un riesgo de facturación sorpresiva — se documenta como aceptado, no como bloqueante. Revisar si el volumen real de evidencias crece muy por encima de la estimación de 15GB.
