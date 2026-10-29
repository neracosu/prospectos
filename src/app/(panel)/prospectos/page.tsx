// /prospectos fue la lista de prospeccion hasta la fase 2 del panel CRM: ahora es Directorio › Lista, con la misma consulta.
import { redirect } from "next/navigation";
export default async function Prospectos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ t: "lista" });
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x && k !== "t") p.set(k, x); }
  redirect(`/directorio?${p.toString()}`);
}
