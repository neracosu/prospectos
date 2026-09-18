/* Service worker minimo del panel (pasada de UX, fase C). Hace DOS cosas y nada mas:
   1. Guarda los assets con hash de Next (JS, CSS, fuentes): con senal debil la pantalla no queda en blanco esperando
      el CSS. Los iconos y el manifiesto (sin hash) van por red y solo se usa la copia si la red falla.
   2. Si una navegacion del panel falla por falta de red, muestra /sin-conexion (precacheada, en su propia cache que
      la poda no toca).
   NUNCA cachea HTML, RSC ni datos, y no responde por el portal del cliente (/c), las propuestas (/p), los recibos ni
   la api. La decision vive en `decidir`, una funcion pura que prueba tests/sw.test.ts. Se registra solo en produccion.
   Al cambiar la pagina de sin conexion, subir VERSION: `activate` bota las caches de otras versiones. */
var VERSION = "v1";
var CACHE = "pr-estaticos-" + VERSION;
var CACHE_FIJA = "pr-sin-conexion-" + VERSION;
var SIN_CONEXION = "/sin-conexion";
var TOPE = 200;

function decidir(metodo, url, modo, origen) {
  if (metodo !== "GET") return "ignorar";
  var u;
  try { u = new URL(url); } catch (e) { return "ignorar"; }
  if (u.origin !== origen) return "ignorar";
  var ruta = u.pathname;
  if (ruta.indexOf("/_next/static/") === 0) return "estatico";
  if (ruta.indexOf("/icono") === 0 || ruta === "/manifest.webmanifest") return "respaldo";
  if (modo !== "navigate") return "ignorar";
  var fuera = ["/c/", "/p/", "/recibos/", "/api/", "/entrar", "/salir", SIN_CONEXION];
  for (var i = 0; i < fuera.length; i++) if (ruta === fuera[i] || ruta.indexOf(fuera[i]) === 0) return "ignorar";
  if (/\/documentos(\/|$)/.test(ruta)) return "ignorar";
  return "navegacion";
}

// Las rutas con hash que referencia un HTML (su CSS, su JS, sus fuentes precargadas).
function extraerRutas(html) {
  var rutas = [], m, re = /(?:href|src)="(\/_next\/static\/[^"]+)"/g;
  while ((m = re.exec(html))) if (rutas.indexOf(m[1]) < 0) rutas.push(m[1]);
  return rutas;
}

// Solo la cache de assets se poda (las claves salen en orden de insercion: se van las mas viejas).
function podar(cache, tope) {
  return cache.keys().then(function (claves) {
    if (claves.length <= tope) return;
    return Promise.all(claves.slice(0, claves.length - tope).map(function (k) { return cache.delete(k); }));
  });
}

if (typeof self !== "undefined" && self.addEventListener && typeof caches !== "undefined") {
  // Al instalar se guarda la pagina de sin conexion Y los archivos con hash que ella referencia, en una cache
  // aparte: sin ellos, sin red, la pagina sale sin estilo; y en la cache de assets la poda se los comeria.
  function precachear(c) {
    return fetch(SIN_CONEXION).then(function (r) {
      if (!r.ok) throw new Error("sin-conexion " + r.status);
      var copia = r.clone();
      return r.text().then(function (html) {
        return c.put(SIN_CONEXION, copia).then(function () { return c.addAll(extraerRutas(html)); });
      });
    });
  }
  self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(CACHE_FIJA).then(precachear).then(function () { return self.skipWaiting(); }));
  });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (nombres) {
      return Promise.all(nombres.filter(function (n) { return n !== CACHE && n !== CACHE_FIJA; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); }));
  });
  self.addEventListener("fetch", function (e) {
    var que = decidir(e.request.method, e.request.url, e.request.mode, self.location.origin);
    if (que === "estatico") {
      // Cache primero: el nombre lleva el hash del contenido, asi que lo guardado nunca queda viejo.
      e.respondWith(caches.open(CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (r) {
            if (r && r.ok) c.put(e.request, r.clone()).then(function () { return podar(c, TOPE); });
            return r;
          });
        });
      }));
    } else if (que === "respaldo") {
      // Red primero: iconos y manifiesto no llevan hash y pueden cambiar en un despliegue; la copia es solo para sin red.
      e.respondWith(caches.open(CACHE).then(function (c) {
        return fetch(e.request).then(function (r) {
          if (r && r.ok) c.put(e.request, r.clone());
          return r;
        }).catch(function () { return c.match(e.request); });
      }));
    } else if (que === "navegacion") {
      // Red siempre. Aqui no hay put: el HTML del panel jamas se guarda.
      e.respondWith(fetch(e.request).catch(function () {
        return caches.open(CACHE_FIJA).then(function (c) { return c.match(SIN_CONEXION); }).then(function (hit) {
          return hit || new Response("Sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        });
      }));
    }
  });
}

if (typeof module !== "undefined") module.exports = { decidir: decidir, extraerRutas: extraerRutas, podar: podar, CACHE: CACHE, CACHE_FIJA: CACHE_FIJA, SIN_CONEXION: SIN_CONEXION };
