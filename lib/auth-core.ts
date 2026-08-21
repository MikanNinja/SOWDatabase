import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "admin_session"

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || ""
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("生产环境必须配置 AUTH_SECRET")
    }
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod")
  }
  return new TextEncoder().encode(s)
}

export async function createSessionToken(): Promise<string> {
  return await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload.role === "admin"
  } catch {
    return false
  }
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USERNAME || "admin"
  const expectedPass = process.env.ADMIN_PASSWORD || ""
  if (!expectedPass && process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 ADMIN_PASSWORD")
  }
  return username === expectedUser && password === expectedPass
}