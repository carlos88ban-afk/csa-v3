// Fecha límite: el admin elige un día; el plazo cierra al terminar ese día en
// hora de Lima. Una sola zona para guardar, mostrar y comparar evita que el
// panel y el evaluado vean días distintos.
const TZ = "America/Lima";

export function dueDateToInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function inputToDueDate(day: string): string {
  return `${day}T23:59:59-05:00`;
}

export function formatDueDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("es-PE", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
