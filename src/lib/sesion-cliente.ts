// src/lib/sesion-cliente.ts — puerta unica del portal del cliente. No comparte nada con la del panel.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sesionDesdeToken, type SesionPortal } from "@/lib/acceso-cliente";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { CODIGO_VALIDO } from "@/lib/codigo";

export const COOKIE_CLIENTE = "sesion_cliente";
export const DIAS_SESION_CLIENTE = 30;

// cache(): layout y pagina la llaman en la misma peticion; la base se consulta una vez.
export const sesionCliente = cache(async (): Promise<SesionPortal | null> => {
  return sesionDesdeToken((await cookies()).get(COOKIE_CLIENTE)?.value);
});

// Toda pantalla del portal empieza aqui. Sin sesion, o con la sesion de OTRO cliente, vuelve al PIN de este codigo.
export async function exigirCliente(codigo: string): Promise<SesionPortal> {
  if (!CODIGO_VALIDO.test(codigo)) notFound();
  await limitarPortal();
  const s = await sesionCliente();
  if (!s || s.codigo !== codigo) redirect(`/c/${codigo}`);
  return s;
}

// 120 peticiones por minuto por IP en /c/*. Pasado el limite responde como si no existiera.
export async function limitarPortal(): Promise<void> {
  if (!permitirIntento(`c:${await ipCliente()}`, 120, 60_000)) notFound();
}
