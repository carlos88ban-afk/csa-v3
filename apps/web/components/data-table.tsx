import type { ReactNode } from "react";

// Tabla densa para listas administrativas (organizaciones, frameworks,
// dimensiones) — ver docs/architecture/design-system.md "Layout" (VS-033/034).
// Reemplaza .entry-list donde el contenido es tabular (columnas con el mismo
// significado en cada fila); .entry-list sigue siendo correcto para listas
// de acciones mixtas por fila (gestión de roles, evaluaciones publicadas).

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="empty">{emptyLabel ?? "Sin resultados."}</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col" className={col.numeric ? "data-table__cell--count" : undefined}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.key} className={col.numeric ? "data-table__cell--count" : undefined}>
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
