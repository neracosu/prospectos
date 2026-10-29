// El alta a mano es un lead desde la fase 2 del panel CRM. Lo prellenado desde Maps («Cargarlo a mano»: nichoId, fuente,
// nombre, web, telefono, nota) lo recibe /leads/nuevo tal cual.
import { redirect } from "next/navigation";
export default async function Nuevo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x) p.set(k, x); }
  const s = p.toString();
  redirect(`/leads/nuevo${s ? "?" + s : ""}`);
}
