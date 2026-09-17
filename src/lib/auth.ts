// src/lib/auth.ts — token firmado (HS256) que va en la cookie. 30 dias.
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

export type SesionUsuario = { id: number; nombre: string; rol: "dueno" | "prospectador" };

const secreto = () => {
  const s = process.env.SESION_SECRET;
  if (!s) throw new Error("Falta SESION_SECRET");
  if (s.length < 32) throw new Error("SESION_SECRET es demasiado corto (minimo 32 caracteres)");
  return new TextEncoder().encode(s);
};

const Payload = z.object({ id: z.number(), nombre: z.string(), rol: z.enum(["dueno", "prospectador"]) });

export async function crearToken(u: SesionUsuario): Promise<string> {
  return new SignJWT({ ...u }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secreto());
}

export async function verificarToken(token: string): Promise<SesionUsuario | null> {
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"] });
    const p = Payload.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

// --- Portal del cliente (pieza 5). Misma firma, otra audiencia: un token del portal no pasa
// verificarToken (no trae rol del panel) y uno del panel no pasa verificarTokenCliente (no trae la audiencia).
export type SesionCliente = { usuarioId: number; clienteId: number; v: number };
const AUDIENCIA_PORTAL = "portal";
const PayloadCliente = z.object({ usuarioId: z.number().int().positive(), clienteId: z.number().int().positive(), v: z.number().int().min(0) });

export async function crearTokenCliente(s: SesionCliente): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCIA_PORTAL).setIssuedAt().setExpirationTime("30d").sign(secreto());
}

export async function verificarTokenCliente(token: string): Promise<SesionCliente | null> {
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"], audience: AUDIENCIA_PORTAL });
    const p = PayloadCliente.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
