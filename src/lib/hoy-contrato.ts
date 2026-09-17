// Cifras de la pantalla Hoy con un ajuste optimista encima (pasada de UX, fase B): al tocar «Si» la tarjeta
// se va y el numero del dia sube sin esperar al servidor. Puro: lo usan el navegador y los tests.
export type CifrasHoy = { enviados: number; meta: number; por_contactar: number; enviado: number; respondio: number; reunion: number };
export type AjusteHoy = Partial<Record<"enviados" | "por_contactar" | "enviado" | "respondio", number>>;
const CLAVES_AJUSTE = ["enviados", "por_contactar", "enviado", "respondio"] as const;

export const AJUSTE_ENVIO: AjusteHoy = { enviados: 1, por_contactar: -1, enviado: 1 };
export const AJUSTE_RESPONDIO: AjusteHoy = { enviado: -1, respondio: 1 };
export const AJUSTE_DESCARTE_ENVIADO: AjusteHoy = { enviado: -1 };

export function sumarAjustes(a: AjusteHoy, b: AjusteHoy): AjusteHoy {
  const r: AjusteHoy = {};
  for (const k of CLAVES_AJUSTE) {
    const v = (a[k] ?? 0) + (b[k] ?? 0);
    if (v !== 0) r[k] = v;
  }
  return r;
}

export function invertir(a: AjusteHoy): AjusteHoy {
  const r: AjusteHoy = {};
  for (const k of CLAVES_AJUSTE) if (a[k]) r[k] = -a[k]!;
  return r;
}

// Nunca una cifra negativa: si el servidor ya habia descontado algo, el ajuste no lo descuenta dos veces a la vista.
export function aplicarAjuste(base: CifrasHoy, ajuste: AjusteHoy): CifrasHoy {
  const r = { ...base };
  for (const k of CLAVES_AJUSTE) r[k] = Math.max(0, base[k] + (ajuste[k] ?? 0));
  return r;
}

export function porcentajeDelDia(c: { enviados: number; meta: number }): number {
  return c.meta ? Math.min(100, Math.round((c.enviados / c.meta) * 100)) : 0;
}

// Cambia cuando el servidor trae cifras nuevas: ahi el ajuste optimista ya esta contado y se pone en cero.
export function firmaCifras(c: CifrasHoy): string {
  return [c.enviados, c.meta, c.por_contactar, c.enviado, c.respondio, c.reunion].join("|");
}
