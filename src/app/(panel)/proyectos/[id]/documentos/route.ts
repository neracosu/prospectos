import { revalidatePath } from "next/cache";
import { sesionActual } from "@/lib/sesion";
import { mismoOrigen } from "@/lib/origen";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { guardarDocumento } from "@/lib/documentos";

// POST /proyectos/<id>/documentos — sube un documento del cliente (pieza 5b). Es un route handler y no una
// Server Action porque el tope de cuerpo de las acciones es global: subirlo a 11 MB se lo abriria tambien a la
// entrada del portal, que no pide sesion. Aqui la sesion se valida ANTES de leer el cuerpo.
const MARGEN_MULTIPART = 64 * 1024;
const responder = (status: number, cuerpo: { ok: true; datos: { id: number } } | { ok: false; mensaje: string }) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const MENSAJES: Record<string, [number, string]> = {
  ARCHIVO_VACIO: [400, "El archivo está vacío."],
  ARCHIVO_GRANDE: [413, "El archivo pesa más de 10 MB."],
  TIPO_NO_PERMITIDO: [415, "Ese archivo no es un PDF, JPG, PNG o ZIP. Se revisa el contenido, no la extensión."],
  PROYECTO_NO_EXISTE: [404, "Ese proyecto no existe."],
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await sesionActual();
  if (!u) return responder(401, { ok: false, mensaje: "Tu sesión venció. Entra de nuevo y vuelve a subirlo." });
  if (u.rol !== "dueno") return responder(403, { ok: false, mensaje: "Solo el dueño sube documentos." });
  // Lo que Next hace solo en una Server Action: que la peticion venga de este mismo sitio.
  if (!mismoOrigen(req.headers)) return responder(403, { ok: false, mensaje: "La petición no vino de este sitio." });
  const proyectoId = Number((await ctx.params).id);
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) return responder(404, { ok: false, mensaje: MENSAJES.PROYECTO_NO_EXISTE[1] });
  // Si el navegador declara un cuerpo enorme, se corta sin leerlo.
  if (Number(req.headers.get("content-length") ?? "0") > TAMANO_MAXIMO + MARGEN_MULTIPART) return responder(413, { ok: false, mensaje: MENSAJES.ARCHIVO_GRANDE[1] });
  let archivo: FormDataEntryValue | null = null;
  let nombre = "";
  try {
    const fd = await req.formData();
    archivo = fd.get("archivo");
    nombre = String(fd.get("nombre") ?? "");
  } catch { return responder(400, { ok: false, mensaje: "No se pudo leer el archivo. Intenta de nuevo." }); }
  if (!(archivo instanceof File)) return responder(400, { ok: false, mensaje: "Elige un archivo." });
  if (archivo.size > TAMANO_MAXIMO) return responder(413, { ok: false, mensaje: MENSAJES.ARCHIVO_GRANDE[1] });
  try {
    const r = await guardarDocumento({ proyectoId, nombre, nombreArchivo: archivo.name, bytes: new Uint8Array(await archivo.arrayBuffer()), usuarioId: u.id });
    revalidatePath(`/proyectos/${proyectoId}`);
    return responder(200, { ok: true, datos: { id: r.id } });
  } catch (err) {
    const conocido = MENSAJES[err instanceof Error ? err.message : ""];
    if (conocido) return responder(conocido[0], { ok: false, mensaje: conocido[1] });
    console.error("subir documento", proyectoId, err);
    return responder(500, { ok: false, mensaje: "No se pudo guardar el documento. Intenta de nuevo." });
  }
}
