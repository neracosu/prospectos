// /buscar vive dentro de Directorio desde la fase 2 del panel CRM. Se conserva la consulta (?url=, ?text=, ?lote=, ?p=);
// la pestana «osm» ahora se llama «buscar». El Web Share Target de Android ya apunta a /directorio.
import { redirect } from "next/navigation";
export default async function Buscar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x) p.set(k, k === "t" && x === "osm" ? "buscar" : x); }
  if (!p.get("t")) p.set("t", p.get("url") || p.get("text") ? "maps" : p.get("lote") ? "bandeja" : "buscar");
  redirect(`/directorio?${p.toString()}`);
}
