// Dinero en memoria: number con 2 decimales. En la base: DECIMAL(10,2).
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatoUSD(n: number): string {
  const v = redondear2(n);
  const signo = v < 0 ? "-" : "";
  const [ent, dec] = Math.abs(v).toFixed(2).split(".");
  return `${signo}$${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

// Los decimales se limitan a 2: un tercer digito se rechaza porque "1.500"
// seria un separador de miles (mil quinientos), no un decimal, y los
// formularios piden el monto sin separador de miles.
export const MONTO_TEXTO = /^\d{1,8}([.,]\d{1,2})?$/;

export function montoDesdeTexto(s: string): number | null {
  const t = s.trim();
  if (!MONTO_TEXTO.test(t)) return null;
  return redondear2(Number(t.replace(",", ".")));
}
