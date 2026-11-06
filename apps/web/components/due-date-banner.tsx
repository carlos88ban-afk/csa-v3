"use client";

// VS-054 (docs/domain/business-units.md, "Plazo de recepción"): banner
// compartido entre Runtime público y autenticado que avisa del vencimiento
// próximo o informa del cierre tras dueDate.

import { formatDueDate } from "@/lib/due-date";

interface DueDateBannerProps {
  dueDate: string | Date | null;
  contactEmail: string | null;
}

export function DueDateBanner({ dueDate, contactEmail }: DueDateBannerProps) {
  if (!dueDate) return null;

  const now = new Date();
  const due = new Date(dueDate);
  const threeDaysBefore = new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000);

  // Banner de cierre (tras vencimiento)
  if (now >= due) {
    return (
      <div className="due-date-banner due-date-banner--closed">
        <strong>El plazo para responder terminó.</strong>
        <p>
          Se cerró el {formatDueDate(due)} y ya no se pueden modificar respuestas.
          {contactEmail && (
            <>
              {" "}
              Si necesitas más tiempo, escribe a{" "}
              <a href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
              .
            </>
          )}
        </p>
      </div>
    );
  }

  // Banner de aviso (2-3 días antes del vencimiento)
  if (now >= threeDaysBefore) {
    return (
      <div className="due-date-banner due-date-banner--expiring">
        <strong>El plazo está por terminar.</strong>
        <p>Completa tus respuestas antes del {formatDueDate(due)}.</p>
      </div>
    );
  }

  return null;
}