import { headers } from "next/headers";
// Apache anexa la IP real al final de X-Forwarded-For; lo que va antes lo puede escribir el cliente.
export function ipDesdeCabeceras(xff: string | null, xRealIp: string | null): string {
  const partes = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return partes.at(-1) || (xRealIp ?? "").trim() || "desconocida";
}
export async function ipCliente(): Promise<string> {
  const h = await headers();
  return ipDesdeCabeceras(h.get("x-forwarded-for"), h.get("x-real-ip")) || "desconocida";
}
