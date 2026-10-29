import { timingSafeEqual } from "node:crypto";
import { enviarAutomatico } from "@/lib/correos";

// POST /api/correos/automatico — la llama el crontab de la cuenta cada hora en horario laboral. Sin el secreto
// correcto responde 404 sin cuerpo (no revela que la ruta existe). Linea del crontab (no se instala desde el codigo):
// 0 9-17 * * 1-5 bash -c 'set -a; . ~/.config/prospectos/env; set +a; curl -s -o /dev/null -X POST -H "x-cron-secret: $PROSPECTOS_CRON_SECRET" https://prospectos.neracosu.com/api/correos/automatico'
export const dynamic = "force-dynamic";

function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.PROSPECTOS_CRON_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretoValido(req.headers.get("x-cron-secret"))) return new Response(null, { status: 404 });
  return Response.json(await enviarAutomatico());
}
