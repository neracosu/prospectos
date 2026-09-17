import { NextResponse } from "next/server";
import { COOKIE_CLIENTE } from "@/lib/sesion-cliente";
import { CODIGO_VALIDO } from "@/lib/codigo";

// Salir del portal: borra la cookie del cliente y vuelve a su pantalla de PIN. No toca la del panel.
export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const destino = CODIGO_VALIDO.test(codigo) ? `/c/${codigo}` : "/";
  const res = new NextResponse(null, { status: 302, headers: { Location: destino, "cache-control": "no-store" } });
  res.cookies.set(COOKIE_CLIENTE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
