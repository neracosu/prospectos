import { describe, it, expect } from "vitest";
import { puedePasarLead, destinosLead, naceLead, claveLead, nichoDesdeRubro, fuenteDesdeSolicitud, ETIQUETA_ETAPA_LEAD, ETIQUETA_FUENTE, FUENTES_LEAD } from "@/lib/leads-contrato";

describe("transiciones de un lead", () => {
  it("desde Nuevo se puede ir a cualquier etapa", () => {
    expect(destinosLead("por_contactar")).toHaveLength(5);
    expect(puedePasarLead("por_contactar", "reunion")).toBe(true);
    expect(puedePasarLead("por_contactar", "ganado")).toBe(true);
  });
  it("una conversacion real va y viene entre propuesta, conversando y demo; ganado no sale; descartado vuelve a nuevo", () => {
    expect(puedePasarLead("enviado", "por_contactar")).toBe(false);
    expect(puedePasarLead("respondio", "enviado")).toBe(true);
    expect(puedePasarLead("reunion", "respondio")).toBe(true);
    expect(puedePasarLead("ganado", "respondio")).toBe(false);
    expect(puedePasarLead("descartado", "por_contactar")).toBe(true);
    expect(puedePasarLead("descartado", "ganado")).toBe(false);
  });
  it("las etiquetas son las de una conversacion, no las de la cola", () => {
    expect(ETIQUETA_ETAPA_LEAD.por_contactar).toBe("Nuevo");
    expect(ETIQUETA_ETAPA_LEAD.enviado).toBe("Propuesta enviada");
    expect(ETIQUETA_ETAPA_LEAD.respondio).toBe("Conversando");
    expect(ETIQUETA_ETAPA_LEAD.reunion).toBe("Demo o diagnóstico");
  });
});

describe("que nace lead y como se identifica", () => {
  it("solo manual y solicitud nacen lead", () => {
    expect(naceLead("manual")).toBe(true);
    expect(naceLead("solicitud")).toBe(true);
    for (const o of ["maps", "overpass", "overture", "importado", "web"]) expect(naceLead(o)).toBe(false);
  });
  it("la clave de un lead lleva el contacto para que dos personas con el mismo nombre no choquen", () => {
    expect(claveLead("Boutique Alma", "", "0412-123.4567")).toBe("boutiquealma||04121234567");
    expect(claveLead("Ana", "", "")).toBe("ana||");
    expect(claveLead("Ana Pérez", "Caracas", "ana@x.com")).toBe("anaperez|caracas|anaxcom");
  });
  it("fuentes con etiqueta", () => {
    expect(FUENTES_LEAD).toEqual(["web", "embudo", "whatsapp", "instagram", "referido", "directorio", "otro"]);
    expect(ETIQUETA_FUENTE.embudo).toBe("Embudo /empezar");
  });
});

describe("desde una solicitud", () => {
  it("el nicho sale del rubro del embudo y lo desconocido cae en otro", () => {
    expect(nichoDesdeRubro("citas")).toBe("clinicas-y-consultorios");
    expect(nichoDesdeRubro("hoteles")).toBe("hoteles-estadia");
    expect(nichoDesdeRubro("restaurantes")).toBe("restaurantes-y-bares");
    expect(nichoDesdeRubro("reservas")).toBe("canchas-y-espacios");
    expect(nichoDesdeRubro("comercio")).toBe("comercio");
    expect(nichoDesdeRubro("logistica")).toBe("otro");
    expect(nichoDesdeRubro("x")).toBe("otro");
    expect(nichoDesdeRubro("")).toBe("otro");
  });
  it("la fuente es embudo o web", () => {
    expect(fuenteDesdeSolicitud({ tipo: "embudo", origen: "tiktok" })).toBe("embudo");
    expect(fuenteDesdeSolicitud({ tipo: "Software a Medida", origen: "" })).toBe("web");
  });
});
