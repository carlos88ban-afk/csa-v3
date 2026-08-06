# Decisiones

Las decisiones arquitectónicas formales del stack viven como ADRs en [`docs/adr/`](../adr/) (formato Nygard, una por archivo) — ese es el registro canónico, no se duplica aquí. Este archivo registra decisiones de **proceso y gobierno** que no ameritan una ADR completa.

### 2026-08-04 — Documentación como única fuente de verdad

**Contexto:**
- Proyecto de largo plazo (años); riesgo de que código y documentación diverjan.

**Decisión:**
- Ante cualquier discrepancia entre código y documentación, se corrige primero la documentación, después el código. No se implementa nada sin especificación previa en `docs/`.

**Consecuencias:**
- ✅ El proyecto se puede retomar meses después sin perder contexto (ver `checkpoints/CHECKPOINT.md`).
- ❌ Más disciplina requerida por slice (doc-first añade fricción a cambios rápidos).

### 2026-08-04 — Despliegue a Vercel adelantado antes de M6 (VS-009)

**Contexto:**
- Según `ROADMAP.md`, la publicación real (dominio, enlaces seguros) es M6/VS-009, y el proyecto está en M4 (VS-007). El usuario pidió ver la UI en una URL real ya, sin esperar a VS-009.

**Decisión:**
- Se conecta el repo a Vercel (plan Hobby, `adr/0001`) y se despliega el estado actual (auth + builder jerárquico) ahora. Esto es únicamente exponer el hosting — la funcionalidad de "publicación con enlaces seguros" de VS-009 (control de acceso a evaluaciones publicadas) sigue sin implementar y sigue en el backlog en su orden original.

**Consecuencias:**
- ✅ El usuario puede verificar visualmente el progreso en producción desde ya.
- ❌ La URL de Vercel queda accesible sin las protecciones de publicación que diseñará VS-009 — aceptable porque hoy sólo expone auth + CRUD de organización propia, sin datos de terceros ni evaluaciones publicadas.

### 2026-08-05 — Sistema de diseño UI adelantado antes de M12

**Contexto:**
- `docs/slices/VS-006.md` había marcado "diseño visual pulido" explícitamente fuera de alcance hasta M12. El usuario pidió mejorar la UI ahora, después de cerrar VS-009 (M6).

**Decisión:**
- Se construye un sistema de diseño (paleta, tipografía, layout — ver `../architecture/design-system.md`) y se aplica a las 9 pantallas existentes, sin esperar a M12. Sin librería de estilos nueva (CSS nativo de Next.js) para no introducir una dependencia sin justificar. Sin cambios de comportamiento — solo visual/estructural.

**Consecuencias:**
- ✅ El producto se ve terminado antes en las demos, sin bloquear el roadmap funcional (M7+ sigue en su orden).
- ❌ Cada pantalla nueva de aquí en adelante debe seguir el sistema de diseño ya establecido, no HTML semántico mínimo como hasta VS-009 — más superficie a mantener consistente por slice.

### 2026-08-05 — Límite de verificación manual con múltiples cuentas (VS-014, RBAC)

**Contexto:**
- VS-014 (permisos dueño/editor/evaluador) necesitaría, para una verificación 100% realista, una segunda cuenta de prueba aceptando una invitación y probando que la escritura le sea rechazada.
- El agente de IA que ejecuta este proyecto opera bajo una regla de seguridad sin excepciones: nunca escribe una contraseña en ningún formulario ni la envía por API, ni siquiera para crear una cuenta de prueba desechable.

**Decisión:**
- La verificación manual de RBAC en producción se detiene en lo que no requiere una segunda contraseña: crear la invitación, confirmar que el link se genera, confirmar que la página de aceptación existe y que Better Auth rechaza a un usuario que no es el destinatario. La corrección del rechazo de escritura para `evaluador` se respalda en el test de integración de `packages/db` contra Neon real (mismo dato que usa producción), no en un click-through de dos usuarios en el navegador.

**Consecuencias:**
- ✅ No se compromete la regla de seguridad por conveniencia de verificación.
- ❌ Cualquier feature futura que dependa de multi-usuario real (RBAC, colaboración) tiene el mismo límite — el usuario humano es quien puede completar esa verificación específica si la necesita con certeza absoluta.

### 2026-08-06 — Ítem opcional/menor de AN-001 2.ª inspección: no priorizado

**Contexto:**
- `docs/BACKLOG.md` tenía un ítem "(Opcional, menor)" agrupando 5 hallazgos de la 2.ª inspección del portal S&P que no eran gaps bloqueantes: banner expandible/colapsable, sub-opciones a 2 niveles, comentario confidencial rich text (Jodit), estado por nodo en el árbol, subindicadores directos bajo dimensión. El usuario pidió revisarlo y decidir si valía la pena.

**Decisión:**
- No se prioriza ninguno de los 5 por ahora. Evaluación caso por caso:
  - **Banner expandible** — costo bajo, valor cosmético; sin banners largos reales en uso hoy que lo justifiquen.
  - **Sub-opciones a 2 niveles** — un solo caso observado en todo el portal (declaración de 2.6.1); `subOptions` ya quedó diseñado como extensible (VS-016) si aparece un caso real futuro, no hace falta anticiparlo.
  - **Comentario confidencial rich text (Jodit)** — exigiría una dependencia nueva de UI para una mejora cosmética sobre un campo que ya funciona (textarea); mismo criterio de "no dependencia sin justificar" (NFR-3) ya aplicado en `export.md` (CSV manual sin librería).
  - **Estado por nodo en el árbol** — el progreso agregado ("% Done") + estado por pregunta (VS-018) ya cubre la necesidad a la escala real del proyecto (NFR-1, ~20 usuarios concurrentes); valor incierto frente al costo de calcular/renderizar estado agregado por rama en Builder y Runtime.
  - **Subindicadores directos bajo dimensión** — el único de los 5 con costo real (cambio de schema en `packages/db`, Builder, numeración VS-021, Runtime). Sin necesidad observada: el framework que arma el usuario no requiere ese atajo estructural, un Indicador "envoltorio" con un solo Subindicador ya resuelve el caso si llegara a hacer falta.

**Consecuencias:**
- ✅ El esfuerzo de AN-001 2.ª inspección queda cerrado sin trabajo de bajo retorno pendiente.
- ❌ Si en el futuro el usuario arma su propio framework y necesita específicamente colgar un Subindicador directo de una Dimensión (el único de los 5 con valor estructural real), habrá que reabrir ese ítem puntual — no bloqueante hoy.

### 2026-08-04 — Sistema de memoria en `docs/project_notes/` en vez de `memory/`

**Contexto:**
- Se necesita memoria institucional del proyecto persistente entre sesiones y entre distintas herramientas de IA.

**Decisión:**
- Usar `docs/project_notes/` (bugs, decisions, key_facts, issues) siguiendo el skill `project-memory`, en vez de una carpeta `memory/` separada.

**Alternativas consideradas:**
- Carpeta `memory/` en la raíz → Rechazada: se ve como tooling específico de IA, no como documentación de ingeniería estándar.

**Consecuencias:**
- ✅ Convención reconocible por cualquier desarrollador humano.
- ✅ Se integra naturalmente con el resto de `docs/` (checkpoints, ADRs).
