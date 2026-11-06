/**
 * Envío de correo vía Resend (HTTP, sin SDK). Configuración por entorno:
 *   RESEND_API_KEY  — clave de API de Resend (sin ella, el envío se omite).
 *   EMAIL_FROM      — remitente verificado, p. ej. "Plataforma CSA <no-reply@tu-dominio.com>".
 * Nunca lanza: un correo fallido no debe romper la acción que lo origina.
 */
export let emailSentCount = 0;

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!emailEnabled()) {
    console.warn("[email] RESEND_API_KEY/EMAIL_FROM no configurados; correo omitido:", input.subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      console.error("[email] Resend respondió", res.status, await res.text());
      return false;
    }
    emailSentCount += 1;
    return true;
  } catch (err) {
    console.error("[email] fallo de red", err);
    return false;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p><a href="${esc(cta.url)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2>${esc(title)}</h2>${bodyHtml}${button}</div>`;
}

export const emailTemplates = {
  invitation: (p: { organization: string; inviter: string; url: string }) => ({
    subject: `${p.inviter} te invitó a ${p.organization}`,
    html: layout(`Te invitaron a ${p.organization}`, `<p>${esc(p.inviter)} te invitó a colaborar en la plataforma.</p>`, {
      label: "Aceptar invitación",
      url: p.url,
    }),
  }),
  returned: (p: { evaluation: string; observation: string; url: string }) => ({
    subject: `Corrección solicitada: ${p.evaluation}`,
    html: layout("Una respuesta fue devuelta para corregir", `<p>${esc(p.observation)}</p>`, { label: "Corregir respuesta", url: p.url }),
  }),
  approved: (p: { evaluation: string; url: string }) => ({
    subject: `Respuesta aprobada: ${p.evaluation}`,
    html: layout("Una respuesta fue aprobada", `<p>El revisor aprobó una de tus respuestas en ${esc(p.evaluation)}.</p>`, { label: "Ver evaluación", url: p.url }),
  }),
  dueSoon: (p: { evaluation: string; dueDate: string; url: string }) => ({
    subject: `Plazo próximo: ${p.evaluation}`,
    html: layout("Tu evaluación vence pronto", `<p>El plazo de ${esc(p.evaluation)} termina el ${esc(p.dueDate)}.</p>`, { label: "Continuar", url: p.url }),
  }),
};
