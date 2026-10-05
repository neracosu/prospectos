#!/usr/bin/env python3
# scripts/extraer-overture.py — baja de Overture Maps los lugares de Venezuela con confianza >= 0.7 y los deja en
# ~/overture/ve-<publicacion>.jsonl (600), un objeto por renglon, listos para scripts/cargar-overture.mts.
# Es la UNICA salida a internet de esta pieza y se corre a mano. Necesita duckdb (pip3 install --user duckdb).
# Uso:  python3 scripts/extraer-overture.py 2026-09-23.1
# Las publicaciones: https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/
import json, os, re, sys
import duckdb

if len(sys.argv) != 2 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", sys.argv[1]):
    sys.exit("Uso: extraer-overture.py <publicacion>   (por ejemplo 2026-09-23.1)")
pub = sys.argv[1]
carpeta = os.path.expanduser("~/overture")
os.makedirs(carpeta, mode=0o700, exist_ok=True)
destino = os.path.join(carpeta, f"ve-{pub}.jsonl")

c = duckdb.connect()
# El servidor es compartido con cuatro sitios en vivo: pocos hilos y memoria acotada.
c.execute(f"INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET threads=3; SET memory_limit='2GB'; SET temp_directory='{carpeta}/tmp'")
filas = c.execute(f"""
  SELECT id, names."primary", basic_category, taxonomy."primary", bbox.ymin, bbox.xmin, addresses[1].freeform,
         coalesce(phones, []), coalesce(emails, []), coalesce(websites, []), coalesce(socials, []), confidence
  FROM read_parquet('s3://overturemaps-us-west-2/release/{pub}/theme=places/type=place/*', hive_partitioning=0)
  WHERE bbox.xmin BETWEEN -73.5 AND -59.7 AND bbox.ymin BETWEEN 0.5 AND 12.3
    AND addresses[1].country = 'VE'
    AND confidence >= 0.7
    AND names."primary" IS NOT NULL
    AND basic_category IS NOT NULL
    AND coalesce(operating_status, '') <> 'permanently_closed'
""").fetchall()
claves = ["id", "nombre", "categoriaBase", "categoriaFina", "lat", "lon", "direccion", "telefonos", "correos", "webs", "redes", "confianza"]
tmp = destino + ".tmp"
with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
    for fila in filas:
        f.write(json.dumps(dict(zip(claves, fila)), ensure_ascii=False) + "\n")
os.replace(tmp, destino)
print(f"{len(filas)} lugares -> {destino}")
