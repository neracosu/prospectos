import { NextResponse } from "next/server";
import { COOKIE_SESION } from "@/lib/sesion";

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/entrar", req.url));
  res.cookies.set(COOKIE_SESION, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
