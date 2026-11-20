import { redirect } from "next/navigation";

// VS-081: el consolidado ahora vive en «Revisar avances».
export default function ConsolidadoRedirect() {
  redirect("/revisar");
}
