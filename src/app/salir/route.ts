import { NextResponse } from "next/server";
import { COOKIE_SESION } from "@/lib/sesion";

export async function GET() {
  const res = new NextResponse(null, { status: 302, headers: { Location: "/entrar" } });
  res.cookies.set(COOKIE_SESION, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0,
  });
  return res;
}
