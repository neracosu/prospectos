// src/lib/ip.ts — la IP real llega por Apache (proxy en 127.0.0.1).
import { headers } from "next/headers";
export async function ipCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocida";
}
