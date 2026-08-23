import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type {
  ContentLink,
  Entity,
  EntityType,
  ExportData,
  LinkCandidate,
  LinkIssue,
  RelatedBlock,
  SaveTextResult,
  Settings,
  TextBlock,
  TextEntry,
} from "./types"
import type {
  BlockWithLinks,
  EntityInput,
  ListEntitiesOpts,
  ListTextsOpts,
  Store,
  TextEntryInput,
} from "./store"
import { extractWikiLinks, splitBlocks } from "../markdown"
import { linesToList, newId, nowIso, slugify } from "../utils"

function requireConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "使用 Supabase 后端必须配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  return { url, key }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

type EntityRow = {
  id: string
  slug: string
  type: EntityType
  name: string
  intro: string
  note: string
  status: Entity["status"]
  created_at: string
  updated_at: string
  deleted: boolean
  entity_aliases?: { alias: string }[]
}

type TextEntryRow = {
  id: string
  slug: string
  title: string
  source_category: string
  source_name: string
  ingame_location: string
  trigger_condition: string
  note: string
  body: string
  status: TextEntry["status"]
  created_at: string
  updated_at: string
  deleted: boolean
}

type BlockRow = {
  id: string
  entry_id: string
  ordinal: number
  kind: string
  content: string
}

type LinkRow = {
  id: string
  block_id: string
  target_kind: "entity" | "text"
  target_id: string
  source: "inline" | "manual"
  display_text: string
  raw: string
}

export class SupabaseStore implements Store {
  private supabase: SupabaseClient

  constructor() {
    const { url, key } = requireConfig()
    this.supabase = createClient(url, key, { auth: { persistSession: false } })
  }

  async init(): Promise<void> {
    await this.supabase
      .from("settings")
      .upsert(
        [
          { key: "site_name", value: process.env.SITE_NAME || "游戏资料库" },
          { key: "site_description", value: process.env.SITE_DESCRIPTION || "" },
          { key: "nav_label", value: process.env.NAV_LABEL || "资料索引" },
          { key: "footer_text", value: process.env.FOOTER_TEXT || "内容公开可读，仅由站点拥有者维护。" },
        ],
        { onConflict: "key", ignoreDuplicates: true }
      )
  }

  private toEntity(row: EntityRow): Entity {
    return {
      id: row.id,
      slug: row.slug,
      type: row.type,
      name: row.name,
      intro: row.intro,
      note: row.note,
      status: row.status,
      aliases: (row.entity_aliases ?? []).map((a) => a.alias),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private toTextEntry(row: TextEntryRow): TextEntry {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      sourceCategory: row.source_category,
      sourceName: row.source_name,
      ingameLocation: row.ingame_location,
      triggerCondition: row.trigger_condition,
      note: row.note,
      body: row.body,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private toBlock(row: BlockRow): TextBlock {
    return {
      id: row.id,
      entryId: row.entry_id,
      ordinal: row.ordinal,
      kind: row.kind as TextBlock["kind"],
      content: row.content,
    }
  }

  private toLink(row: LinkRow): ContentLink {
    return {
      id: row.id,
      blockId: row.block_id,
      targetKind: row.target_kind,
      targetId: row.target_id,
      source: row.source,
      displayText: row.display_text,
      raw: row.raw,
    }
  }

  private async uniqueSlug(
    base: string,
    table: "entities" | "text_entries",
    excludeId: string | null
  ): Promise<string> {
    const slug = slugify(base)
    let candidate = slug
    let i = 2
    while (true) {
      let query = this.supabase
        .from(table)
        .select("slug")
        .eq("slug", candidate)
        .eq("deleted", false)
      if (excludeId) query = query.neq("id", excludeId)
      const { data } = await query.limit(1)
      if (!data || data.length === 0) break
      candidate = `${slug}-${i}`
      i++
    }
    return candidate
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.supabase.from("settings").select("key,value")
    if (error) throw error
    const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
    return {
      siteName: map.get("site_name") || "游戏资料库",
      siteDescription: map.get("site_description") || "",
      navLabel: map.get("nav_label") || "资料索引",
      footerText: map.get("footer_text") || "内容公开可读，仅由站点拥有者维护。",
    }
  }

  async updateSettings(settings: Settings): Promise<void> {
    await this.supabase.from("settings").upsert(
      [
        { key: "site_name", value: settings.siteName },
        { key: "site_description", value: settings.siteDescription },
        { key: "nav_label", value: settings.navLabel },
        { key: "footer_text", value: settings.footerText },
      ],
      { onConflict: "key" }
    )
  }

  async listEntities(opts: ListEntitiesOpts): Promise<Entity[]> {
    let query = this.supabase
      .from("entities")
      .select("*, entity_aliases(alias)")
      .order("name", { ascending: true })
    if (opts.deletedOnly) query = query.eq("deleted", true)
    else if (!opts.includeDeleted) query = query.eq("deleted", false)
    if (opts.type) query = query.eq("type", opts.type)
    if (opts.status) query = query.eq("status", opts.status)
    const { data, error } = await query
    if (error) throw error
    const rows = (data ?? []) as EntityRow[]
    let entities = rows.map((r) => this.toEntity(r))
    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim()
      const q2 = q.toLowerCase()
      entities = entities.filter(
        (e) =>
          e.name.toLowerCase().includes(q2) ||
          e.aliases.some((a) => a.toLowerCase().includes(q2))
      )
    }
    return entities
  }

  async getEntityById(id: string): Promise<Entity | null> {
    const { data, error } = await this.supabase
      .from("entities")
      .select("*, entity_aliases(alias)")
      .eq("id", id)
      .eq("deleted", false)
      .maybeSingle()
    if (error) throw error
    return data ? this.toEntity(data as EntityRow) : null
  }

  async getEntityBySlug(
    slug: string,
    opts: { includeDraft?: boolean } = {}
  ): Promise<Entity | null> {
    const { data, error } = await this.supabase
      .from("entities")
      .select("*, entity_aliases(alias)")
      .eq("slug", slug)
      .eq("deleted", false)
      .maybeSingle()
    if (error) throw error
    const row = data as EntityRow | null
    if (!row) return null
    if (!opts.includeDraft && row.status !== "published") return null
    return this.toEntity(row)
  }

  async findEntityCandidates(name: string): Promise<LinkCandidate[]> {
    const { data, error } = await this.supabase
      .from("entities")
      .select("id,slug,type,name,status,entity_aliases(alias)")
      .eq("deleted", false)
    if (error) throw error
    const rows = (data ?? []) as EntityRow[]
    const target = name.trim().toLowerCase()
    const matches = rows.filter(
      (r) =>
        r.name.toLowerCase() === target ||
        (r.entity_aliases ?? []).some((a) => a.alias.toLowerCase() === target)
    )
    return matches.map((r) => ({
      kind: "entity" as const,
      id: r.id,
      slug: r.slug,
      label: r.name,
      type: r.type,
      status: r.status,
    }))
  }

  async searchEntitySuggestions(query: string): Promise<LinkCandidate[]> {
    const q = query.trim()
    if (!q) return []
    const q2 = q.toLowerCase()
    const { data, error } = await this.supabase
      .from("entities")
      .select("id,slug,type,name,status,entity_aliases(alias)")
      .eq("deleted", false)
      .limit(100)
    if (error) throw error
    const rows = (data ?? []) as EntityRow[]
    const matches = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q2) ||
        (r.entity_aliases ?? []).some((a) => a.alias.toLowerCase().includes(q2))
    )
    return matches.slice(0, 20).map((r) => ({
      kind: "entity" as const,
      id: r.id,
      slug: r.slug,
      label: r.name,
      type: r.type,
      status: r.status,
    }))
  }

  async createEntity(input: EntityInput): Promise<Entity> {
    const id = newId()
    const slug = await this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "entities",
      null
    )
    const { error } = await this.supabase.from("entities").insert({
      id,
      slug,
      type: input.type,
      name: input.name.trim(),
      intro: input.intro ?? "",
      note: input.note ?? "",
      status: input.status ?? "draft",
    })
    if (error) throw error
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    await this.replaceAliases(id, aliases)
    return (await this.getEntityById(id))!
  }

  async updateEntity(id: string, input: EntityInput): Promise<Entity> {
    const existing = await this.getEntityById(id)
    if (!existing) throw new Error("实体不存在")
    const slug = await this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "entities",
      id
    )
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    let finalAliases = aliases
    if (input.keepOldNameAsAlias && input.name.trim() !== existing.name) {
      if (!finalAliases.includes(existing.name)) finalAliases = [...finalAliases, existing.name]
    }
    const { error } = await this.supabase
      .from("entities")
      .update({
        slug,
        type: input.type,
        name: input.name.trim(),
        intro: input.intro ?? "",
        note: input.note ?? "",
        status: input.status ?? existing.status,
        updated_at: nowIso(),
      })
      .eq("id", id)
    if (error) throw error
    await this.replaceAliases(id, finalAliases)
    return (await this.getEntityById(id))!
  }

  private async replaceAliases(entityId: string, aliases: string[]): Promise<void> {
    await this.supabase.from("entity_aliases").delete().eq("entity_id", entityId)
    if (aliases.length > 0) {
      await this.supabase.from("entity_aliases").insert(
        aliases.map((alias) => ({ entity_id: entityId, alias }))
      )
    }
  }

  async deleteEntity(id: string): Promise<void> {
    await this.supabase
      .from("entities")
      .update({ deleted: true, updated_at: nowIso() })
      .eq("id", id)
  }

  async restoreEntity(id: string): Promise<void> {
    await this.supabase
      .from("entities")
      .update({ deleted: false, updated_at: nowIso() })
      .eq("id", id)
  }

  async getEntityCounts(status?: Entity["status"]): Promise<Record<EntityType, number>> {
    const counts: Record<EntityType, number> = { person: 0, place: 0, faction: 0 }
    let query = this.supabase.from("entities").select("type")
    if (status) query = query.eq("status", status)
    const { data, error } = await query
    if (error) throw error
    for (const r of data ?? []) {
      const t = r.type as EntityType
      if (t in counts) counts[t]++
    }
    return counts
  }

  async listTextEntries(opts: ListTextsOpts): Promise<TextEntry[]> {
    let query = this.supabase.from("text_entries").select("*")
    if (opts.deletedOnly) query = query.eq("deleted", true)
    else if (!opts.includeDeleted) query = query.eq("deleted", false)
    if (opts.category) query = query.eq("source_category", opts.category)
    if (opts.sourceName) query = query.eq("source_name", opts.sourceName)
    if (opts.status) query = query.eq("status", opts.status)
    if (opts.search && opts.search.trim()) {
      query = query.ilike("title", `%${escapeLike(opts.search.trim())}%`)
    }
    query = query.order("updated_at", { ascending: false })
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((r) => this.toTextEntry(r as TextEntryRow))
  }

  async getTextEntryById(id: string): Promise<TextEntry | null> {
    const { data, error } = await this.supabase
      .from("text_entries")
      .select("*")
      .eq("id", id)
      .eq("deleted", false)
      .maybeSingle()
    if (error) throw error
    return data ? this.toTextEntry(data as TextEntryRow) : null
  }

  async getTextEntryBySlug(
    slug: string,
    opts: { includeDraft?: boolean } = {}
  ): Promise<TextEntry | null> {
    const { data, error } = await this.supabase
      .from("text_entries")
      .select("*")
      .eq("slug", slug)
      .eq("deleted", false)
      .maybeSingle()
    if (error) throw error
    const row = data as TextEntryRow | null
    if (!row) return null
    if (!opts.includeDraft && row.status !== "published") return null
    return this.toTextEntry(row)
  }

  async findTextCandidates(title: string): Promise<LinkCandidate[]> {
    const { data, error } = await this.supabase
      .from("text_entries")
      .select("id,slug,title,status")
      .eq("deleted", false)
    if (error) throw error
    const target = title.trim().toLowerCase()
    const rows = (data ?? []) as Pick<TextEntryRow, "id" | "slug" | "title" | "status">[]
    const matches = rows.filter((r) => r.title.toLowerCase() === target)
    return matches.map((r) => ({
      kind: "text" as const,
      id: r.id,
      slug: r.slug,
      label: r.title,
      status: r.status,
    }))
  }

  async listTextCategories(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("text_entries")
      .select("source_category")
      .eq("deleted", false)
      .not("source_category", "eq", "")
    if (error) throw error
    const set = new Set<string>()
    for (const r of data ?? []) {
      if (r.source_category) set.add(r.source_category)
    }
    return [...set].sort()
  }

  async saveTextEntry(id: string | null, input: TextEntryInput): Promise<SaveTextResult> {
    const slug = await this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.title,
      "text_entries",
      id
    )

    const oldManual: { content: string; links: { target_kind: string; target_id: string }[] }[] = []
    if (id) {
      const { data: oldBlocks } = await this.supabase
        .from("text_blocks")
        .select("*")
        .eq("entry_id", id)
        .order("ordinal")
      for (const b of (oldBlocks ?? []) as BlockRow[]) {
        const { data: links } = await this.supabase
          .from("content_links")
          .select("target_kind,target_id")
          .eq("block_id", b.id)
          .eq("source", "manual")
        oldManual.push({ content: b.content, links: (links ?? []) as { target_kind: string; target_id: string }[] })
      }
    }

    const blocks = splitBlocks(input.body)
    const issues: LinkIssue[] = []
    const resolvedLinks: {
      blockIndex: number
      raw: string
      targetKind: "entity" | "text"
      targetId: string
      displayText: string
    }[] = []
    const seen = new Set<string>()

    for (let i = 0; i < blocks.length; i++) {
      const raws = extractWikiLinks(blocks[i].content)
      for (const link of raws) {
        const key = `${i}:${link.raw}`
        if (seen.has(key)) continue
        seen.add(key)
        if (!link.valid || !link.target) {
          issues.push({ raw: link.raw, target: "", reason: "invalid", candidates: [] })
          continue
        }
        if (link.kind === "text") {
          const title = link.target.replace(/^文本:\s*/, "").trim()
          const cands = await this.findTextCandidates(title)
          if (cands.length === 0) {
            issues.push({ raw: link.raw, target: link.target, reason: "not_found", candidates: [] })
          } else if (cands.length > 1) {
            issues.push({ raw: link.raw, target: link.target, reason: "ambiguous", candidates: cands })
          } else {
            const c = cands[0]
            resolvedLinks.push({
              blockIndex: i,
              raw: link.raw,
              targetKind: "text",
              targetId: c.id,
              displayText: link.display ?? c.label,
            })
          }
        } else {
          const cands = await this.findEntityCandidates(link.target)
          if (cands.length === 0) {
            issues.push({ raw: link.raw, target: link.target, reason: "not_found", candidates: [] })
          } else if (cands.length > 1) {
            issues.push({ raw: link.raw, target: link.target, reason: "ambiguous", candidates: cands })
          } else {
            const c = cands[0]
            resolvedLinks.push({
              blockIndex: i,
              raw: link.raw,
              targetKind: "entity",
              targetId: c.id,
              displayText: link.display ?? c.label,
            })
          }
        }
      }
    }

    let entryId: string
    const base = {
      slug,
      title: input.title.trim(),
      source_category: input.sourceCategory || "其他",
      source_name: input.sourceName,
      ingame_location: input.ingameLocation,
      trigger_condition: input.triggerCondition,
      note: input.note,
      body: input.body,
      status: input.status,
      updated_at: nowIso(),
    }
    if (id) {
      entryId = id
      const { error } = await this.supabase.from("text_entries").update(base).eq("id", id)
      if (error) throw error
    } else {
      entryId = newId()
      const { error } = await this.supabase.from("text_entries").insert({
        id: entryId,
        created_at: nowIso(),
        ...base,
      })
      if (error) throw error
    }

    await this.supabase.from("text_blocks").delete().eq("entry_id", entryId)

    const blockIdByIndex: string[] = []
    for (let i = 0; i < blocks.length; i++) {
      const bid = newId()
      blockIdByIndex[i] = bid
      await this.supabase.from("text_blocks").insert({
        id: bid,
        entry_id: entryId,
        ordinal: i,
        kind: blocks[i].kind,
        content: blocks[i].content,
      })
    }

    for (const rl of resolvedLinks) {
      await this.supabase.from("content_links").insert({
        id: newId(),
        block_id: blockIdByIndex[rl.blockIndex],
        target_kind: rl.targetKind,
        target_id: rl.targetId,
        source: "inline",
        display_text: rl.displayText,
        raw: rl.raw,
      })
    }

    let carried = 0
    let dropped = 0
    for (const old of oldManual) {
      const matchIndex = blocks.findIndex((b) => b.content === old.content)
      if (matchIndex !== -1 && old.links.length > 0) {
        for (const l of old.links) {
          await this.supabase.from("content_links").insert({
            id: newId(),
            block_id: blockIdByIndex[matchIndex],
            target_kind: l.target_kind,
            target_id: l.target_id,
            source: "manual",
            display_text: "",
            raw: "",
          })
        }
        carried += 1
      } else if (old.links.length > 0) {
        dropped += old.links.length
      }
    }

    const entry = (await this.getTextEntryById(entryId))!
    return { entry, issues, carriedOverManualLinks: carried, droppedManualLinks: dropped }
  }

  async deleteTextEntry(id: string): Promise<void> {
    await this.supabase
      .from("text_entries")
      .update({ deleted: true, updated_at: nowIso() })
      .eq("id", id)
  }

  async restoreTextEntry(id: string): Promise<void> {
    await this.supabase
      .from("text_entries")
      .update({ deleted: false, updated_at: nowIso() })
      .eq("id", id)
  }

  async getEntryBlocks(entryId: string): Promise<BlockWithLinks[]> {
    const { data: blockData, error: blockError } = await this.supabase
      .from("text_blocks")
      .select("*")
      .eq("entry_id", entryId)
      .order("ordinal")
    if (blockError) throw blockError
    const blocks = (blockData ?? []) as BlockRow[]
    const result: BlockWithLinks[] = []
    if (blocks.length === 0) return result
    const ids = blocks.map((b) => b.id)
    const { data: linkData, error: linkError } = await this.supabase
      .from("content_links")
      .select("*")
      .in("block_id", ids)
    if (linkError) throw linkError
    const byBlock = new Map<string, ContentLink[]>()
    for (const l of (linkData ?? []) as LinkRow[]) {
      const list = byBlock.get(l.block_id) ?? []
      list.push(this.toLink(l))
      byBlock.set(l.block_id, list)
    }
    for (const b of blocks) {
      result.push({ block: this.toBlock(b), links: byBlock.get(b.id) ?? [] })
    }
    return result
  }

  async setManualLinks(blockId: string, entityIds: string[]): Promise<void> {
    await this.supabase.from("content_links").delete().eq("block_id", blockId).eq("source", "manual")
    if (entityIds.length > 0) {
      await this.supabase.from("content_links").insert(
        entityIds.map((entityId) => ({
          id: newId(),
          block_id: blockId,
          target_kind: "entity",
          target_id: entityId,
          source: "manual",
          display_text: "",
          raw: "",
        }))
      )
    }
  }

  async batchAddManualLinks(entryId: string, entityIds: string[]): Promise<void> {
    const { data: blocks } = await this.supabase
      .from("text_blocks")
      .select("id")
      .eq("entry_id", entryId)
    const blockIds = (blocks ?? []).map((b) => b.id)
    if (blockIds.length === 0 || entityIds.length === 0) return
    const { data: existing } = await this.supabase
      .from("content_links")
      .select("block_id,target_id")
      .in("block_id", blockIds)
      .eq("source", "manual")
    const seen = new Set((existing ?? []).map((e) => `${e.block_id}:${e.target_id}`))
    const rows: Record<string, string>[] = []
    for (const blockId of blockIds) {
      for (const entityId of entityIds) {
        if (seen.has(`${blockId}:${entityId}`)) continue
        rows.push({
          id: newId(),
          block_id: blockId,
          target_kind: "entity",
          target_id: entityId,
          source: "manual",
          display_text: "",
          raw: "",
        })
      }
    }
    if (rows.length > 0) {
      await this.supabase.from("content_links").insert(rows)
    }
  }

  async getRelatedBlocksForEntity(entityId: string): Promise<RelatedBlock[]> {
    const { data: linkData, error: linkError } = await this.supabase
      .from("content_links")
      .select("id, block_id, raw, display_text")
      .eq("target_kind", "entity")
      .eq("target_id", entityId)
    if (linkError) throw linkError
    const links = (linkData ?? []) as { id: string; block_id: string; raw: string | null; display_text: string | null }[]
    if (links.length === 0) return []
    const blockIds = [...new Set(links.map((l) => l.block_id))]
    const { data: blockData, error: blockError } = await this.supabase
      .from("text_blocks")
      .select("*")
      .in("id", blockIds)
    if (blockError) throw blockError
    const blocks = (blockData ?? []) as BlockRow[]
    const entryIds = [...new Set(blocks.map((b) => b.entry_id))]
    const { data: entryData, error: entryError } = await this.supabase
      .from("text_entries")
      .select("*")
      .in("id", entryIds)
      .eq("deleted", false)
    if (entryError) throw entryError
    const entryById = new Map((entryData ?? []).map((e) => [e.id, e as TextEntryRow]))
    const blockById = new Map(blocks.map((b) => [b.id, b]))

    const seen = new Set<string>()
    const out: RelatedBlock[] = []
    for (const l of links) {
      const block = blockById.get(l.block_id)
      if (!block) continue
      const entry = entryById.get(block.entry_id)
      if (!entry || entry.status !== "published") continue
      const key = `${entry.id}:${block.ordinal}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        blockId: block.id,
        blockOrdinal: block.ordinal,
        blockContent: block.content,
        entryId: entry.id,
        entrySlug: entry.slug,
        entryTitle: entry.title,
        sourceCategory: entry.source_category,
        sourceName: entry.source_name,
        ingameLocation: entry.ingame_location,
        linkRaw: l.raw ?? "",
        displayText: l.display_text ?? "",
      })
    }
    out.sort((a, b) => a.entryTitle.localeCompare(b.entryTitle, "zh") || a.blockOrdinal - b.blockOrdinal)
    return out
  }

  async exportAll(): Promise<ExportData> {
    const entities = await this.listEntities({ includeDeleted: true })
    const textEntries = await this.listTextEntries({ includeDeleted: true })
    const { data: blockData } = await this.supabase.from("text_blocks").select("*").order("entry_id").order("ordinal")
    const blocks = ((blockData ?? []) as BlockRow[]).map((r) => this.toBlock(r))
    const { data: linkData } = await this.supabase.from("content_links").select("*")
    const links = ((linkData ?? []) as LinkRow[]).map((r) => this.toLink(r))
    return {
      schemaVersion: 1,
      exportedAt: nowIso(),
      settings: await this.getSettings(),
      entities,
      textEntries,
      blocks,
      links,
    }
  }
}
