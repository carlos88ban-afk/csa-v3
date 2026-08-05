"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card } from "@/components/ui";

interface Props {
  params: Promise<{ invitationId: string }>;
}

// Página de aceptación de invitación (ver docs/engines/permission.md): sin
// envío de email (mismo criterio que organization-user.md desde VS-003), el
// owner comparte este link manualmente. Requiere sesión — si no hay una,
// redirige a login/signup conservando el link para volver después.
export default function AcceptInvitationPage({ params }: Props) {
  const { invitationId } = use(params);
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [status, setStatus] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionPending && !session) {
      router.push(`/login?next=${encodeURIComponent(`/accept-invitation/${invitationId}`)}`);
    }
  }, [sessionPending, session, router, invitationId]);

  async function handleAccept() {
    setStatus("accepting");
    setError(null);
    const { data, error: acceptError } = await authClient.organization.acceptInvitation({ invitationId });
    if (acceptError) {
      setStatus("error");
      setError(acceptError.message ?? "No se pudo aceptar la invitación");
      return;
    }
    const organizationId = data?.invitation?.organizationId;
    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }
    setStatus("done");
  }

  if (sessionPending || !session) return <main className="loading">Cargando...</main>;

  return (
    <main className="page page--narrow">
      <h1>Invitación a la organización</h1>
      <Card>
        {status === "done" ? (
          <>
            <p>Te uniste a la organización.</p>
            <Button type="button" variant="primary" onClick={() => router.push("/frameworks")}>
              Ir a Frameworks
            </Button>
          </>
        ) : (
          <>
            <p>Acepta la invitación para unirte con tu cuenta ({session.user.email}).</p>
            <Button type="button" variant="primary" onClick={handleAccept} disabled={status === "accepting"}>
              {status === "accepting" ? "Aceptando..." : "Aceptar invitación"}
            </Button>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </Card>
    </main>
  );
}
