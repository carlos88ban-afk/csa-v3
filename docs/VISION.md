# Visión

Construir una plataforma SaaS que permita a cualquier organización **crear, publicar y gestionar evaluaciones complejas sin escribir código**: ESG, CSA, ISO, auditorías, diagnósticos, checklists, autoevaluaciones, evaluaciones regulatorias e internas.

El sistema no está diseñado para un único caso de uso. Ningún framework de evaluación particular está hardcodeado: todo se construye mediante metadatos a través del Builder.

## Para quién

Uso interno / no comercial (confirmado 2026-08-04) — no un producto vendido a terceros por ahora. Esto condiciona directamente la elección de stack (ver [`adr/0001-hosting-nextjs-vercel-hobby.md`](adr/0001-hosting-nextjs-vercel-hobby.md)); si el proyecto pasa a ser comercial en el futuro, esa ADR debe revisarse primero.

## Principio central

El administrador nunca programa. Todo se construye mediante el Builder, siguiendo el modelo:

```
Framework → Dimensión → Indicador → Subindicador → Formulario → Elementos
```

Ver [`domain/ubiquitous-language.md`](domain/ubiquitous-language.md) para las definiciones exactas de cada término.
