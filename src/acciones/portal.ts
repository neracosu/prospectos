"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { intentarEntrada } from "@/lib/acceso-cliente";
import { COOKIE_CLIENTE, DIAS_SESION_CLIENTE } from "@/lib/sesion-cliente";
import { ipCliente } from "@/lib/ip";
import { fallo, type Resultado } from "@/acciones/resultado";

// La UNICA accion con sesion de cliente: el portal solo lee. Salir es una ruta que borra la cookie.
const Entrada = z.object({ codigo: z.string().max(40), pin: z.string().max(12) });

export async function entrarPortal(_: unknown, formData: FormData): Promise<Resultado> {
  const ip = await ipCliente();
  // redirect() usa una excepcion interna de Next: tiene que quedar FUERA del try.
  let destino = "";
  try {
    const e = Entrada.safeParse({ codigo: String(formData.get("codigo") ?? ""), pin: String(formData.get("pin") ?? "") });
    if (!e.success) return fallo("PIN incorrecto.");
    const r = await intentarEntrada({ codigo: e.data.codigo, pin: e.data.pin, ip });
    if (!r.ok) return fallo(r.motivo === "bloqueado" ? "Demasiados intentos. Espera 15 minutos." : "PIN incorrecto.");
    (await cookies()).set(COOKIE_CLIENTE, r.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      maxAge: DIAS_SESION_CLIENTE * 24 * 60 * 60,
    });
    destino = `/c/${e.data.codigo}/inicio`;
  } catch (err) {
    console.error("entrarPortal", err);
    return fallo("No se pudo entrar. Intenta de nuevo.");
  }
  redirect(destino);
}
