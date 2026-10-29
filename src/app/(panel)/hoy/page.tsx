// src/app/(panel)/hoy/page.tsx — /hoy fue la portada hasta la fase 1 del panel CRM (29-oct-2026). Los enlaces
// guardados y la PWA instalada siguen llegando aqui: se mandan a /inicio para siempre.
import { permanentRedirect } from "next/navigation";
export default function Hoy() { permanentRedirect("/inicio"); }
