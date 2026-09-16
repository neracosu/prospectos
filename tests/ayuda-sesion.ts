import type { SesionUsuario } from "@/lib/auth";

// Solo el estado mutable. El vi.mock de "@/lib/sesion" va en cada archivo de
// test que lo necesite (vi.mock se iza solo dentro del archivo que lo llama).
export const sesionFalsa: { actual: SesionUsuario | null } = { actual: null };
