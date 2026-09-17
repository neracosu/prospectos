import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { dirArchivos } from "@/lib/archivos";
import { guardarDocumento, quitarDocumento, documentosDeProyecto, documentoParaServir, rutaDeDocumento } from "@/lib/documentos";

const PDF = new TextEncoder().encode("%PDF-1.7 documento de prueba");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const contarArchivos = (dir: string): number => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0);

describe.runIf(DB_HABILITADA)("documentos en disco y en la base", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let clienteId = 0;
  let proyectoId = 0;
  const raiz = () => path.join(dirArchivos(), "documentos");
  beforeAll(async () => {
    await limpiarBase();
    rmSync(raiz(), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente();
    clienteId = c.id;
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId)).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guarda el archivo fuera del docroot, en la carpeta del cliente, con permisos 600, y deja fila y evento", async () => {
    const r = await guardarDocumento({ proyectoId, nombre: "", nombreArchivo: "Manual de recepción.pdf", bytes: PDF, usuarioId: ids.usuarioId });
    const d = await prisma.documento.findUniqueOrThrow({ where: { id: r.id } });
    expect(d).toMatchObject({ proyectoId, nombre: "Manual de recepción", tipoMime: "application/pdf", tamano: PDF.length, usuarioId: ids.usuarioId, quitadoEn: null });
    expect(d.archivo).toMatch(new RegExp(`^documentos/${clienteId}/[0-9a-f-]{36}\\.pdf$`));
    const ruta = rutaDeDocumento(d.archivo);
    expect(ruta.startsWith(raiz() + path.sep)).toBe(true);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(statSync(ruta).size).toBe(PDF.length);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "documento_subido", texto: "Manual de recepción", usuarioId: ids.usuarioId } })).toBe(1);
  });

  it("el tipo lo decide el contenido: un .exe llamado .pdf no entra, y no deja nada en disco ni en la base", async () => {
    const antes = { archivos: contarArchivos(raiz()), filas: await prisma.documento.count() };
    await expect(guardarDocumento({ proyectoId, nombre: "Factura", nombreArchivo: "factura.pdf", bytes: EXE, usuarioId: ids.usuarioId })).rejects.toThrow("TIPO_NO_PERMITIDO");
    await expect(guardarDocumento({ proyectoId, nombre: "x", nombreArchivo: "x.pdf", bytes: new Uint8Array(), usuarioId: ids.usuarioId })).rejects.toThrow("ARCHIVO_VACIO");
    const grande = new Uint8Array(TAMANO_MAXIMO + 1); grande.set(PDF);
    await expect(guardarDocumento({ proyectoId, nombre: "x", nombreArchivo: "x.pdf", bytes: grande, usuarioId: ids.usuarioId })).rejects.toThrow("ARCHIVO_GRANDE");
    await expect(guardarDocumento({ proyectoId: 999_999, nombre: "x", nombreArchivo: "x.pdf", bytes: PDF, usuarioId: ids.usuarioId })).rejects.toThrow("PROYECTO_NO_EXISTE");
    expect({ archivos: contarArchivos(raiz()), filas: await prisma.documento.count() }).toEqual(antes);
  });

  it("quitar no borra: la fila queda marcada, el archivo sigue en disco, y el segundo toque no duplica el evento", async () => {
    const { id } = await guardarDocumento({ proyectoId, nombre: "Plano", nombreArchivo: "plano.pdf", bytes: PDF, usuarioId: ids.usuarioId });
    const d = await prisma.documento.findUniqueOrThrow({ where: { id } });
    expect(await quitarDocumento(id, ids.usuarioId)).toEqual({ proyectoId, quitado: true });
    expect(await quitarDocumento(id, ids.usuarioId)).toEqual({ proyectoId, quitado: false });
    expect((await prisma.documento.findUniqueOrThrow({ where: { id } })).quitadoEn).not.toBeNull();
    expect(existsSync(rutaDeDocumento(d.archivo))).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "documento_quitado", texto: "Plano" } })).toBe(1);
    await expect(quitarDocumento(999_999, ids.usuarioId)).rejects.toThrow("DOCUMENTO_NO_EXISTE");
  });

  it("la lista del proyecto trae solo los vigentes, el mas nuevo primero; para servir se sabe de que cliente es y si esta quitado", async () => {
    const lista = await documentosDeProyecto(proyectoId);
    expect(lista.map((x) => x.nombre)).toEqual(["Manual de recepción"]);
    expect(Object.keys(lista[0]).sort()).toEqual(["id", "nombre", "subidoEn", "tamano", "tipoMime"]);
    const quitado = await prisma.documento.findFirstOrThrow({ where: { nombre: "Plano" } });
    expect(await documentoParaServir(quitado.id)).toMatchObject({ nombre: "Plano", quitado: true, clienteId });
    expect(await documentoParaServir(lista[0].id)).toMatchObject({ tipoMime: "application/pdf", quitado: false, clienteId });
    expect(await documentoParaServir(999_999)).toBeNull();
    expect(await documentoParaServir(-1)).toBeNull();
  });

  it("rutaDeDocumento no sale nunca de la carpeta de documentos", () => {
    for (const mala of ["documentos/1/../../recibos/2026/R-2026-0001.pdf", "/etc/passwd", "recibos/2026/R-2026-0001.pdf", ""]) {
      expect(() => rutaDeDocumento(mala), mala).toThrow("DOCUMENTO_INVALIDO");
    }
  });
});
