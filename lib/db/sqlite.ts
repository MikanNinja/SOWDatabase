import Database from "better-sqlite3"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { SQLITE_SCHEMA } from "./schema"
import type {
  ContentLink,
  ContentStatus,
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

type EntityRow = {
  id: string
  slug: string
  type: EntityType
  name: string
  intro: string
  note: string
  status: ContentStatus
  created_at: string
  updated_at: string
  deleted: number
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
  status: ContentStatus
  created_at: string
  updated_at: string
  deleted: number
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export class SQLiteStore implements Store {
  private db: Database.Database

  constructor() {
    const path = process.env.SQLITE_PATH || "data/app.db"
    if (path !== ":memory:") {
      const dir = dirname(path)
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(path)
    this.db.pragma("journal_mode = WAL")
    this.db.exec(SQLITE_SCHEMA)
  }

  async init(): Promise<void> {
    const defaults: Record<string, string> = {
      site_name: process.env.SITE_NAME || "游戏资料库",
      site_description: process.env.SITE_DESCRIPTION || "",
    }
    for (const [key, value] of Object.entries(defaults)) {
      this.db
        .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
        .run(key, value)
    }
  }

  private rowToEntity(row: EntityRow, aliases: string[]): Entity {
    return {
      id: row.id,
      slug: row.slug,
      type: row.type,
      name: row.name,
      intro: row.intro,
      note: row.note,
      status: row.status,
      aliases,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private rowToTextEntry(row: TextEntryRow): TextEntry {
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

  private rowToBlock(row: BlockRow): TextBlock {
    return {
      id: row.id,
      entryId: row.entry_id,
      ordinal: row.ordinal,
      kind: row.kind as TextBlock["kind"],
      content: row.content,
    }
  }

  private rowToLink(row: LinkRow): ContentLink {
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

  private aliasesFor(entityIds: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>()
    if (entityIds.length === 0) return map
    const placeholders = entityIds.map(() => "?").join(",")
    const rows = this.db
      .prepare(`SELECT entity_id, alias FROM entity_aliases WHERE entity_id IN (${placeholders})`)
      .all(...entityIds) as { entity_id: string; alias: string }[]
    for (const r of rows) {
      const list = map.get(r.entity_id) ?? []
      list.push(r.alias)
      map.set(r.entity_id, list)
    }
    return map
  }

  private uniqueSlug(
    base: string,
    table: "entities" | "text_entries",
    excludeId: string | null
  ): string {
    const slug = slugify(base)
    let candidate = slug
    let i = 2
    while (true) {
      const row = this.db
        .prepare(
          `SELECT 1 AS x FROM ${table} WHERE slug = ? AND deleted = 0 AND (? IS NULL OR id <> ?)`
        )
        .get(candidate, excludeId, excludeId ?? "") as { x: number } | undefined
      if (!row) break
      candidate = `${slug}-${i}`
      i++
    }
    return candidate
  }

  async getSettings(): Promise<Settings> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as {
      key: string
      value: string
    }[]
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      siteName: map.get("site_name") || "游戏资料库",
      siteDescription: map.get("site_description") || "",
    }
  }

  async updateSettings(settings: Settings): Promise<void> {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    upsert.run("site_name", settings.siteName)
    upsert.run("site_description", settings.siteDescription)
  }

  async listEntities(opts: ListEntitiesOpts): Promise<Entity[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts.deletedOnly) {
      where.push("deleted = 1")
    } else if (!opts.includeDeleted) {
      where.push("deleted = 0")
    }
    if (opts.type) {
      where.push("type = ?")
      params.push(opts.type)
    }
    if (opts.status) {
      where.push("status = ?")
      params.push(opts.status)
    }
    if (opts.search && opts.search.trim()) {
      const like = `%${escapeLike(opts.search.trim())}%`
      where.push(
        `(name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM entity_aliases a WHERE a.entity_id = entities.id AND a.alias LIKE ? ESCAPE '\\'))`
      )
      params.push(like, like)
    }
    const sql = `SELECT * FROM entities${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY type, name COLLATE NOCASE`
    const rows = this.db.prepare(sql).all(...params) as EntityRow[]
    const aliasMap = this.aliasesFor(rows.map((r) => r.id))
    return rows.map((r) => this.rowToEntity(r, aliasMap.get(r.id) ?? []))
  }

  async getEntityById(id: string): Promise<Entity | null> {
    const row = this.db
      .prepare("SELECT * FROM entities WHERE id = ? AND deleted = 0")
      .get(id) as EntityRow | undefined
    if (!row) return null
    const aliases = this.aliasesFor([row.id]).get(row.id) ?? []
    return this.rowToEntity(row, aliases)
  }

  async getEntityBySlug(
    slug: string,
    opts: { includeDraft?: boolean } = {}
  ): Promise<Entity | null> {
    const row = this.db
      .prepare("SELECT * FROM entities WHERE slug = ? AND deleted = 0")
      .get(slug) as EntityRow | undefined
    if (!row) return null
    if (!opts.includeDraft && row.status !== "published") return null
    const aliases = this.aliasesFor([row.id]).get(row.id) ?? []
    return this.rowToEntity(row, aliases)
  }

  async findEntityCandidates(name: string): Promise<LinkCandidate[]> {
    const rows = this.db
      .prepare(
        `SELECT id, slug, type, name, status FROM entities
         WHERE deleted = 0 AND (name = ? COLLATE NOCASE OR EXISTS (
           SELECT 1 FROM entity_aliases a WHERE a.entity_id = entities.id AND a.alias = ? COLLATE NOCASE
         ))`
      )
      .all(name.trim(), name.trim()) as Pick<EntityRow, "id" | "slug" | "type" | "name" | "status">[]
    return rows.map((r) => ({
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
    const like = `%${escapeLike(q)}%`
    const rows = this.db
      .prepare(
        `SELECT e.id, e.slug, e.type, e.name, e.status FROM entities e
         WHERE e.deleted = 0 AND (e.name LIKE ? ESCAPE '\\' OR EXISTS (
           SELECT 1 FROM entity_aliases a WHERE a.entity_id = e.id AND a.alias LIKE ? ESCAPE '\\'
         )) ORDER BY e.name COLLATE NOCASE LIMIT 20`
      )
      .all(like, like) as Pick<EntityRow, "id" | "slug" | "type" | "name" | "status">[]
    return rows.map((r) => ({
      kind: "entity" as const,
      id: r.id,
      slug: r.slug,
      label: r.name,
      type: r.type,
      status: r.status,
    }))
  }

  async createEntity(input: EntityInput): Promise<Entity> {
    const now = nowIso()
    const id = newId()
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "entities",
      null
    )
    const type = input.type
    const name = input.name.trim()
    const status = input.status ?? "draft"
    this.db
      .prepare(
        `INSERT INTO entities (id, slug, type, name, intro, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        slug,
        type,
        name,
        input.intro ?? "",
        input.note ?? "",
        status,
        now,
        now
      )
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    this.replaceAliases(id, aliases)
    return (await this.getEntityById(id))!
  }

  async updateEntity(id: string, input: EntityInput): Promise<Entity> {
    const existing = await this.getEntityById(id)
    if (!existing) throw new Error("实体不存在")
    const now = nowIso()
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "entities",
      id
    )
    const newName = input.name.trim()
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    let finalAliases = aliases
    if (input.keepOldNameAsAlias && newName !== existing.name) {
      if (!finalAliases.includes(existing.name)) finalAliases = [...finalAliases, existing.name]
    }
    this.db
      .prepare(
        `UPDATE entities SET slug = ?, type = ?, name = ?, intro = ?, note = ?, status = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        slug,
        input.type,
        newName,
        input.intro ?? "",
        input.note ?? "",
        input.status ?? existing.status,
        now,
        id
      )
    this.replaceAliases(id, finalAliases)
    return (await this.getEntityById(id))!
  }

  private replaceAliases(entityId: string, aliases: string[]): void {
    this.db.prepare("DELETE FROM entity_aliases WHERE entity_id = ?").run(entityId)
    const insert = this.db.prepare(
      "INSERT INTO entity_aliases (entity_id, alias) VALUES (?, ?)"
    )
    for (const alias of aliases) insert.run(entityId, alias)
  }

  async deleteEntity(id: string): Promise<void> {
    this.db.prepare("UPDATE entities SET deleted = 1, updated_at = ? WHERE id = ?").run(nowIso(), id)
  }

  async restoreEntity(id: string): Promise<void> {
    this.db.prepare("UPDATE entities SET deleted = 0, updated_at = ? WHERE id = ?").run(nowIso(), id)
  }

  async getEntityCounts(status?: ContentStatus): Promise<Record<EntityType, number>> {
    const counts: Record<EntityType, number> = { person: 0, place: 0, faction: 0 }
    const sql = `SELECT type, COUNT(*) AS n FROM entities WHERE deleted = 0 ${
      status ? "AND status = ?" : ""
    } GROUP BY type`
    const params = status ? [status] : []
    const rows = this.db.prepare(sql).all(...params) as { type: EntityType; n: number }[]
    for (const r of rows) counts[r.type] = r.n
    return counts
  }

  async listTextEntries(opts: ListTextsOpts): Promise<TextEntry[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts.deletedOnly) {
      where.push("deleted = 1")
    } else if (!opts.includeDeleted) {
      where.push("deleted = 0")
    }
    if (opts.category) {
      where.push("source_category = ?")
      params.push(opts.category)
    }
    if (opts.sourceName) {
      where.push("source_name = ?")
      params.push(opts.sourceName)
    }
    if (opts.status) {
      where.push("status = ?")
      params.push(opts.status)
    }
    if (opts.search && opts.search.trim()) {
      where.push("title LIKE ? ESCAPE '\\'")
      params.push(`%${escapeLike(opts.search.trim())}%`)
    }
    const sql = `SELECT * FROM text_entries${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY updated_at DESC`
    const rows = this.db.prepare(sql).all(...params) as TextEntryRow[]
    return rows.map((r) => this.rowToTextEntry(r))
  }

  async getTextEntryById(id: string): Promise<TextEntry | null> {
    const row = this.db
      .prepare("SELECT * FROM text_entries WHERE id = ? AND deleted = 0")
      .get(id) as TextEntryRow | undefined
    return row ? this.rowToTextEntry(row) : null
  }

  async getTextEntryBySlug(
    slug: string,
    opts: { includeDraft?: boolean } = {}
  ): Promise<TextEntry | null> {
    const row = this.db
      .prepare("SELECT * FROM text_entries WHERE slug = ? AND deleted = 0")
      .get(slug) as TextEntryRow | undefined
    if (!row) return null
    if (!opts.includeDraft && row.status !== "published") return null
    return this.rowToTextEntry(row)
  }

  async findTextCandidates(title: string): Promise<LinkCandidate[]> {
    const rows = this.db
      .prepare(
        `SELECT id, slug, title, status FROM text_entries WHERE deleted = 0 AND title = ? COLLATE NOCASE`
      )
      .all(title.trim()) as Pick<TextEntryRow, "id" | "slug" | "title" | "status">[]
    return rows.map((r) => ({
      kind: "text" as const,
      id: r.id,
      slug: r.slug,
      label: r.title,
      status: r.status,
    }))
  }

  async listTextCategories(): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT source_category AS c FROM text_entries WHERE deleted = 0 AND source_category <> '' ORDER BY c`
      )
      .all() as { c: string }[]
    return rows.map((r) => r.c)
  }

  async saveTextEntry(id: string | null, input: TextEntryInput): Promise<SaveTextResult> {
    const now = nowIso()
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.title,
      "text_entries",
      id
    )

    const oldManual: { content: string; links: { target_kind: string; target_id: string }[] }[] = []
    if (id) {
      const oldBlocks = this.db
        .prepare("SELECT * FROM text_blocks WHERE entry_id = ? ORDER BY ordinal")
        .all(id) as BlockRow[]
      for (const b of oldBlocks) {
        const links = this.db
          .prepare(
            `SELECT target_kind, target_id FROM content_links WHERE block_id = ? AND source = 'manual'`
          )
          .all(b.id) as { target_kind: string; target_id: string }[]
        oldManual.push({ content: b.content, links })
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
    if (id) {
      entryId = id
      this.db
        .prepare(
          `UPDATE text_entries SET slug = ?, title = ?, source_category = ?, source_name = ?,
             ingame_location = ?, trigger_condition = ?, note = ?, body = ?, status = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          slug,
          input.title.trim(),
          input.sourceCategory,
          input.sourceName,
          input.ingameLocation,
          input.triggerCondition,
          input.note,
          input.body,
          input.status,
          now,
          id
        )
    } else {
      entryId = newId()
      this.db
        .prepare(
          `INSERT INTO text_entries (id, slug, title, source_category, source_name,
             ingame_location, trigger_condition, note, body, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entryId,
          slug,
          input.title.trim(),
          input.sourceCategory,
          input.sourceName,
          input.ingameLocation,
          input.triggerCondition,
          input.note,
          input.body,
          input.status,
          now,
          now
        )
    }

    this.db.prepare("DELETE FROM text_blocks WHERE entry_id = ?").run(entryId)

    const blockIdByIndex: string[] = []
    const insertBlock = this.db.prepare(
      "INSERT INTO text_blocks (id, entry_id, ordinal, kind, content) VALUES (?, ?, ?, ?, ?)"
    )
    const insertLink = this.db.prepare(
      "INSERT INTO content_links (id, block_id, target_kind, target_id, source, display_text, raw) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )

    let carried = 0
    let dropped = 0

    const txn = this.db.transaction(() => {
      for (let i = 0; i < blocks.length; i++) {
        const bid = newId()
        blockIdByIndex[i] = bid
        insertBlock.run(bid, entryId, i, blocks[i].kind, blocks[i].content)
      }
      for (const rl of resolvedLinks) {
        insertLink.run(
          newId(),
          blockIdByIndex[rl.blockIndex],
          rl.targetKind,
          rl.targetId,
          "inline",
          rl.displayText,
          rl.raw
        )
      }
      for (const old of oldManual) {
        const matchIndex = blocks.findIndex((b) => b.content === old.content)
        if (matchIndex !== -1 && old.links.length > 0) {
          for (const l of old.links) {
            insertLink.run(newId(), blockIdByIndex[matchIndex], l.target_kind, l.target_id, "manual", "", "")
          }
          carried += 1
        } else if (old.links.length > 0) {
          dropped += old.links.length
        }
      }
    })
    txn()

    const entry = (await this.getTextEntryById(entryId))!
    return { entry, issues, carriedOverManualLinks: carried, droppedManualLinks: dropped }
  }

  async deleteTextEntry(id: string): Promise<void> {
    this.db
      .prepare("UPDATE text_entries SET deleted = 1, updated_at = ? WHERE id = ?")
      .run(nowIso(), id)
  }

  async restoreTextEntry(id: string): Promise<void> {
    this.db
      .prepare("UPDATE text_entries SET deleted = 0, updated_at = ? WHERE id = ?")
      .run(nowIso(), id)
  }

  async getEntryBlocks(entryId: string): Promise<BlockWithLinks[]> {
    const blocks = this.db
      .prepare("SELECT * FROM text_blocks WHERE entry_id = ? ORDER BY ordinal")
      .all(entryId) as BlockRow[]
    const result: BlockWithLinks[] = []
    if (blocks.length === 0) return result
    const placeholders = blocks.map(() => "?").join(",")
    const links = this.db
      .prepare(`SELECT * FROM content_links WHERE block_id IN (${placeholders})`)
      .all(...blocks.map((b) => b.id)) as LinkRow[]
    const byBlock = new Map<string, ContentLink[]>()
    for (const l of links) {
      const list = byBlock.get(l.block_id) ?? []
      list.push(this.rowToLink(l))
      byBlock.set(l.block_id, list)
    }
    for (const b of blocks) {
      result.push({ block: this.rowToBlock(b), links: byBlock.get(b.id) ?? [] })
    }
    return result
  }

  async setManualLinks(blockId: string, entityIds: string[]): Promise<void> {
    this.db
      .prepare("DELETE FROM content_links WHERE block_id = ? AND source = 'manual'")
      .run(blockId)
    const insert = this.db.prepare(
      "INSERT INTO content_links (id, block_id, target_kind, target_id, source, display_text, raw) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    for (const entityId of entityIds) {
      insert.run(newId(), blockId, "entity", entityId, "manual", "", "")
    }
  }

  async batchAddManualLinks(entryId: string, entityIds: string[]): Promise<void> {
    const blocks = this.db
      .prepare("SELECT id FROM text_blocks WHERE entry_id = ? ORDER BY ordinal")
      .all(entryId) as { id: string }[]
    const existing = this.db
      .prepare(
        `SELECT block_id, target_id FROM content_links WHERE source = 'manual' AND target_kind = 'entity'
         AND block_id IN (${blocks.map(() => "?").join(",")})`
      )
      .all(...blocks.map((b) => b.id)) as { block_id: string; target_id: string }[]
    const seen = new Set(existing.map((e) => `${e.block_id}:${e.target_id}`))
    const insert = this.db.prepare(
      "INSERT INTO content_links (id, block_id, target_kind, target_id, source, display_text, raw) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    for (const block of blocks) {
      for (const entityId of entityIds) {
        if (seen.has(`${block.id}:${entityId}`)) continue
        insert.run(newId(), block.id, "entity", entityId, "manual", "", "")
        seen.add(`${block.id}:${entityId}`)
      }
    }
  }

  async getRelatedBlocksForEntity(entityId: string): Promise<RelatedBlock[]> {
    const rows = this.db
      .prepare(
        `SELECT l.raw AS link_raw, l.display_text, b.id AS block_id, b.ordinal, b.content AS block_content,
                e.id AS entry_id, e.slug AS entry_slug, e.title AS entry_title,
                e.source_category, e.source_name, e.ingame_location
         FROM content_links l
         JOIN text_blocks b ON b.id = l.block_id
         JOIN text_entries e ON e.id = b.entry_id
         WHERE l.target_kind = 'entity' AND l.target_id = ? AND e.deleted = 0 AND e.status = 'published'
         ORDER BY e.title COLLATE NOCASE, b.ordinal`
      )
      .all(entityId) as {
      link_raw: string
      display_text: string
      block_id: string
      ordinal: number
      block_content: string
      entry_id: string
      entry_slug: string
      entry_title: string
      source_category: string
      source_name: string
      ingame_location: string
    }[]
    const seen = new Set<string>()
    const out: RelatedBlock[] = []
    for (const r of rows) {
      if (seen.has(r.block_id)) continue
      seen.add(r.block_id)
      out.push({
        blockId: r.block_id,
        blockOrdinal: r.ordinal,
        blockContent: r.block_content,
        entryId: r.entry_id,
        entrySlug: r.entry_slug,
        entryTitle: r.entry_title,
        sourceCategory: r.source_category,
        sourceName: r.source_name,
        ingameLocation: r.ingame_location,
        linkRaw: r.link_raw,
        displayText: r.display_text,
      })
    }
    return out
  }

  async exportAll(): Promise<ExportData> {
    const entities = await this.listEntities({ includeDeleted: true })
    const textEntries = await this.listTextEntries({ includeDeleted: true })
    const allBlocks = this.db
      .prepare("SELECT * FROM text_blocks ORDER BY entry_id, ordinal")
      .all() as BlockRow[]
    const blocks: TextBlock[] = allBlocks.map((r) => this.rowToBlock(r))
    const allLinks = this.db.prepare("SELECT * FROM content_links").all() as LinkRow[]
    const links: ContentLink[] = allLinks.map((r) => this.rowToLink(r))
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
