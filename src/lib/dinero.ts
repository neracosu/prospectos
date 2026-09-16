// Dinero en memoria: number con 2 decimales. En la base: DECIMAL(10,2).
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatoUSD(n: number): string {
  const [ent, dec] = redondear2(n).toFixed(2).split(".");
  return `$${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

// La cantidad de decimales no se limita a 2: un texto como "1.500" debe
// leerse como 1,5 (el punto es el separador decimal, no de miles), y el
// redondeo final a centavos corre por cuenta de montoDesdeTexto.
export const MONTO_TEXTO = /^\d{1,8}([.,]\d+)?$/;

export function montoDesdeTexto(s: string): number | null {
  const t = s.trim();
  if (!MONTO_TEXTO.test(t)) return null;
  return redondear2(Number(t.replace(",", ".")));
}
