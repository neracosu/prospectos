import { describe, it, expect } from "vitest";
import { TAMANO_MAXIMO, ACEPTA, RUTA_DOCUMENTO, detectarTipo, nombreVisible, tamanoLegible, descripcionDocumento, siglaDocumento, problemaDeArchivo, disposicion } from "@/lib/documentos-contrato";

const bytes = (...n: number[]) => new Uint8Array([...n, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("documentos (contrato)", () => {
  it("el tipo sale de la firma de bytes, no del nombre", () => {
    expect(detectarTipo(new TextEncoder().encode("%PDF-1.7 resto"))).toBe("application/pdf");
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectarTipo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectarTipo(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("application/zip");
    expect(detectarTipo(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("application/zip"); // zip vacio
    expect(detectarTipo(bytes(0x4d, 0x5a, 0x90))).toBeNull();                     // .exe
    expect(detectarTipo(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectarTipo(new TextEncoder().encode(" %PDF-1.7"))).toBeNull();       // la firma va en el byte 0
    expect(detectarTipo(new Uint8Array())).toBeNull();
  });
  it("nombreVisible: lo que escribio Neri, o el nombre del archivo sin ruta ni extension; nunca vacio ni con caracteres de control", () => {
    expect(nombreVisible("  Contrato   firmado ", "x.pdf")).toBe("Contrato firmado");
    expect(nombreVisible("", "C:\\fotos\\plano piso 2.final.JPG")).toBe("plano piso 2.final");
    expect(nombreVisible("", "../../etc/passwd")).toBe("passwd");
    expect(nombreVisible("a\u0000b\u001fc\u007f", "x.pdf")).toBe("abc");
    expect(nombreVisible("", ".pdf")).toBe("Documento");
    expect(nombreVisible("x".repeat(200), "x.pdf")).toHaveLength(120);
  });
  it("tamanos como se leen en Venezuela (coma decimal)", () => {
    expect(tamanoLegible(900)).toBe("900 bytes");
    expect(tamanoLegible(860_160)).toBe("840 KB");
    expect(tamanoLegible(1_258_291)).toBe("1,2 MB");
    expect(tamanoLegible(TAMANO_MAXIMO)).toBe("10,0 MB");
    expect(descripcionDocumento({ tipoMime: "application/pdf", tamano: 1_258_291 })).toBe("PDF de 1,2 MB");
    expect(descripcionDocumento({ tipoMime: "image/png", tamano: 860_160 })).toBe("Imagen de 840 KB");
    expect(descripcionDocumento({ tipoMime: "otra/cosa", tamano: 10 })).toBe("Archivo de 10 bytes");
    expect(siglaDocumento("image/jpeg")).toBe("JPG");
    expect(siglaDocumento("otra/cosa")).toBe("DOC");
  });
  it("problemaDeArchivo: lo que se le dice a Neri ANTES de subir (por extension y peso; el servidor valida el contenido)", () => {
    expect(problemaDeArchivo({ nombre: "manual.PDF", tamano: 1000 })).toBeNull();
    expect(problemaDeArchivo({ nombre: "foto.jpeg", tamano: TAMANO_MAXIMO })).toBeNull();
    expect(problemaDeArchivo({ nombre: "video.mp4", tamano: 1000 })).toBe("Solo se aceptan PDF, JPG, PNG o ZIP.");
    expect(problemaDeArchivo({ nombre: "grande.zip", tamano: TAMANO_MAXIMO + 1 })).toBe("Pesa 10,0 MB y el máximo es 10 MB.");
    expect(problemaDeArchivo({ nombre: "video.mp4", tamano: 50_541_363 })).toBe("Pesa 48,2 MB y el máximo es 10 MB. Solo se aceptan PDF, JPG, PNG o ZIP.");
    expect(problemaDeArchivo({ nombre: "vacio.pdf", tamano: 0 })).toBe("El archivo está vacío.");
    expect(ACEPTA).toContain(".zip");
  });
  it("disposicion: PDF e imagenes en linea, ZIP descarga; el nombre no puede romper la cabecera", () => {
    expect(disposicion("application/pdf", "Manual de recepción")).toBe(`inline; filename="Manual de recepcion.pdf"; filename*=UTF-8''Manual%20de%20recepci%C3%B3n.pdf`);
    expect(disposicion("application/zip", "Respaldo.zip")).toBe(`attachment; filename="Respaldo.zip"; filename*=UTF-8''Respaldo.zip`);
    expect(disposicion("image/png", 'a"b\r\nc;d')).toBe(`inline; filename="a_b__c_d.png"; filename*=UTF-8''a%22b%0D%0Ac%3Bd.png`);
    expect(disposicion("otra/cosa", "x")).toBe(`attachment; filename="x"; filename*=UTF-8''x`);
  });
  it("RUTA_DOCUMENTO solo acepta documentos/<numero>/<uuid>.<ext conocida>", () => {
    expect(RUTA_DOCUMENTO.test("documentos/12/11111111-1111-4111-8111-111111111111.pdf")).toBe(true);
    for (const mala of ["documentos/12/../../recibos/2026/R-2026-0001.pdf", "/etc/passwd", "documentos/12/x.pdf", "documentos/a/11111111-1111-4111-8111-111111111111.pdf", "documentos/12/11111111-1111-4111-8111-111111111111.exe", "recibos/12/11111111-1111-4111-8111-111111111111.pdf"]) {
      expect(RUTA_DOCUMENTO.test(mala), mala).toBe(false);
    }
  });
});
