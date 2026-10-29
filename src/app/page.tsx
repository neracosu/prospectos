// src/app/page.tsx — la raiz manda a Inicio; el layout del panel exige sesion.
import { redirect } from "next/navigation";
export default function Raiz() { redirect("/inicio"); }
