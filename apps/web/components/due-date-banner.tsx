"use client";

// VS-054 (docs/domain/business-units.md, "Plazo de recepción"): banner
// compartido entre Runtime público y autenticado que avisa del vencimiento
// próximo o informa del cierre tras dueDate.

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
        <strong>Esta evaluación ha finalizado.</strong>
        <p>
          El plazo de recepción venció el {due.toLocaleDateString()}.
          {contactEmail && (
            <>
              {" "}
              Si necesitas una extensión, contacta a{" "}
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
        <strong>El plazo está por vencer.</strong>
        <p>Esta evaluación debe completarse antes del {due.toLocaleDateString()}.</p>
      </div>
    );
  }

  return null;
}