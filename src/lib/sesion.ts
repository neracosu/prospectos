// src/lib/sesion.ts — puerta unica del panel.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verificarToken, type SesionUsuario } from "@/lib/auth";
import { usuarioVigente } from "@/lib/usuarios";
import { ipDesdeCabeceras } from "@/lib/ip";
import { anotarVisitanteSesion } from "@/lib/rastro";

export const COOKIE_SESION = "pr_sesion";
export const DIAS_SESION = 30;

// cache(): layout y pagina la llaman en la misma peticion; la base se consulta una vez.
export const sesionActual = cache(async (): Promise<SesionUsuario | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  const u = token ? await verificarToken(token) : null;
  if (!u) return null;
  if (!(await usuarioVigente(u.id))) redirect("/salir");
  // Rastro de enlaces: quien entra al panel es propio. Sin esperar: no frena el render y si falla no importa.
  try {
    const h = await headers();
    void anotarVisitanteSesion(ipDesdeCabeceras(h.get("x-forwarded-for"), h.get("x-real-ip")), h.get("user-agent") ?? "").catch(() => {});
  } catch { /* sin cabeceras (fuera de una peticion): no se anota */ }
  return u;
});

export async function exigirSesion(): Promise<SesionUsuario> {
  const u = await sesionActual();
  if (!u) redirect("/entrar");
  return u;
}

// Solo dueno ve dinero, proyectos y ajustes. Se llama FUERA del try/catch.
export async function exigirRol(rol: "dueno"): Promise<SesionUsuario> {
  const u = await exigirSesion();
  if (u.rol !== rol) redirect("/inicio");
  return u;
}
