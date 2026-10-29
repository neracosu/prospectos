import { timingSafeEqual } from "node:crypto";
import { enviarAutomatico } from "@/lib/correos";

// POST /api/correos/automatico — la llama el crontab de la cuenta cada hora, todos los dias.
// El servidor esta en hora de Los Angeles; la ventana la decide el codigo en hora de Caracas (fuera de ella responde
// fuera_de_horario y no cuesta nada). Sin el secreto
// correcto responde 404 sin cuerpo (no revela que la ruta existe). --max-time 540: una pasada colgada (PDF, sendmail)
// no se solapa con la de la hora siguiente. Linea del crontab (no se instala desde el codigo):
// 0 * * * * bash -c 'set -a; . ~/.config/prospectos/env; set +a; curl -s --max-time 540 -o /dev/null -X POST -H "x-cron-secret: $PROSPECTOS_CRON_SECRET" https://prospectos.neracosu.com/api/correos/automatico'
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
