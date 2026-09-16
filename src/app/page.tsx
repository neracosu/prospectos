// src/app/page.tsx — la raiz manda a Hoy; el layout del panel exige sesion.
import { redirect } from "next/navigation";
export default function Raiz() { redirect("/hoy"); }
