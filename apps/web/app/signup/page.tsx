"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message ?? "No se pudo crear la cuenta");
      return;
    }
    router.push("/organizations");
  }

  return (
    <main className="page page--narrow">
      <h1>Crear cuenta</h1>
      <Card>
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field__label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field__label">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error && <p className="alert" role="alert">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Creando..." : "Crear cuenta"}
          </Button>
        </form>
      </Card>
      <p>
        ¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>
      </p>
    </main>
  );
}
