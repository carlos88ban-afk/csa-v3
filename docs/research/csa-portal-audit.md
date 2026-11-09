# Auditoría del portal CSA de referencia (2026-11-09)

Rastreo de solo lectura de las 152 preguntas (X.Y.Z) del cuestionario CSA 2026 en el portal de referencia, extrayendo la estructura de cada una (controles, tablas, tipos de dato).

## Hallazgos

| Patrón | Preguntas | Qué requiere en la plataforma |
|---|---|---|
| Selección única simple (radios) | 63 | `seleccion_unica` — cubierto |
| Selección única con **tabla dentro de una opción** | 62 | `option.table` — cubierto (pegado + Builder) |
| Solo texto libre ("… de MSA") | 27 | `texto_largo` — cubierto; el pegado las detecta con confianza baja |
| Casillas dentro de opciones (sub-opciones) | 88 | `subOptions` — cubierto (sangría al pegar) |
| Campos **numéricos** (Float 31 · Percent 64 · Integer 20 preguntas) | 88 (584 celdas) | `numero` / `numero` con unidad `%` — el pegado los infiere del tipo de dato del portal |
| Tablas con **columnas por año** ("FY 2022…2025") | 28 | **dato histórico por unidad** (nuevo) |
| Sí/No (radios o casillas) | 115 | casilla suelta → `casilla`; par ○ Sí ○ No → desplegable |
| Listas desplegables | 125 | `seleccion_desplegable` — las opciones no se leen del portal (colapsadas) |
| Más de una tabla en la misma pregunta | 11 | cubierto |
| Evidencias / archivos propios | 0 (el portal usa "referencias" por opción) | cubierto por `references` |

- Tablas: 2–18 filas (promedio 4,7). Anidación de listas hasta 3 niveles (28 preguntas).
- **Ninguna pregunta de nivel superior es numérica, de selección múltiple o de fecha**: todo lo numérico vive dentro de tablas u opciones.
- Casos a revisar a mano: celdas con varias casillas (se importan como texto con la lista como guía), desplegables (opciones), columnas calculadas ("Tasa promedio calculada": fórmula por definir).
