import { exigirSesion } from "@/lib/sesion";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { Pestanas } from "@/componentes/Pestanas";
import { InicioProspectador } from "@/componentes/InicioProspectador";
import { DirectorioLista } from "@/componentes/DirectorioLista";
import { DirectorioBuscar, PESTANAS_BUSCAR, pestanaBuscar } from "@/componentes/DirectorioBuscar";

export const dynamic = "force-dynamic";

// Directorio (panel CRM, fase 2): la prospeccion masiva en un solo sitio. Cola del dia, la lista de filas
// importadas, y las formas de buscar e importar con su bandeja (antes /buscar). /prospectos y /buscar redirigen aqui.
const PESTANAS = [
  { clave: "cola", texto: "Cola del día" },
  { clave: "lista", texto: "Lista" },
  ...PESTANAS_BUSCAR,
];

export default async function Directorio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigirSesion();
  const crudo = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(crudo)) sp[k] = Array.isArray(v) ? v[0] : v;
  // Sin pestana: un enlace compartido o un lote abren lo de buscar; si no, la cola.
  const t = PESTANAS.some((p) => p.clave === sp.t) ? sp.t! : (sp.url || sp.text || sp.lote) ? pestanaBuscar(sp) : "cola";
  return (
    <>
      <CabeceraPagina titulo="Directorio" cifra="prospección masiva" />
      <Pestanas base="/directorio" activa={t} items={PESTANAS} etiqueta="Secciones del directorio" />
      {t === "cola" && <InicioProspectador usuario={{ id: u.id, nombre: u.nombre }} />}
      {t === "lista" && <DirectorioLista sp={sp} />}
      {t !== "cola" && t !== "lista" && <DirectorioBuscar sp={sp} t={t} />}
    </>
  );
}
