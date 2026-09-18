// scripts/leer-webs.mts — «Leer web» en bloque: para cada prospecto con web y algun contacto vacio, lee su web
// (por red-segura, una a la vez, 3 s entre sitios) y llena SOLO los campos vacios que traigan UN unico candidato
// (con varios no se adivina: quedan como sugerencia en el evento, como en la ficha). La fuente del dato es la web.
// Uso (env cargado): npx tsx scripts/leer-webs.mts [--aplicar]   (sin --aplicar solo muestra lo que haria)
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { descargar } from "../src/lib/red-segura";
import { extraerContactos } from "../src/lib/contactos-web-contrato";
import { listaDeTextos, mapaDeTextos } from "../src/lib/revision";
import { normalizarCelular, normalizarRed } from "../src/lib/celular-contrato";
const APLICAR = process.argv.includes("--aplicar");
const CAMPOS = ["email", "whatsapp", "instagram", "facebook", "tiktok"] as const;
type Campo = (typeof CAMPOS)[number];
const vivo = setInterval(() => {}, 1000);
const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: "dueno", activo: true }, orderBy: { id: "asc" }, select: { id: true } });
const candidatos = await prisma.prospecto.findMany({
  where: { web: { not: "" }, OR: [{ whatsapp: "" }, { email: "" }], eventos: { none: { tipo: "lectura_web", creadoEn: { gt: new Date(Date.now() - 7 * 86400_000) } } } },
  select: { id: true, nombre: true, web: true, whatsapp: true, email: true, instagram: true, facebook: true, tiktok: true, fuentes: true, fuentesPorCampo: true },
  orderBy: { id: "asc" },
});
console.log(`${candidatos.length} prospectos con web y contacto por completar${APLICAR ? "" : " (ensayo)"}`);
const normalizar = (campo: Campo, v: string): string => campo === "whatsapp" ? normalizarCelular(v) : campo === "email" ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 120 ? v.toLowerCase() : "") : normalizarRed(v, campo);
let leidas = 0, fallidas = 0, llenados = 0, ambiguos = 0;
for (const p of candidatos) {
  const url = /^https?:\/\//i.test(p.web) ? p.web : `https://${p.web}`;
  const r = await descargar(url, { timeoutMs: 10_000, plazoTotalMs: 12_000, maxBytes: 2 * 1024 * 1024 });
  if (!r.ok) { fallidas++; console.log(`  x ${p.nombre}: ${r.motivo}`); await new Promise((f) => setTimeout(f, 1500)); continue; }
  leidas++;
  const c = extraerContactos(r.texto, r.urlFinal);
  const porCampo: Record<Campo, string[]> = { email: c.emails, whatsapp: c.celulares, instagram: c.instagram, facebook: c.facebook, tiktok: c.tiktok };
  const data: Record<string, string> = {};
  const fpc = mapaDeTextos(p.fuentesPorCampo);
  const notas: string[] = [];
  for (const campo of CAMPOS) {
    if (p[campo]) continue;
    const valores = [...new Set(porCampo[campo].map((v) => normalizar(campo, v)).filter(Boolean))];
    if (valores.length === 1) { data[campo] = valores[0]; fpc[campo] = r.urlFinal; }
    else if (valores.length > 1) { ambiguos++; notas.push(`${campo}: ${valores.slice(0, 5).join(" | ")}`); }
  }
  const campos = Object.keys(data);
  if (campos.length) console.log(`  + ${p.nombre}: ${campos.map((k) => `${k}=${data[k]}`).join(", ")}${notas.length ? ` (sin decidir: ${notas.join("; ")})` : ""}`);
  if (APLICAR) {
    if (campos.length) {
      await prisma.prospecto.update({ where: { id: p.id }, data: { ...data, fuentes: [...new Set([...listaDeTextos(p.fuentes), r.urlFinal])], fuentesPorCampo: fpc as Prisma.InputJsonValue } });
      llenados += campos.length;
    }
    await prisma.evento.create({ data: { prospectoId: p.id, usuarioId: dueno.id, tipo: "lectura_web", texto: `${r.urlFinal} · ${campos.length} campo(s) llenados en bloque${notas.length ? ` · sin decidir: ${notas.join("; ")}` : ""}`.slice(0, 2000) } });
  } else llenados += campos.length;
  await new Promise((f) => setTimeout(f, 3000));
}
console.log(`leídas ${leidas}, no se pudieron leer ${fallidas}, campos ${APLICAR ? "llenados" : "que se llenarían"} ${llenados}, con varios candidatos ${ambiguos}`);
clearInterval(vivo);
await prisma.$disconnect();
