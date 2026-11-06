// Se muestra dentro del <main> mientras llega la siguiente pantalla: el
// sidebar no se toca y la transición es inmediata.
export default function Loading() {
  return (
    <div className="page page-skeleton" aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--card" />
    </div>
  );
}
