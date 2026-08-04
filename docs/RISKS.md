# Riesgos

Registro vivo. Actualizar al detectar, mitigar o cerrar un riesgo.

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Estado |
|---|---|---|---|---|---|
| R-001 | Neon: superar 100 CU-hours/mes o 0.5GB → suspensión hasta el siguiente ciclo de facturación | Baja (20 usuarios) | Alto (app caída) | Monitorear consumo de CU-hours desde el primer mes en producción; plan de contingencia en `adr/0002` | Abierto — monitoreado |
| R-002 | Vercel Hobby prohíbe uso comercial | Baja (proyecto es uso interno) | Alto (suspensión de cuenta) si el proyecto se comercializa sin migrar plan | Revisar `VISION.md`/`SCOPE.md` antes de cualquier cambio hacia modelo comercial | Abierto — condicional |
| R-003 | R2: crecimiento de evidencias muy por encima de la estimación de 15GB | Baja | Bajo (costo marginal, $0.015/GB/mes) | Revisar consumo real tras M8 (evidencias) | Abierto — bajo impacto |
| R-004 | Cambios de política no anunciados en proveedores free tier (precedente: Oracle Cloud recortó su Always Free a la mitad sin aviso en jun-2026) | Media | Medio | Revisar trimestralmente los términos de Vercel/Neon/R2 contra lo documentado en `architecture/stack.md` | Abierto — vigilancia periódica |

## Cerrados

_Ninguno aún._
