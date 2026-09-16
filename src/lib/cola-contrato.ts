import { prioridadContacto, type ContactoProspecto } from "@/lib/canales-contrato";

// Cola compartida: primero los que se contactan mas rapido (WhatsApp), al final
// los que solo tienen redes. Dentro de cada grupo manda ordenCola (saltar lo sube).
export function ordenarCola<T extends ContactoProspecto & { ordenCola: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => prioridadContacto(a) - prioridadContacto(b) || a.ordenCola - b.ordenCola);
}
