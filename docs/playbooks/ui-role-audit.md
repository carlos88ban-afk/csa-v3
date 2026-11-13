# Auditoría de interfaz por rol (obligatoria tras cambios de layout o CSS global)

Causa que la originó (2026-11-13): se rediseñó el layout compartido (barra superior) validándolo solo con la sesión de evaluador; el rol corporativo, con 6 pestañas, desbordó la barra.

## Contrato del layout compartido
- Barra superior: 6 pestañas (corporativo) + identidad caben desde 1024 px, sin scroll interno. La identidad se compacta antes (correo oculto <1500 px, unidad oculta <1100 px).
- Todo cambio en `.app-shell*`, `.app-sidebar*`, `.runtime-*` o tokens se prueba en los 3 roles y en claro/oscuro.
- Los selectores del shell fuera del Builder usan `.app-shell:not(.app-shell--focus)`; el Builder (`--focus`) conserva su menú desplegable.

## Matriz a verificar después de cada deploy
| Rol | Páginas |
|---|---|
| Corporativo | /evaluations, /frameworks, /units, /users, /consolidado, /consultas, builder, review |
| Admin de unidad | /mi-evaluacion, /responsables, /users, /consultas |
| Evaluador | /mi-evaluacion, /consultas |

## Auditoría automática (pegar en la consola con la sesión del rol abierta)
```js
const pages = ['/evaluations','/frameworks','/units','/users','/consolidado','/consultas']; // ajustar por rol
const out = [];
for (const p of pages) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:800px';
  f.src = p; document.body.appendChild(f);
  await new Promise(r => f.onload = r); await new Promise(r => setTimeout(r, 3500));
  const d = f.contentDocument, w = f.contentWindow;
  const nav = d.querySelector('.app-sidebar__nav');
  out.push({ p, docOverflowX: d.documentElement.scrollWidth > w.innerWidth + 2,
    navScroll: nav ? nav.scrollWidth > nav.clientWidth + 1 : null,
    loading: /Cargando/.test(d.body.innerText.slice(0, 400)) });
  f.remove();
}
JSON.stringify(out)
```
Esperado: `docOverflowX:false`, `navScroll:false`, `loading:false` en todas.

## Revisión visual
Captura de la pantalla principal de cada rol en oscuro y en claro (`document.documentElement.setAttribute('data-theme','light')`).

## Estado
- Corporativo: auditado 2026-11-13 (7 páginas sin desborde).
- Evaluador: revisado manualmente 2026-11-13.
- Admin de unidad: auditado 2026-11-13 (4 páginas sin desborde); asignación por correo probada en producción.
