import { getStore } from "@/lib/db/store"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const authed = await getSession()
  if (!authed) return new Response("未授权", { status: 401 })
  const store = await getStore()
  const data = await store.exportAll()
  const filename = `export-${data.exportedAt.replace(/[:.]/g, "-")}.json`
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}