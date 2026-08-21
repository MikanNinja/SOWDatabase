import { cookies } from "next/headers"
import { createSessionToken, verifySessionToken, SESSION_COOKIE } from "./auth-core"

export async function getSession(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function setSessionCookie(): Promise<void> {
  const token = await createSessionToken()
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}