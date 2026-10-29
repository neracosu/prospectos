// Sesion "ligera" para rutas publicas: no hace redirect() ni va a la base. Alcanza con un token valido (del panel,
// o del portal del cliente: un cliente ya ganado que revisa su propuesta no es un prospecto abriendo el enlace)
// para no contar la visita. Usa next/headers: no importar desde codigo puro.
import { cookies } from "next/headers";
import { verificarToken, verificarTokenCliente } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/sesion";
import { COOKIE_CLIENTE } from "@/lib/sesion-cliente";

export async function tieneSesion(): Promise<boolean> {
  const jar = await cookies();
  const delPanel = jar.get(COOKIE_SESION)?.value;
  if (delPanel && (await verificarToken(delPanel)) !== null) return true;
  const delPortal = jar.get(COOKIE_CLIENTE)?.value;
  return !!delPortal && (await verificarTokenCliente(delPortal)) !== null;
}
