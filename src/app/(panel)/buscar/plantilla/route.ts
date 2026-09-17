// Descarga de la plantilla de importacion. Va aqui y no en la pagina porque es un
// archivo, no HTML. Los route handlers NO pasan por el layout de (panel): la sesion
// se exige aqui mismo.
import { sesionActual } from "@/lib/sesion";
import { generarPlantillaXlsx, generarPlantillaCsv } from "@/lib/plantilla-importar";

const NOMBRE = "plantilla-prospectos";

export async function GET(req: Request) {
  if (!(await sesionActual())) {
    return new Response(null, { status: 302, headers: { Location: "/entrar", "cache-control": "no-store" } });
  }
  const formato = new URL(req.url).searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  if (formato === "csv") {
    // El BOM al principio es lo que hace que Excel abra el CSV con los acentos bien.
    return new Response("﻿" + generarPlantillaCsv(), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${NOMBRE}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  const buf = await generarPlantillaXlsx();
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${NOMBRE}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
