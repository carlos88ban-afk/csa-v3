# Work Log

Registro rápido de trabajo completado por slice. No reemplaza `docs/slices/` ni `docs/CHANGELOG.md` — es una referencia rápida cronológica.

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
