"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Soporta volver a una invitación pendiente (VS-014) tras iniciar sesión —
  // leído en un efecto, no en el render, para no acceder a `window` en SSR.
  const [nextPath, setNextPath] = useState("/organizations");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) setNextPath(next);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? "Credenciales incorrectas");
      return;
    }
    router.push(nextPath);
  }

  return (
    <main className="page page--narrow">
      <h1>Iniciar sesión</h1>
      <Card>
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field__label">Contraseña</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="alert" role="alert">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
      <p>
        ¿No tienes cuenta? <a href="/signup">Crea una</a>
      </p>
    </main>
  );
}
