"use client";

import { useEffect } from "react";

// El registro abierto ya no existe: las cuentas las crea un administrador.
export default function SignupPage() {
  useEffect(() => {
    window.location.replace("/login");
  }, []);
  return <main className="loading">Cargando...</main>;
}
