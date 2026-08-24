"use server"

import { redirect } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { getSession, setSessionCookie, clearSessionCookie } from "@/lib/auth"
import { checkCredentials } from "@/lib/auth-core"
import type { ContentStatus, EntityType } from "@/lib/db/types"
import { linesToList } from "@/lib/utils"

function isAuthed(): Promise<boolean> {
  return getSession()
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  const next = String(formData.get("next") ?? "/admin")
  const ok = await checkCredentials(username, password)
  if (!ok) {
    redirect(`/admin/login?error=1${next && next !== "/admin" ? `&next=${encodeURIComponent(next)}` : ""}`)
  }
  await setSessionCookie()
  redirect(next || "/admin")
}

export async function logoutAction() {
  await clearSessionCookie()
  redirect("/admin/login")
}

export async function saveEntityAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()

  const id = String(formData.get("id") ?? "")
  const type = String(formData.get("type") ?? "") as EntityType
  const name = String(formData.get("name") ?? "").trim()
  const intro = String(formData.get("intro") ?? "")
  const note = String(formData.get("note") ?? "")
  const status = String(formData.get("status") ?? "draft") as ContentStatus
  const slug = String(formData.get("slug") ?? "").trim()
  const aliases = linesToList(String(formData.get("aliases") ?? ""))
  const keepOldNameAsAlias = formData.get("keepOldNameAsAlias") === "on"
  const race = String(formData.get("race") ?? "").trim()
  const parentIdRaw = String(formData.get("parentId") ?? "").trim()
  const parentId = parentIdRaw || null
  const factionsRaw = String(formData.get("factions") ?? "")
  let factions: { factionId: string; role?: string }[] = []
  if (factionsRaw) {
    try {
      const parsed = JSON.parse(factionsRaw)
      if (Array.isArray(parsed)) {
        factions = parsed
          .map((f: { factionId?: string; role?: string }) => ({
            factionId: String(f?.factionId ?? "").trim(),
            role: f?.role ? String(f.role).trim() : "",
          }))
          .filter((f: { factionId: string }) => f.factionId)
      }
    } catch {
      // 忽略格式错误
    }
  }

  if (!name) throw new Error("名称不能为空")
  if (!["person", "place", "faction"].includes(type)) throw new Error("实体类型不合法")

  const input = {
    slug: slug || undefined,
    type,
    name,
    intro,
    note,
    race,
    parentId,
    factions,
    status,
    aliases,
  }
  if (id) {
    await store.updateEntity(id, { ...input, keepOldNameAsAlias })
  } else {
    await store.createEntity(input)
  }
  redirect("/admin/entities")
}

export async function deleteEntityAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  await store.deleteEntity(id)
  redirect("/admin/entities")
}

export async function restoreEntityAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  await store.restoreEntity(id)
  redirect("/admin/entities?deleted=1")
}

export async function saveTextAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()

  const id = String(formData.get("id") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const sourceCategory = String(formData.get("sourceCategory") ?? "").trim()
  const sourceName = String(formData.get("sourceName") ?? "").trim()
  const ingameLocation = String(formData.get("ingameLocation") ?? "").trim()
  const triggerCondition = String(formData.get("triggerCondition") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim()
  const body = String(formData.get("body") ?? "")
  const status = String(formData.get("status") ?? "draft") as ContentStatus
  const slug = String(formData.get("slug") ?? "").trim()

  if (!title) throw new Error("标题不能为空")

  const result = await store.saveTextEntry(id || null, {
    slug: slug || undefined,
    title,
    sourceCategory: sourceCategory || "其他",
    sourceName,
    ingameLocation,
    triggerCondition,
    note,
    body,
    status,
  })

  redirect(`/admin/texts/${result.entry.id}/edit`)
}

export async function deleteTextAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  await store.deleteTextEntry(id)
  redirect("/admin/texts")
}

export async function restoreTextAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  await store.restoreTextEntry(id)
  redirect("/admin/texts?deleted=1")
}

export async function setManualLinksAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const blockId = String(formData.get("blockId") ?? "")
  const entryId = String(formData.get("entryId") ?? "")
  const entityIds = String(formData.get("entityIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  await store.setManualLinks(blockId, entityIds)
  redirect(`/admin/texts/${entryId}/edit`)
}

export async function batchManualLinksAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const entryId = String(formData.get("entryId") ?? "")
  const entityIds = String(formData.get("entityIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  await store.batchAddManualLinks(entryId, entityIds)
  redirect(`/admin/texts/${entryId}/edit`)
}

export async function updateSettingsAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const siteName = String(formData.get("siteName") ?? "").trim()
  const siteDescription = String(formData.get("siteDescription") ?? "").trim()
  const navLabel = String(formData.get("navLabel") ?? "").trim()
  const footerText = String(formData.get("footerText") ?? "").trim()
  await store.updateSettings({ siteName, siteDescription, navLabel, footerText })
  redirect("/admin")
}

// ---------- v2：人物关系 ----------

export async function saveRelationAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  const fromId = String(formData.get("fromId") ?? "").trim()
  const toId = String(formData.get("toId") ?? "").trim()
  const kind = String(formData.get("kind") ?? "").trim()
  const reverseKind = String(formData.get("reverseKind") ?? "").trim()
  const entityId = String(formData.get("entityId") ?? "").trim()

  if (!fromId || !toId) throw new Error("关系双方人物不能为空")
  if (!kind) throw new Error("正向称呼不能为空")

  const input = { fromId, toId, kind, reverseKind }
  if (id) {
    await store.updateRelation(id, input)
  } else {
    await store.createRelation(input)
  }
  redirect(`/admin/entities/${entityId}/edit`)
}

export async function deleteRelationAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const id = String(formData.get("id") ?? "")
  const entityId = String(formData.get("entityId") ?? "").trim()
  await store.deleteRelation(id)
  redirect(`/admin/entities/${entityId}/edit`)
}

// ---------- v2：整篇级关联 ----------

export async function saveTextAssociationsAction(formData: FormData) {
  if (!(await isAuthed())) redirect("/admin/login")
  const store = await getStore()
  const entryId = String(formData.get("entryId") ?? "").trim()
  const associationsRaw = String(formData.get("associations") ?? "")

  if (!entryId) throw new Error("文本条目 id 不能为空")

  let associations: { targetId: string; note?: string }[] = []
  if (associationsRaw) {
    try {
      const parsed = JSON.parse(associationsRaw)
      if (Array.isArray(parsed)) {
        associations = parsed
          .map((a: { targetId?: string; note?: string }) => ({
            targetId: String(a?.targetId ?? "").trim(),
            note: a?.note ? String(a.note).trim() : "",
          }))
          .filter((a: { targetId: string }) => a.targetId)
      }
    } catch {
      // 忽略格式错误
    }
  }

  await store.setTextEntityAssociations(entryId, associations)
  redirect(`/admin/texts/${entryId}/edit`)
}