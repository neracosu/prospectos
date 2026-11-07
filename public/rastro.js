(function () {
  try {
    // token del enlace: viene en data-enlace del propio script
    var s = document.currentScript;
    if (!s) { var l = document.querySelectorAll("script[data-enlace]"); s = l[l.length - 1]; }
    var token = s && s.getAttribute("data-enlace");
    if (!token || navigator.webdriver) return;
    var q = location.search, L = null;
    try { L = window.localStorage; } catch (e) {}
    // ?soyyo=1 marca este navegador como propio y no manda nada; ?soyyo=0 lo deshace
    try {
      if (/[?&]soyyo=1(&|$)/.test(q) && L) L.setItem("nc_soyyo", "1");
      if (/[?&]soyyo=0(&|$)/.test(q) && L) L.removeItem("nc_soyyo");
      if (L && L.getItem("nc_soyyo") === "1") return;
    } catch (e) {}
    var url = s.src.split("/").slice(0, 3).join("/") + "/api/rastro/evento";
    var ruta = location.pathname;
    // sendBeacon como text/plain (peticion simple); fetch keepalive de respaldo
    function mandar(o) {
      try {
        o.token = token; o.ruta = ruta;
        var j = JSON.stringify(o);
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([j], { type: "text/plain;charset=UTF-8" }))) return;
        fetch(url, { method: "POST", body: j, keepalive: true, mode: "cors", credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } });
      } catch (e) {}
    }
    function param(k) {
      var m = new RegExp("[?&]" + k + "=([^&]*)").exec(q);
      try { return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : ""; } catch (e) { return ""; }
    }
    // origen como medir.js: ?de=, utm_source, fbclid, host del referer ajeno
    function origen() {
      var v = param("de") || param("utm_source");
      if (v) return v;
      if (/[?&]fbclid=/.test(q)) return "facebook";
      var h = "";
      try { h = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
      return /(^|\.)neracosu\.com$/.test(h) ? "" : h;
    }
    var acum = 0, desde = 0, scroll = 0, enviado = false;
    function visible() { return document.visibilityState === "visible"; }
    // scroll maximo alcanzado, en % del documento
    function medir() {
      try {
        var alto = document.documentElement.scrollHeight || 1;
        var p = Math.round(((window.pageYOffset || 0) + window.innerHeight) / alto * 100);
        if (p > scroll) scroll = Math.min(100, Math.max(0, p));
      } catch (e) {}
    }
    // un solo fin por ciclo visible -> oculto
    function cerrar() {
      try {
        if (enviado) return;
        enviado = true;
        if (desde) { acum += Date.now() - desde; desde = 0; }
        medir();
        mandar({ tipo: "fin", segundos: Math.round(acum / 1000), scroll: scroll });
      } catch (e) {}
    }
    if (visible()) desde = Date.now();
    medir();
    mandar({ tipo: "inicio", origen: origen(), ancho: window.innerWidth });
    document.addEventListener("visibilitychange", function () {
      try {
        if (visible()) { enviado = false; acum = 0; desde = Date.now(); } else cerrar();
      } catch (e) {}
    });
    window.addEventListener("pagehide", cerrar);
    window.addEventListener("scroll", function () { try { medir(); } catch (e) {} }, { passive: true });
    // clics: data-rastro manda; si no, pdf, whatsapp, correo y telefono por el href
    document.addEventListener("click", function (ev) {
      try {
        var a = ev.target && ev.target.closest ? ev.target.closest("a,button") : null;
        if (!a) return;
        var d = a.getAttribute("data-rastro");
        if (!d && a.tagName === "A") {
          var h = a.getAttribute("href") || "";
          d = /\.pdf$/i.test(h) ? "pdf" : /wa\.me|api\.whatsapp\.com|^whatsapp:/.test(h) ? "whatsapp" : /^mailto:/i.test(h) ? "correo" : /^tel:/i.test(h) ? "telefono" : "";
        }
        if (d) mandar({ tipo: "clic", detalle: d });
      } catch (e) {}
    }, true);
  } catch (e) {}
})();
