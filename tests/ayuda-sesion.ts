import type { SesionUsuario } from "@/lib/auth";
import type { SesionPortal } from "@/lib/acceso-cliente";

// Solo el estado mutable. El vi.mock de "@/lib/sesion" va en cada archivo de
// test que lo necesite (vi.mock se iza solo dentro del archivo que lo llama).
export const sesionFalsa: { actual: SesionUsuario | null } = { actual: null };

// Igual que sesionFalsa, para la sesion del portal del cliente. El vi.mock de
// "@/lib/sesion-cliente" va en cada archivo de test que lo necesite.
export const sesionClienteFalsa: { actual: SesionPortal | null } = { actual: null };
