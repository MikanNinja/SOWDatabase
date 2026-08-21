import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth-core"

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith("/admin")) return NextResponse.next()
  if (pathname === "/admin/login") return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const ok = token ? await verifySessionToken(token) : false
  if (!ok) {
    const url = new URL("/admin/login", request.url)
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}