"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Button, Card, Pill } from "@/components/ui";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { formatDueDate } from "@/lib/due-date";

interface EvaluationRow {
  id: string;
  frameworkId: string;
  token: string;
  title: string;
  dueDate: string | null;
  publishedAt: string;
}

function isClosed(row: EvaluationRow): boolean {
  return !!row.dueDate && new Date(row.dueDate) <= new Date();
}

// Pantalla de inicio del administrador: todo lo que está enviado a responder,
// con su estado y las acciones que se repiten (revisar, copiar enlace).
export default function EvaluationsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: activeOrganization, isPending: orgPending } = authClient.useActiveOrganization();
  const [rows, setRows] = useState<EvaluationRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionPending && !session) router.push("/login");
  }, [sessionPending, session, router]);

  useEffect(() => {
    if (!orgPending && session && !activeOrganization) router.push("/organizations");
  }, [orgPending, session, activeOrganization, router]);

  useEffect(() => {
    if (activeOrganization) {
      api.get<{ evaluations: EvaluationRow[] }>("/api/evaluations").then((res) => setRows(res.evaluations));
    }
  }, [activeOrganization]);

  async function copyLink(row: EvaluationRow) {
    await navigator.clipboard.writeText(`${window.location.origin}/evaluations/${row.token}`);
    setCopied(row.id);
    setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 2000);
  }

  if (sessionPending || orgPending || !activeOrganization) return <main className="loading">Cargando...</main>;

  const columns: DataTableColumn<EvaluationRow>[] = [
    {
      key: "title",
      header: "Evaluación",
      render: (row) => (
        <a className="entry-list__title" href={`/frameworks/${row.frameworkId}/evaluations/${row.id}/review`}>
          {row.title}
        </a>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (row) =>
        isClosed(row) ? <Pill variant="warn">Cerrada</Pill> : <Pill variant="good">Abierta</Pill>,
    },
    {
      key: "publishedAt",
      header: "Publicada",
      render: (row) => formatDueDate(row.publishedAt),
    },
    {
      key: "dueDate",
      header: "Plazo",
      render: (row) => (row.dueDate ? formatDueDate(row.dueDate) : "Sin plazo"),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <span className="entry-list__actions">
          <a className="btn btn--secondary btn--sm" href={`/frameworks/${row.frameworkId}/evaluations/${row.id}/review`}>
            Revisar respuestas
          </a>
          <Button type="button" size="sm" onClick={() => void copyLink(row)}>
            {copied === row.id ? "Enlace copiado" : "Copiar enlace"}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <main className="page">
      <h1>Evaluaciones</h1>
      <p className="page__lead">
        Aquí ves cada formulario que enviaste a responder, si sigue abierto y cómo van las respuestas.
      </p>
      <Card>
        {rows === null ? (
          <p className="empty">Cargando evaluaciones...</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <p>Todavía no enviaste ninguna evaluación.</p>
            <p>
              Para empezar, <a href="/frameworks">crea o abre un formulario</a> y pulsa <strong>Publicar</strong>.
            </p>
          </div>
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
        )}
      </Card>
    </main>
  );
}
