# Work Log

Registro rápido de trabajo completado por slice. No reemplaza `docs/slices/` ni `docs/CHANGELOG.md` — es una referencia rápida cronológica.

### 2026-08-14 - VS-037: Banner título/contenido + estado inicial configurable
- **Status**: Completed
- **Description**: Pedido explícito del usuario, supersede VS-025 (que había dejado "resumen vs. detalle separados" fuera de alcance). `banner` gana `content` (requerido, texto expandido) separado de `label` (título, siempre visible); `expandable` reemplazado por `startCollapsed` (estado inicial que configura el admin — el evaluado siempre retiene el toggle, sin importar el estado inicial).
- **Notes**: Migración de datos real: 10 banners en `subindicator.form_schema` + 9 en el `snapshot` congelado de la única evaluación publicada (estructura independiente, hubo que migrar ambas). Actualizados 2 editores (el builder principal VS-032 y el editor legado de subindicadores directos bajo Dimensión) + Runtime + preview, todos con la misma lógica duplicada. `pnpm typecheck`/`build`/`test` en verde.

### 2026-08-14 - Limpieza de DB de producción + 2 bugs reales del builder corregidos
- **Status**: Completed
- **Description**: Pedido explícito del usuario: reducir la base de producción a 1 usuario (`carlos88ban@gmail.com`)/1 organización/1 framework, borrando datos de verificación de slices y un leftover de e2e interrumpido. Verificación end-to-end posterior encontró y corrigió 2 bugs reales en el builder (`resolveFocus()` y sincronización de `wizardStep`, ver `bugs.md`) que el hallazgo incidental de la sesión anterior (VS-033..036) había dejado sin investigar a fondo.
- **Notes**: `apps/web/e2e/builder-publish.spec.ts` pasa completo de punta a punta ahora (estaba desactualizado desde VS-032, no solo bloqueado por los bugs reales). Verificado también a mano en producción real, no solo en local. Único fallo e2e restante: `public-runtime.spec.ts:56`, ya documentado, sin relación.

### 2026-08-14 - VS-033..VS-036: Pivote visual completo — dashboard empresarial ancho
- **Status**: Completed (arco de 4 slices)
- **Description**: Pedido explícito del usuario tras auditar espacio desaprovechado (columna ~840px dejaba ~38% del ancho vacío en 1366px). VS-033: sidebar izquierdo persistente (`AppShell`/`AppSidebar`, reemplaza `AppHeader`), `--content-width` 840→1180px, `.page--wide` 960→1280px. VS-034/035/036: `DataTable` genérico + conteos reales (dimensiones por framework, ítems por dimensión, miembros por organización) reemplazando `.entry-list` en las 3 listas administrativas principales.
- **Notes**: Doc-first (`design-system.md` reescrito antes del código). Validado con un mockup en Stitch (paleta real del proyecto) antes de tocar CSS. `pnpm build`/`test`/`typecheck` en verde para el arco completo, más un test nuevo de integración para los conteos (incluyendo el caso crítico del doble join sin inflar resultados). E2E corrido dos veces; los 2 fallos que aparecen se confirmaron pre-existentes (no introducidos por este trabajo) reproduciéndolos contra `main` sin estos cambios — uno ya documentado en `bugs.md`, el otro (wizard del builder no reconoce una Dimensión recién creada) es un hallazgo nuevo, documentado pero no arreglado en este arco (fuera de alcance: es un bug de VS-032, no del pivote de layout). Auth pages y runtime público de evaluado quedan sin sidebar automáticamente (mismo gate `useSession()` que ya tenía `AppHeader`).

### 2026-08-07 - Réplica de prueba del árbol CSA 2026 (161 subindicadores)
- **Status**: Completed (herramienta, no un slice de producto — sin ADR, sin tests automatizados)
- **Description**: Poblada una réplica de prueba de la estructura real del portal S&P Global CSA 2026 (6 dimensiones, 34 ramas, 161 subindicadores, 584 elementos de formulario) para estresar el Builder/Runtime a escala real, a pedido del usuario. Framework `"CSA 2026 — Réplica QA"` publicado en producción, dejado visible a pedido explícito del usuario (no revocado).
- **Notes**: `scripts/csa-2026-replica-data.ts` (generador programático standalone, PRNG determinista `mulberry32`, autocontenido sin imports externos — dos intentos previos de delegar la generación completa a un subagente `opencode` fallaron por límites de infraestructura del modelo gratuito vía OmniRoute; el segundo intento sí dejó una base útil — tipos + word banks — completada a mano) y `packages/db/scripts/csa-2026-replica.mts` (script de ejecución: dry-run por defecto valida cada `formSchema` contra el zod real antes de escribir nada; `--write` requiere el flag explícito, usado solo tras confirmación del usuario en el chat). Verificado end-to-end en producción real: árbol completo navegable de punta a punta, numeración jerárquica correcta incluyendo subindicadores directos bajo Dimensión (VS-029), `tabla_datos` renderiza columnas/filas, autosave confirmado, editor de comentario (VS-030) presente en cada nodo. Ambos scripts quedan en el repo como utilidad reusable para futuros stress-tests del Builder.

### 2026-08-07 - VS-030: Editor WYSIWYG (TipTap) para comentario confidencial
- **Status**: Completed
- **Description**: Trabajo nuevo (no gap de AN-001, que ya estaba cerrado desde VS-029). El usuario pidió revertir la decisión de VS-028 y adoptar un editor WYSIWYG real para paridad con el portal S&P (Jodit). Se eligió TipTap en su lugar (ver ADR 0006) — mejor integración React que Jodit literal. `commentKey` sigue guardando `string` (ahora HTML sanitizado en vez de markdown-lite), cero cambio de contrato.
- **Notes**: Bug real encontrado en el camino (no en producción, durante el propio desarrollo): el `<label>` que envolvía toda la pregunta redirigía el foco a su input asociado en cualquier click dentro de él — comportamiento nativo de `<label>`, invisible con el `<textarea>` anterior porque los controles de formulario nativos interceptan ese click. Corregido restructurando el markup de 4 tipos de elemento (texto_corto/texto_largo/numero/seleccion_desplegable). Verificado end-to-end en producción (editor, autosave, persistencia, Revisión, export CSV). Datos de prueba limpiados.

### 2026-08-06 - VS-029: Subindicadores directos bajo Dimensión
- **Status**: Completed
- **Description**: Último ítem de AN-001 2.ª inspección, el único de los 5 menores con cambio de schema. Un Subindicador puede colgar directo de una Dimensión sin Indicador intermedio — `dimensionId` nullable alternativo a `indicatorId`, CHECK XOR en Postgres. Nueva ruta Builder, árbol Runtime, Revisión y export CSV actualizados.
- **Notes**: Cambio de schema aplicado a Neon (producción) vía `db:push` con autorización explícita del usuario. Bug real encontrado y corregido en producción: guardar respuesta en un Subindicador directo fallaba (`subindicator_NOT_FOUND`) porque dos funciones de búsqueda en el snapshot no miraban `dim.subindicators` — ver `docs/project_notes/bugs.md`. Verificado end-to-end en producción. Con este slice cierra el esfuerzo completo de AN-001 (9 gaps + 5 ítems menores).

### 2026-08-06 - VS-025 a VS-028: Ítems menores de AN-001 2.ª inspección
- **Status**: Completed
- **Description**: El usuario revirtió la decisión de no-priorización del agente (registrada y superada en `docs/project_notes/decisions.md`) y pidió implementar los 5 ítems menores. Estos 4: banner expandible/colapsable, sub-opciones a 2 niveles (fijo, no recursión genérica), estado por nodo en el árbol (progreso agregado derivado), comentario confidencial con formato (markdown-lite propio, decisión explícita de no agregar dependencia de UI nueva).
- **Notes**: VS-026 (Builder+Runtime) delegado a OpenCode con el contrato ya escrito, revisado con `git diff` y verificado antes de aceptar. Los otros 3 implementados directamente. Verificado end-to-end en producción (los 4 juntos, un solo framework de prueba). Queda VS-029 (subindicadores directos bajo Dimensión) como último ítem, el único con cambio de schema — spec ya escrita en `docs/domain/evaluation-hierarchy.md`.

### 2026-08-06 - VS-024: Tabla de datos (tabla_datos)
- **Status**: Completed
- **Description**: Gap 9 de AN-001 2.ª inspección, el más grande y último de los 9. Tipo de celda definido por fila (no por celda individual) — decisión de diseño documentada antes de implementar. Primera nueva variante de `AnswerValue` desde VS-007 (mapa anidado rowId->columnId->valor). Primera vez que el motor usa `<table>` HTML nativa en Runtime.
- **Notes**: Verificado end-to-end en producción (Builder, Runtime, persistencia, export CSV — descarga autorizada explícitamente por el usuario para confirmar la serialización). Con este cierra el esfuerzo completo de AN-001 2.ª inspección (VS-022/023/024); queda solo el ítem opcional/menor en BACKLOG.md.

### 2026-08-06 - VS-022+VS-023: Select dropdown y unidad por campo numérico
- **Status**: Completed
- **Description**: Gaps 7 y 8 de AN-001 2.ª inspección. `seleccion_desplegable` (tipo de elemento nuevo, mismo `formOption`/respuesta string que `seleccion_unica`) y `unit`/`availableUnits` en `numero` (unidad elegida vía clave sintética `unitKey`). Implementados juntos (mismos archivos, ambos prerequisito de la tabla de datos).
- **Notes**: Bug real encontrado y corregido en producción — el input de `availableUnits` perdía comas/espacios al escribir por un re-render controlado que recortaba el array en cada tecla; corregido a `onBlur`. Verificado end-to-end en producción (Builder, Runtime, persistencia, export CSV). Automode del usuario: implementación directa, sin delegar a OpenCode (cambios pequeños y acoplados). Queda VS-024 (tabla de datos) como último gap de AN-001 2.ª inspección.

### 2026-08-06 - AN-001 (2.ª inspección): recorrido completo de Questionnaires CSA 2026
- **Status**: Completed
- **Description**: Segunda inspección en vivo del portal S&P (navegador automatizado, cuenta real del usuario, DOM directo). Esta vez árbol completo de Questionnaires: 34 ramas (6 dimensiones + 28 indicadores) y 161 sub-cuestionarios; sub-cuestionarios 0.1, 1.1.1 y 2.6.1 inspeccionados a nivel DOM.
- **Notes**: Confirmó los 6 gaps cerrados (VS-016 a VS-021) y descubrió **3 gaps nuevos** que el análisis del 05-08 no había visto (solo se había mirado 1.1.1, cualitativo): (1) tabla de datos numéricos `form-table` con tipo/unidad/unidades alternativas/maxlength por celda, (2) select dropdown `sims-select`, (3) unidad configurable por campo numérico. Menores: banner expandible, sub-opciones 2 niveles, rich text Jodit, estado por nodo en el árbol. Jerarquía flexible: sub-cuestionarios pueden colgar directo de la dimensión (0.1, 5.x). Documentado en `docs/analysis/csa-sp-global-comparison.md` sección "Segunda inspección". **Los 3 gaps + menores fueron priorizados por el usuario e ingresados a `docs/BACKLOG.md` ("Siguiente") el 2026-08-06** — sin especificación doc-first todavía (regla rectora: se especifica al abrir el slice).

### 2026-08-06 - VS-021: Numeración automática (árbol + preguntas)
- **Status**: Completed
- **Description**: Gap 6 de AN-001, último gap — cierra los 6 priorizados por el usuario. Numeración derivada por posición de array, no persistida (`dimensionNumber`/`indicatorNumber`/`subindicatorNumber` en `evaluation.ts`, `questionNumber` en `component-registry.ts`, reinicia por Subindicador, `instruccion`/`banner` nunca numeran).
- **Notes**: Fuera de alcance el Builder (documentado): cada página solo carga su propio nodo + hijos directos, numerar exigiría fetches en cascada. sdk-core delegado a OpenCode, `apps/web` (Runtime, Revisión, export CSV) hecho directamente. Verificado end-to-end en producción (árbol, breadcrumb, preguntas, Revisión y CSV todos con la numeración correcta). Datos de prueba limpiados. Ver `docs/domain/evaluation-hierarchy.md` y `docs/engines/form.md` sección "Numeración automática (VS-021)".

### 2026-08-06 - VS-020: Botones Save/Cancel/Reset explícitos en Runtime
- **Status**: Completed
- **Description**: Gap 5 de AN-001. Aditivo sobre el autosave existente. Cancel/Reset comparten implementación (decisión confirmada con el usuario: mismo efecto, volver al último guardado). `lastSavedBySub` (ref) trackea la última foto confirmada por el servidor para poder revertir sin recargar la página.
- **Notes**: Sin cambios en sdk-core/db, puramente estado de cliente. Incidente de infra durante el deploy: un push no generó deployment en Vercel (webhook perdido, no relacionado al código) — diagnosticado navegando el dashboard con claude-in-chrome, resuelto con Redeploy manual. Ver `docs/engines/persistence.md` sección "Botones Save/Cancel/Reset explícitos (VS-020)" y CHECKPOINT para el detalle del incidente.

### 2026-08-06 - VS-019: N/A + comentario confidencial por pregunta
- **Status**: Completed
- **Description**: Gap 4 de AN-001. Capacidad universal (no configurable) de todo Elemento tipo pregunta salvo `calculado`. Dos claves sintéticas más, `isAnswered` reemplaza `hasAnswer` en progreso/completar/export. "Confidencial" es etiqueta de UI (documentado explícitamente, no control de acceso) — se incluye en CSV por decisión del usuario.
- **Notes**: Bug real encontrado en producción y corregido: la Regla C del resguardo de VS-018 no contemplaba N/A, rechazaba "Marcar como completo" con 403. sdk-core delegado a OpenCode, `apps/web` hecho directamente. Ver `docs/engines/persistence.md` sección "N/A + comentario confidencial por pregunta (VS-019)".

### 2026-08-05 - VS-018: Estado por pregunta + flujo Approved/Submitted
- **Status**: Completed
- **Description**: Gap 3 de AN-001, alcance completo (no versión mínima). 5 estados por pregunta (2 derivados, 3 explícitos con clave sintética `::status`). Approved/Submitted son una acción nueva autenticada (`requireWriteAccess`, reutiliza RBAC de VS-014) — el lado público sin sesión solo puede marcar `completed`, con resguardo server-side (`assertPublicResponseUpdateAllowed`) que bloquea fabricar aprobaciones incluso vía fetch directo.
- **Notes**: sdk-core delegado a OpenCode (contrato completo en el doc), `packages/db`/`apps/web` hechos directamente (RBAC, rutas, página de Revisión nueva). Verificado end-to-end en producción incluyendo intento real de bypass del resguardo del servidor (403 confirmado). Ver `docs/engines/persistence.md` sección "Estado por pregunta + flujo Approved/Submitted (VS-018)".

### 2026-08-05 - VS-017: Campo URL pública (máx. N por pregunta)
- **Status**: Completed
- **Description**: Gap 2 de AN-001. Nuevo tipo de Elemento `url_publica` (`maxUrls?`, default 3), complementario a `evidencia`. Respuesta reutiliza `string[]` de `answerValue`, sin cambios en `response.ts`. Slots vacíos nunca se persisten.
- **Notes**: sdk-core delegado a OpenCode (mecánico), Builder/Runtime/export hechos directamente. Verificado end-to-end en producción (tope de `maxUrls` respetado, persistencia, CSV con URLs unidas por `"; "`). Datos de prueba limpiados. Ver `docs/engines/form.md` sección "Campo URL pública (VS-017)".

### 2026-08-05 - VS-016: Opciones anidadas en selección única/múltiple
- **Status**: Completed
- **Description**: Gap 1 de AN-001. `formOption` gana `subOptions?` (un solo nivel). Sub-opciones marcadas se guardan con clave sintética `${elementId}::${optionId}` en el mismo mapa `answers` — sin cambios en `response.ts`/`rule.ts`/schema DB. Builder con CRUD de sub-opciones, Runtime revela sub-checklist al seleccionar la opción padre.
- **Notes**: sdk-core delegado a OpenCode (mecánico, doc ya escrito), UI hecha directamente. Verificado end-to-end en producción con framework de prueba (limpiado después). Ver `docs/engines/form.md` sección "Opciones anidadas (VS-016)".

### 2026-08-05 - AN-001: Comparación con el portal S&P Global CSA 2026
- **Status**: Completed
- **Description**: Análisis comparativo (no slice) documentado en `docs/analysis/csa-sp-global-comparison.md`. Inspección en vivo del portal S&P (login Okta con cuenta real del usuario, CSA 2026 → Questionnaires → sub-cuestionario 1.1.1 a nivel DOM). Conclusión: la estructura S&P Dimensión→Criterio→Sub-criterio ya está replicada (Dimensión→Indicador→Subindicador); gaps son aditivos sobre `engine/form`.
- **Notes**: Gaps candidatos a backlog: opciones anidadas, campo URL pública, estado por pregunta + Approved/Submitted, N/A + comentarios confidenciales, Save/Cancel/Reset, numeración automática. Archivos: `docs/analysis/csa-sp-global-comparison.md`, `docs/README.md` (mapa + carpeta `analysis/`), `docs/CHANGELOG.md` (AN-001).

### 2026-08-04 - VS-001: Scaffold monorepo
- **Status**: Completed
- **Description**: pnpm workspace + Turborepo + TS strict + Vitest + CI. `packages/sdk-core` con test real, build/test/typecheck verificados en verde localmente.
- **Notes**: Ver `docs/slices/VS-001.md`.

### 2026-08-04 - VS-002: Gobernanza + Checkpoint Manager
- **Status**: Completed
- **Description**: Árbol completo de `docs/` (visión, objetivos, alcance, roadmap, backlog, riesgos, deuda técnica, dominio, arquitectura, ADRs 0001–0005, checkpoints, project_notes).
- **Notes**: Ver `docs/slices/VS-002.md`. Stack cerrado tras análisis de la propuesta inicial de OpenCode y corrección de tres datos técnicos (Vercel Hobby ToS comercial, tope real de Neon, riesgo de recorte silencioso de Oracle Cloud Always Free).

### 2026-08-04 - VS-003: Auth + Organización
- **Status**: Completed
- **Description**: Better Auth (plugin `organization`) sobre Neon vía Drizzle, `packages/db` nuevo, primera app Next.js (`apps/web`) con la ruta de auth. 6 tests contra Neon real (registro, login, org/owner, invitación sin email, aceptar invitación, tenant-scoping).
- **Notes**: Dos intentos de delegar la implementación a OpenCode fallaron (cola gratuita saturada, luego proceso colgado) — se implementó directamente. Ver `docs/slices/VS-003.md` para decisiones tomadas durante la implementación y `docs/RISKS.md` R-005/R-006 para los riesgos nuevos (tests contra Neon real, conexión no pooled).

### 2026-08-04 - VS-004: Dominio core CRUD + schema
- **Status**: Completed
- **Description**: Schema Drizzle (framework/dimension/indicator/subindicator) + contratos SDK-first en sdk-core + servicio CRUD tenant-scoped + 8 rutas API en apps/web. 6 tests nuevos contra Neon real (12 en total con VS-003).
- **Notes**: Fusiona VS-004+VS-005 del roadmap original (ver docs/slices/VS-004.md). Bug real encontrado: imports relativos `.js` hacia apps/web/lib fallaban en Turbopack — resuelto con alias `@/*`.

### 2026-08-04 - VS-006: Builder jerárquico (UI)
- **Status**: Completed
- **Description**: Primera UI real: auth (signup/login/logout), organizaciones, y árbol Framework→Dimensión→Indicador→Subindicador con CRUD completo consumiendo las rutas API de VS-004.
- **Notes**: Verificado de punta a punta en Chrome real (no solo tests automatizados) — ver `docs/slices/VS-006.md`. Se corrigió un gap real de `tsconfig.json` (lib DOM faltante) y se añadió un header con logout no especificado originalmente.

### 2026-08-05 - VS-011: Evidencias (uploads → R2)
- **Status**: Completed
- **Description**: Octavo tipo de elemento `evidencia` (isQuestion, config maxFiles/maxSizeMb/acceptedTypes) + flujo completo de archivos con Cloudflare R2 vía presigned URLs: PUT/GET firmadas de 5 min, el binario nunca pasa por Vercel. Refs (key/name/size/mimeType) en el jsonb de `response` sin tabla nueva. 3 rutas públicas nuevas (presign/download-url/DELETE) con validación contra snapshot congelado y anti-IDOR por prefijo de key. `EvidenceView` en el Runtime + config en el Builder.
- **Notes**: Ver `docs/slices/VS-011.md` y `docs/engines/evidences.md`. Hallazgo de producción: el bucket R2 sin política CORS falla el PUT del navegador con "Failed to fetch" — CORS configurado vía API de Cloudflare (token CFAT del usuario) y documentado en la spec. Verificado en producción navegando en Chrome: upload real, persistencia tras recarga, descarga íntegra, "Quitar" borra objeto de R2; seguridad 404/400/413/415 OK. Deploy vía GitHub Integration (el CLI desde la raíz excede 100MB de upload). ADR 0003 → Accepted.

### 2026-08-05 - VS-015: Accesibilidad (WCAG 2.2 AA) — cierra el roadmap original
- **Status**: Completed
- **Description**: Auditoría de contraste (fórmula de luminancia relativa WCAG) sobre los tokens compartidos de `design-system.md` — encontró y corrigió `--border` (~1.3:1 → ≥3.5:1) y `Pill` good/warn en modo claro (4.30/3.72 → ≥4.84:1). Más: tamaño mínimo de objetivo en `.btn--sm`, link "Saltar al contenido", `aria-live` en autosave.
- **Notes**: Ver `docs/slices/VS-015.md`, `docs/architecture/accessibility.md`. Con este slice se completan los 12 milestones del roadmap original (`docs/ROADMAP.md`) — próximo paso requiere alinear con el usuario qué sigue, no hay un M13 definido. Verificación en producción: skip link confirmado funcionalmente (Tab → `document.activeElement`), no solo visualmente.

### 2026-08-05 - VS-014: Permisos (RBAC dueño/editor/evaluador)
- **Status**: Completed
- **Description**: `requireWriteAccess` gatea las 10 rutas de escritura del dominio (rechaza `evaluador`). Se expuso por primera vez en la app la gestión de miembros/invitaciones que VS-003 dejó solo como capacidad de backend (sin ruta API nueva, usa `authClient.organization.*` directo) + página de aceptación nueva.
- **Notes**: Ver `docs/slices/VS-014.md`, `docs/engines/permission.md`. Hallazgo real durante la implementación: el cliente tipado de Better Auth exige declarar los roles `editor`/`evaluador` en las opciones del plugin (`roles`) para que `inviteMember`/`updateMemberRole` compilen — se resolvió reutilizando los permisos de `member` por defecto, sin agregar statements de access-control nuevos. Delegué a un subagente de OpenCode el barrido mecánico de gatear las 10 rutas (correcto a la primera). Límite de verificación documentado en `project_notes/decisions.md`: no se probó el flujo completo con una segunda cuenta real (requeriría escribir una contraseña, prohibido sin excepciones); la corrección de `requireWriteAccess` queda respaldada por un test de integración contra Neon real.

### 2026-08-05 - VS-013: Motores fórmula + reglas condicionales
- **Status**: Completed
- **Description**: Elemento `calculado` (fórmula aritmética a mano sobre otros Elementos numéricos, autoguardado como respuesta) y `visibleIf` (visibilidad condicional simple sobre cualquier Elemento). Ambos integrados en progreso, Runtime y exportación CSV ya existentes sin tocar su lógica central (solo un filtro de visibilidad agregado a cada uno).
- **Notes**: Ver `docs/slices/VS-013.md`, `docs/engines/formula.md`, `docs/engines/rule.md`. Delegué a dos subagentes de OpenCode en paralelo la implementación de `packages/sdk-core/src/formula.ts` (parser/evaluador) y `rule.ts` (evaluador de condiciones) — ambas piezas mecánicas con spec completa ya escrita en los docs; el resultado fue correcto sin necesitar retrabajo, salvo un error de tipos menor (unión de arrays en `.includes()`) que corregí directamente. Yo hice la integración cruzada (`form-schema.ts` con `.superRefine()` de ciclos) y toda la UI (Builder + Runtime + export) por ser la parte de mayor juicio/riesgo.

### 2026-08-05 - VS-012: Exportación de resultados (CSV)
- **Status**: Completed
- **Description**: `GET /api/evaluations/[id]/export` (autenticado, tenant-scoped) genera un CSV plano (UTF-8+BOM, RFC 4180) con una fila por Elemento tipo pregunta de cada Subindicador — resuelve labels de selección única/múltiple, lista nombres de evidencia, deja celda vacía si no hay Respuesta. Link "Exportar CSV" en la página de Framework.
- **Notes**: Ver `docs/slices/VS-012.md` y `docs/engines/export.md`. Antes de empezar este slice, validé VS-011 (implementado por otro agente en esta misma sesión): revisé el código de seguridad (anti-IDOR, límites), corrí `pnpm slice:close`, y probé en producción presign/upload/descarga/borrado — todo correcto salvo un gap menor en `key_facts.md` (env vars de R2 no documentadas), corregido. También corregí `ROADMAP.md`, que seguía diciendo "M8 siguiente" tras haberse cerrado VS-011.

### 2026-08-05 - VS-010: Runtime de respuesta + guardar progreso
- **Status**: Completed
- **Description**: Convierte la página pública de solo lectura (VS-009) en un formulario interactivo — tabla `response` nueva ligada a la Evaluación (no a una identidad de evaluado), árbol de navegación persistente + Prev/Next + render real de los 7 tipos de elemento + autosave + progreso en `apps/web/app/evaluations/[token]/page.tsx`. Referencia visual: portal S&P Global CSA (comparación pedida por el usuario).
- **Notes**: Ver `docs/slices/VS-010.md` y `docs/engines/persistence.md`. Verificado en producción con Framework de prueba (7 tipos de elemento), autosave confirmado tras recargar, `curl` sin cookies confirma que el endpoint no depende de sesión. Delegada la escritura de los contratos zod de `sdk-core` a un subagente de OpenCode (ejecución mecánica, ver memoria `feedback_opencode_subagent`).

### 2026-08-05 - VS-007: Form Engine v1
- **Status**: Completed
- **Description**: Primer motor real (`engine/form`): 7 tipos de elemento v1 (zod discriminated union en sdk-core), Form Editor con autosave (debounce 1500ms) sobre el `formSchema`/`revisionNumber` ya existentes desde VS-004.
- **Notes**: Ver `docs/slices/VS-007.md` y `docs/engines/form.md`. Dos bugs reales de la interacción autosave/validación encontrados y corregidos durante la verificación manual en Chrome (autosave disparándose sin edición del usuario; "Error al guardar" en elementos recién creados). Intento de delegar a OpenCode falló por un problema de entorno (heredoc bash en Windows) — implementado directamente.

### 2026-08-05 - VS-008: Registry de componentes pluggable + versionado
- **Status**: Completed
- **Description**: `engine/components` v1 — registry único (`packages/sdk-core/src/component-registry.ts`) reemplaza metadata de tipo duplicada entre sdk-core y la UI del Builder (VS-007). Cada `FormElement` gana `componentVersion`.
- **Notes**: Ver `docs/slices/VS-008.md` y `docs/engines/components.md`. Bug real de tipos encontrado y corregido: anotar el registry con un tipo explícito ensanchaba los literales y dejaba el chequeo de exhaustividad en compile-time vacío — resuelto con `as const satisfies`. Verificado en navegador real contra producción (no local, a pedido del usuario), incluida confirmación directa en Neon de que `componentVersion` persiste correctamente.

### 2026-08-05 - VS-009: Publicación + enlaces seguros
- **Status**: Completed
- **Description**: `engine/publishing` v1 — tabla `evaluation` nueva, un Framework se publica capturando un snapshot completo e inmutable del árbol (no un puntero a `revisionNumber`, el schema no guarda historial). Enlace público sin sesión (`/evaluations/[token]`), revocar = borrar la fila.
- **Notes**: Ver `docs/slices/VS-009.md` y `docs/engines/publishing.md`. Bug real corregido: `drizzle.config.ts` no incluía el nuevo archivo de schema, `db:push` no creaba la tabla sin avisar. Verificado con `curl` sin cookies (no solo visualmente) que el endpoint público funciona sin sesión y que revocar lo tumba a 404 de inmediato.

### 2026-08-05 - TD-003: Playwright E2E
- **Status**: Completed
- **Description**: Deuda técnica pagada (era la primera de las tres priorizadas por el usuario, orden TD-003 → TD-001+TD-002). Playwright nuevo en `apps/web/e2e/`, dos specs (Builder→Publicar y Runtime público), fixtures reales creados/borrados vía `auth.api.*`/`packages/db` directo en Node (nunca contraseña en un formulario ni por HTTP).
- **Notes**: Ver `docs/CHANGELOG.md` para el detalle. Encontró y corrigió 2 bugs reales de producción (no solo cobertura de test): labels de Runtime sin asociación real pese a que VS-015/accessibility.md los daba por cumplidos, y una condición de carrera de pérdida de datos en el autosave del Runtime (el fetch de hidratación de respuestas podía sobreescribir una respuesta recién tecleada por el evaluado). El autosave del Runtime se reescribió del patrón "leer el resultado de un updater de `setState` justo después de llamarlo" (no es una garantía real de React) al patrón correcto de `useEffect` reactivo al estado ya comprometido. Verificado con `pnpm slice:close` (build+test+typecheck) en verde y 2 corridas consecutivas de `pnpm test:e2e` en verde contra `next dev` local (no producción — criterio distinto al resto de slices, ver `playwright.config.ts`, porque e2e necesita mutar datos de test descartables).

### 2026-08-04 - Análisis de propuesta de stack (OpenCode)
- **Status**: Completed
- **Description**: Se verificaron con búsqueda web las afirmaciones técnicas de la propuesta inicial. Se confirmó R2/Better Auth/Drizzle/Vitest+Playwright sin cambios. Se corrigió: (1) Vercel Hobby prohíbe uso comercial — resuelto confirmando que el proyecto es uso interno; (2) Neon omitía el tope de 100 CU-h/mes — documentado como riesgo monitoreado; (3) Postgres self-hosted en Oracle Cloud Always Free fue considerado pero descartado por recorte de cuota sin previo aviso en jun-2026 — se optó por Neon.
- **Notes**: Detalle completo en `docs/adr/0001-*.md` y `docs/adr/0002-*.md`.
