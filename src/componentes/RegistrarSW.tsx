"use client";
import { useEffect } from "react";

// Registra public/sw.js (fase C). Solo en produccion: en desarrollo un service worker cachea chunks viejos y
// vuelve loco al que programa. Solo desde el layout del panel: el portal del cliente no lo registra (aunque el
// alcance sea /, `decidir` ignora /c).
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Si la instalacion falla (un asset que dio 404 en medio de un despliegue, un 503 de Apache), register()
      // resuelve igual y el navegador lo reintenta en cada carga: que al menos quede rastro en consola.
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => { if (nuevo.state === "redundant") console.warn("service worker: la instalación falló; se reintenta en la próxima carga"); });
    }).catch((e) => console.warn("service worker:", e));
  }, []);
  return null;
}
