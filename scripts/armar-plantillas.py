#!/usr/bin/env python3
"""Arma plantillas/<arquetipo>.html a partir de plantillas/base/ (cabecera con el CSS de hoteles.html, barra,
autor, que-recibe, comparar, condiciones) y de plantillas/base/<arquetipo>.cuerpo.html.

Los cuerpos usan {{nombre}} {{ciudad}} {{rubro}} y los bloques <!--si:web--> / <!--si:sinweb-->, que rellena
renderPropuesta en el servidor. Un cuerpo declara arriba, en comentarios:
  <!--titulo: ...--> <!--descripcion: ...--> <!--pagina: restaurantes-y-bares--> <!--hojas: 8--> <!--wa: texto del WhatsApp-->
Uso: python3 scripts/armar-plantillas.py   (idempotente; hoteles.html y hoteles-estadia.html no se tocan)
"""
import pathlib, re, urllib.parse
BASE = pathlib.Path(__file__).resolve().parent.parent / "plantillas"
base = {p.stem: p.read_text(encoding="utf-8") for p in (BASE / "base").glob("*.html") if not p.name.endswith(".cuerpo.html")}
for cuerpo in sorted((BASE / "base").glob("*.cuerpo.html")):
    slug = cuerpo.name.replace(".cuerpo.html", "")
    t = cuerpo.read_text(encoding="utf-8")
    meta = dict(re.findall(r"<!--(titulo|descripcion|pagina|hojas|wa):\s*(.*?)-->", t))
    for k in ("titulo", "descripcion", "pagina", "hojas", "wa"):
        assert k in meta, f"{cuerpo.name}: falta <!--{k}: ...-->"
    t = re.sub(r"<!--(titulo|descripcion|pagina|hojas|wa):.*?-->\n?", "", t)
    for nombre, frag in base.items():
        t = t.replace(f"<!--incluir:{nombre}-->", frag.rstrip("\n"))
    assert "<!--incluir:" not in t, f"{cuerpo.name}: queda un incluir sin resolver"
    cab = base["cabecera"].replace("__TITULO__", meta["titulo"]).replace("__DESCRIPCION__", meta["descripcion"])
    doc = cab + "\n" + t
    doc = doc.replace("__HOJAS__", meta["hojas"]).replace("__PAGINA__", meta["pagina"]).replace("__WA__", urllib.parse.quote(meta["wa"]))
    hojas = len(re.findall(r'<section class="hoja', doc))
    assert hojas == int(meta["hojas"]), f"{slug}: declara {meta['hojas']} hojas y tiene {hojas}"
    (BASE / f"{slug}.html").write_text(doc, encoding="utf-8")
    print(f"{slug}.html: {hojas} hojas, {len(doc)} bytes")
