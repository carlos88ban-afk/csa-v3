# Lenguaje ubicuo

Núcleo del dominio. Estos términos son obligatorios en código, docs, UI y commits. No usar los sinónimos prohibidos.

| Término | Definición | No usar |
|---|---|---|
| **Framework** | Contenedor raíz de todo el modelo de evaluación | "plantilla", "modelo" |
| **Dimensión** | Agrupa indicadores. Solo título + descripción opcional. No contiene preguntas ni formularios | "categoría" |
| **Indicador** | Pertenece a una Dimensión. Título + descripción breve. Agrupa Subindicadores. No contiene preguntas | — |
| **Subindicador** | Formulario independiente; aquí vive toda la lógica (elementos, condiciones, cálculos) | "sección", "item" |
| **Elemento** | Componente dentro del formulario: pregunta, banner, instrucción, texto, tabla, grid, upload, URL, evidencia, calculado, repetible, condicional... | "field", "widget" |
| **Evaluación** | Instancia publicada de un Framework | "formulario" |
| **Respuesta (Submission)** | Envío/avance de un evaluado sobre una Evaluación | "resultado" |
| **Evidencia** | Archivo adjunto a una Respuesta, almacenado en R2 | "documento" |
| **Organización** | Tenant dueño de Frameworks y Evaluaciones | "empresa", "cliente" |

## Jerarquía (modelo mental del Builder)

```
Framework
  └─ Dimensión (título, descripción — sin preguntas)
       └─ Indicador (título, descripción breve — sin preguntas)
            └─ Subindicador (= un Formulario completo)
                 └─ Elementos (toda la lógica vive aquí)
```

## Invariantes

- Un Subindicador contiene exactamente un Form Schema.
- Dimensiones e Indicadores nunca contienen preguntas ni formularios — solo texto de agrupación.
- Las referencias entre agregados son por ID, nunca por embebido profundo.
- Cada guardado de `ComponentDefinition` y de un Form Schema genera un `revisionNumber` inmutable. Publicar una Evaluación apunta a una revisión concreta, no a "la última" — así quien ya empezó a responder no ve el formulario cambiar bajo sus pies.

Ver [`../architecture/overview.md`](../architecture/overview.md) para cómo estos conceptos se mapean a agregados y módulos.
