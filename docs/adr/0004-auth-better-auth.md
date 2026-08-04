# 0004 — Autenticación: Better Auth

Estado: Proposed

## Contexto

Se requiere autenticación multi-tenant (Organización → Usuario) con RBAC básico (dueño / editor / evaluador), sin costo recurrente, y sin depender de un proveedor externo que pueda encarecerse al crecer.

## Decisión

Better Auth: librería open source, self-hosted en las mismas tablas de Postgres del proyecto.

## Alternativas descartadas

- **Auth0:** modelo de precio que escala rápido con usuarios activos — contradice NFR-3 a mediano plazo.
- **Clerk:** núcleo propietario, dependencia de un proveedor externo para algo tan central como auth.

## Consecuencias

- Sin costo recurrente, sin límite de usuarios activos.
- Responsabilidad de mantenimiento de seguridad de auth recae en el proyecto (mitigado: Better Auth es una librería activa y auditada por su comunidad, no una implementación propia desde cero).

## Riesgos monitoreados

Ninguno crítico identificado a la fecha (2026-08-04). Revisar madurez y mantenimiento activo del proyecto Better Auth antes de VS-003 (slice de Auth).
