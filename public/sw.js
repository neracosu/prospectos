/* Service worker minimo del panel (pasada de UX, fase C). Hace DOS cosas y nada mas:
   1. Guarda los assets con hash de Next (JS, CSS, fuentes), los iconos y el manifiesto: con senal debil la pantalla
      no queda en blanco esperando el CSS.
   2. Si una navegacion del panel falla por falta de red, muestra /sin-conexion.
   NUNCA cachea HTML, RSC ni datos, y no toca el portal del cliente (/c), las propuestas (/p), los recibos ni la api.
   La decision vive en `decidir`, una funcion pura que prueba tests/sw.test.ts. Se registra solo en produccion. */
var CACHE = "pr-estaticos-v1";
var SIN_CONEXION = "/sin-conexion";
var TOPE = 200;

function decidir(metodo, url, modo, origen) {
  if (metodo !== "GET") return "ignorar";
  var u;
  try { u = new URL(url); } catch (e) { return "ignorar"; }
  if (u.origin !== origen) return "ignorar";
  var ruta = u.pathname;
  if (ruta.indexOf("/_next/static/") === 0 || ruta.indexOf("/icono") === 0 || ruta === "/manifest.webmanifest") return "estatico";
  if (modo !== "navigate") return "ignorar";
  var fuera = ["/c/", "/p/", "/recibos/", "/api/", "/entrar", "/salir", SIN_CONEXION];
  for (var i = 0; i < fuera.length; i++) if (ruta === fuera[i] || ruta.indexOf(fuera[i]) === 0) return "ignorar";
  if (/\/documentos(\/|$)/.test(ruta)) return "ignorar";
  return "navegacion";
}

function podar(cache) {
  return cache.keys().then(function (claves) {
    if (claves.length <= TOPE) return;
    return Promise.all(claves.slice(0, claves.length - TOPE).map(function (k) { return cache.delete(k); }));
  });
}

if (typeof self !== "undefined" && self.addEventListener && typeof caches !== "undefined") {
  self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) { return c.add(SIN_CONEXION); }).then(function () { return self.skipWaiting(); }));
  });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (nombres) {
      return Promise.all(nombres.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); }));
  });
  self.addEventListener("fetch", function (e) {
    var que = decidir(e.request.method, e.request.url, e.request.mode, self.location.origin);
    if (que === "estatico") {
      e.respondWith(caches.open(CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (r) {
            if (r && r.ok) c.put(e.request, r.clone()).then(function () { return podar(c); });
            return r;
          });
        });
      }));
    } else if (que === "navegacion") {
      e.respondWith(fetch(e.request).catch(function () {
        return caches.open(CACHE).then(function (c) { return c.match(SIN_CONEXION); }).then(function (hit) {
          return hit || new Response("Sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        });
      }));
    }
  });
}

if (typeof module !== "undefined") module.exports = { decidir: decidir, CACHE: CACHE, SIN_CONEXION: SIN_CONEXION };
