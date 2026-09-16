"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crearToken } from "@/lib/auth";
import { buscarPorPin } from "@/lib/usuarios";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { COOKIE_SESION, DIAS_SESION } from "@/lib/sesion";
import { fallo, type Resultado } from "@/acciones/resultado";

const Entrada = z.object({ pin: z.string().regex(/^\d{6}$/) });

// Bloqueo: 5 intentos fallidos por IP en 15 minutos. El PIN es la unica
// credencial, asi que no hay "cuenta" que bloquear antes de acertar; la IP
// es lo que frena a quien prueba PINes.
export async function entrar(_: unknown, formData: FormData): Promise<Resultado> {
  const ip = await ipCliente();
  if (!permitirIntento(`entrar:${ip}`)) return fallo("Demasiados intentos. Espera 15 minutos.");
  const e = Entrada.safeParse({ pin: String(formData.get("pin") ?? "") });
  if (!e.success) return fallo("El PIN tiene 6 números.");
  const u = await buscarPorPin(e.data.pin);
  if (!u) return fallo("PIN incorrecto.");
  const token = await crearToken(u);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: DIAS_SESION * 24 * 60 * 60,
  });
  redirect("/hoy");
}
