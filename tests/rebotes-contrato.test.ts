import { describe, it, expect } from "vitest";
import { leerRebote, esAvisoDeRebote } from "@/lib/rebotes-contrato";

const EXIM = `Return-path: <>
X-Failed-Recipients: cap@yayustexmex.com
Auto-Submitted: auto-replied
From: Mail Delivery System <Mailer-Daemon@vmi.contaboserver.net>
To: info@neracosu.com
Content-Type: multipart/report; report-type=delivery-status; boundary=1793470240-eximdsn-1148205290
Subject: Mail delivery failed: returning message to sender

--1793470240-eximdsn-1148205290
Content-type: text/plain; charset=us-ascii

A message that you sent could not be delivered to one or more of its
recipients. This is a permanent error. The following address(es) failed:

  cap@yayustexmex.com
    The mail server could not deliver mail to cap@yayustexmex.com.  The account or domain may not exist.

--1793470240-eximdsn-1148205290
Content-type: message/delivery-status

Action: failed
Final-Recipient: rfc822;cap@yayustexmex.com
Status: 5.0.0

--1793470240-eximdsn-1148205290
Content-type: text/rfc822-headers

From: Neri <info@neracosu.com>
To: cap@yayustexmex.com
Subject: Propuesta para Yayus Tex Mex Grill: comandas y caja sin cuaderno
`;

const GMAIL = `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
Subject: Delivery Status Notification (Failure)
X-Failed-Recipients: Massalud@Farmaplus.com.ve
Content-Type: multipart/report; boundary="000000000000c7d9"; report-type=delivery-status

--000000000000c7d9
Content-Type: text/plain; charset="UTF-8"

** Address not found **

Your message wasn't delivered to massalud@farmaplus.com.ve because the address couldn't be found.

--000000000000c7d9
Content-Type: message/delivery-status

Final-Recipient: rfc822; massalud@farmaplus.com.ve
Action: failed
Status: 5.1.3
Diagnostic-Code: smtp; The email account that you tried to reach does not exist. Please try
 double-checking the recipient's email address for typos.

--000000000000c7d9
Content-Type: text/rfc822-headers

Subject: Propuesta para Farmaplus: inventario que cuadra
`;

const TEMPORAL = `From: Mail Delivery System <Mailer-Daemon@vmi.contaboserver.net>
Subject: Warning: message delayed
Content-Type: multipart/report; report-type=delivery-status; boundary=x

Action: delayed
Final-Recipient: rfc822;alguien@lento.test
Status: 4.4.1
`;

const NORMAL = `From: "il Guayoyo Cafe" <ilguayoyocafe@gmail.com>
Subject: Autorespuesta: Re: Propuesta para il Guayoyo Cafe
Content-Type: text/plain

Gracias por escribir.
`;

describe("rebotes-contrato: leer un DSN del buzon", () => {
  it("exim: saca el destinatario, el estado 5.0.0, el motivo y el asunto original", () => {
    const r = leerRebote(EXIM)!;
    expect(r.fallidos).toEqual(["cap@yayustexmex.com"]);
    expect(r.estado).toBe("5.0.0");
    expect(r.permanente).toBe(true);
    expect(r.motivo).toContain("could not deliver mail");
    expect(r.asuntoOriginal).toContain("Propuesta para Yayus");
  });
  it("gmail: X-Failed-Recipients y Final-Recipient se unen en minusculas; el Diagnostic-Code plegado queda en una linea", () => {
    const r = leerRebote(GMAIL)!;
    expect(r.fallidos).toEqual(["massalud@farmaplus.com.ve"]);
    expect(r.estado).toBe("5.1.3");
    expect(r.permanente).toBe(true);
    expect(r.motivo).toBe("The email account that you tried to reach does not exist. Please try double-checking the recipient's email address for typos.");
  });
  it("un 4.x.x es temporal: no se bloquea", () => {
    const r = leerRebote(TEMPORAL)!;
    expect(r.fallidos).toEqual(["alguien@lento.test"]);
    expect(r.permanente).toBe(false);
  });
  it("un correo normal (una autorrespuesta) no es un rebote", () => {
    expect(esAvisoDeRebote(NORMAL)).toBe(false);
    expect(leerRebote(NORMAL)).toBeNull();
  });
});
