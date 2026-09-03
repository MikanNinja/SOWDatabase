import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type {
  ContentLink,
  ContentStatus,
  Entity,
  EntityFaction,
  EntityType,
  ExportData,
  LinkCandidate,
  LinkIssue,
  PersonRelation,
  RelatedBlock,
  SaveTextResult,
  Settings,
  TextBlock,
  TextEntityAssociation,
  TextEntry,
} from "./types"
import type {
  BlockWithLinks,
  EntityInput,
  FactionInput,
  ListEntitiesOpts,
  ListTextsOpts,
  RelationInput,
  RelationWithEntity,
  Store,
  TextAssociationInput,
  TextEntryInput,
  WholeEntryText,
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
  race: string | null
  parent_id: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  birth_circa: boolean | null
  death_year: number | null
  death_month: number | null
  death_day: number | null
  death_circa: boolean | null
  birth_place_id: string | null
  birth_place_free: string | null
  death_place_id: string | null
  death_place_free: string | null
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
      race: row.race ?? "",
      parentId: row.parent_id ?? null,
      birthYear: row.birth_year ?? null,
      birthMonth: row.birth_month ?? null,
      birthDay: row.birth_day ?? null,
      birthCirca: row.birth_circa ?? false,
      deathYear: row.death_year ?? null,
      deathMonth: row.death_month ?? null,
      deathDay: row.death_day ?? null,
      deathCirca: row.death_circa ?? false,
      birthPlaceId: row.birth_place_id ?? null,
      birthPlaceFree: row.birth_place_free ?? "",
      deathPlaceId: row.death_place_id ?? null,
      deathPlaceFree: row.death_place_free ?? "",
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
    const race = (input.race ?? "").trim()
    const parentId = input.parentId ? input.parentId.trim() || null : null
    const toInt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.trunc(v))
    const birthYear = toInt(input.birthYear)
    const birthMonth = toInt(input.birthMonth)
    const birthDay = toInt(input.birthDay)
    const birthCirca = input.birthCirca ?? false
    const deathYear = toInt(input.deathYear)
    const deathMonth = toInt(input.deathMonth)
    const deathDay = toInt(input.deathDay)
    const deathCirca = input.deathCirca ?? false
    const birthPlaceId = input.birthPlaceId ? input.birthPlaceId.trim() || null : null
    const birthPlaceFree = (input.birthPlaceFree ?? "").trim()
    const deathPlaceId = input.deathPlaceId ? input.deathPlaceId.trim() || null : null
    const deathPlaceFree = (input.deathPlaceFree ?? "").trim()

    if (parentId) {
      await this.validateParent(id, input.type, parentId)
    }

    const { error } = await this.supabase.from("entities").insert({
      id,
      slug,
      type: input.type,
      name: input.name.trim(),
      intro: input.intro ?? "",
      note: input.note ?? "",
      race,
      parent_id: parentId,
      birth_year: birthYear,
      birth_month: birthMonth,
      birth_day: birthDay,
      birth_circa: birthCirca,
      death_year: deathYear,
      death_month: deathMonth,
      death_day: deathDay,
      death_circa: deathCirca,
      birth_place_id: birthPlaceId,
      birth_place_free: birthPlaceFree,
      death_place_id: deathPlaceId,
      death_place_free: deathPlaceFree,
      status: input.status ?? "draft",
    })
    if (error) throw error
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    await this.replaceAliases(id, aliases)
    await this.replaceFactions(id, input.factions ?? [])
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
    const race = (input.race ?? "").trim()
    const parentId = input.parentId ? input.parentId.trim() || null : null
    const toInt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.trunc(v))
    const birthYear = toInt(input.birthYear)
    const birthMonth = toInt(input.birthMonth)
    const birthDay = toInt(input.birthDay)
    const birthCirca = input.birthCirca ?? false
    const deathYear = toInt(input.deathYear)
    const deathMonth = toInt(input.deathMonth)
    const deathDay = toInt(input.deathDay)
    const deathCirca = input.deathCirca ?? false
    const birthPlaceId = input.birthPlaceId ? input.birthPlaceId.trim() || null : null
    const birthPlaceFree = (input.birthPlaceFree ?? "").trim()
    const deathPlaceId = input.deathPlaceId ? input.deathPlaceId.trim() || null : null
    const deathPlaceFree = (input.deathPlaceFree ?? "").trim()

    let finalAliases = aliases
    if (input.keepOldNameAsAlias && input.name.trim() !== existing.name) {
      if (!finalAliases.includes(existing.name)) finalAliases = [...finalAliases, existing.name]
    }

    if (parentId) {
      await this.validateParent(id, input.type, parentId)
    }

    const { error } = await this.supabase
      .from("entities")
      .update({
        slug,
        type: input.type,
        name: input.name.trim(),
        intro: input.intro ?? "",
        note: input.note ?? "",
        race,
        parent_id: parentId,
        birth_year: birthYear,
        birth_month: birthMonth,
        birth_day: birthDay,
        birth_circa: birthCirca,
        death_year: deathYear,
        death_month: deathMonth,
        death_day: deathDay,
        death_circa: deathCirca,
        birth_place_id: birthPlaceId,
        birth_place_free: birthPlaceFree,
        death_place_id: deathPlaceId,
        death_place_free: deathPlaceFree,
        status: input.status ?? existing.status,
        updated_at: nowIso(),
      })
      .eq("id", id)
    if (error) throw error
    await this.replaceAliases(id, finalAliases)
    await this.replaceFactions(id, input.factions ?? [])
    return (await this.getEntityById(id))!
  }

  /** 校验父级引用：必须存在、未删除、同类型，且不形成环 */
  private async validateParent(entityId: string, type: EntityType, parentId: string): Promise<void> {
    const parent = await this.getEntityById(parentId)
    if (!parent) throw new Error("上级实体不存在或已删除")
    if (parent.type !== type) throw new Error("上级实体类型必须与当前实体一致")
    if (await this.detectHierarchyCycle(entityId, parentId)) {
      throw new Error("不能将自身或后代设为上级，这会形成层级环")
    }
  }

  private async replaceFactions(entityId: string, factions: FactionInput[]): Promise<void> {
    await this.supabase.from("entity_factions").delete().eq("entity_id", entityId)
    if (factions.length > 0) {
      await this.supabase.from("entity_factions").insert(
        factions.map((f, i) => ({
          id: newId(),
          entity_id: entityId,
          faction_id: f.factionId,
          role: (f.role ?? "").trim(),
          ordinal: i,
        }))
      )
    }
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
    // v2：删除人物时清理其相关关系
    await this.deleteRelationsForPerson(id)
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

  async getEntityFactions(entityId: string): Promise<EntityFaction[]> {
    const { data, error } = await this.supabase
      .from("entity_factions")
      .select("id,entity_id,faction_id,role,ordinal")
      .eq("entity_id", entityId)
      .order("ordinal")
    if (error) throw error
    return ((data ?? []) as {
      id: string; entity_id: string; faction_id: string; role: string; ordinal: number
    }[]).map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      factionId: r.faction_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
  }

  async getFactionMembers(factionId: string): Promise<{ entity: Entity; role: string; ordinal: number }[]> {
    const { data: memberLinks, error: linkError } = await this.supabase
      .from("entity_factions")
      .select("entity_id,role,ordinal")
      .eq("faction_id", factionId)
      .order("ordinal")
    if (linkError) throw linkError
    const links = (memberLinks ?? []) as { entity_id: string; role: string; ordinal: number }[]
    if (links.length === 0) return []
    const memberIds = links.map((l) => l.entity_id)
    const { data: memberData, error: memberError } = await this.supabase
      .from("entities")
      .select("*, entity_aliases(alias)")
      .in("id", memberIds)
      .eq("deleted", false)
      .order("name", { ascending: true })
    if (memberError) throw memberError
    const entityMap = new Map(((memberData ?? []) as EntityRow[]).map((r) => [r.id, this.toEntity(r)]))
    return links
      .map((l) => {
        const entity = entityMap.get(l.entity_id)
        if (!entity) return null
        return { entity, role: l.role, ordinal: l.ordinal }
      })
      .filter((x): x is { entity: Entity; role: string; ordinal: number } => x !== null)
  }

  async getEntityChildren(parentId: string, opts: { status?: ContentStatus } = {}): Promise<Entity[]> {
    let query = this.supabase
      .from("entities")
      .select("*, entity_aliases(alias)")
      .eq("parent_id", parentId)
      .eq("deleted", false)
      .order("name", { ascending: true })
    if (opts.status) query = query.eq("status", opts.status)
    const { data, error } = await query
    if (error) throw error
    return ((data ?? []) as EntityRow[]).map((r) => this.toEntity(r))
  }

  async getEntityAncestors(entityId: string, opts: { publicOnly?: boolean } = {}): Promise<Entity[]> {
    const chain: Entity[] = []
    let currentId: string | null = entityId
    const seen = new Set<string>([entityId])
    while (currentId) {
      const { data } = await this.supabase
        .from("entities")
        .select("*, entity_aliases(alias)")
        .eq("id", currentId)
        .eq("deleted", false)
        .maybeSingle()
      const row = data as EntityRow | null
      if (!row || !row.parent_id) break
      if (seen.has(row.parent_id)) break
      seen.add(row.parent_id)
      const { data: parentData } = await this.supabase
        .from("entities")
        .select("*, entity_aliases(alias)")
        .eq("id", row.parent_id)
        .eq("deleted", false)
        .maybeSingle()
      const parentRow = parentData as EntityRow | null
      if (!parentRow) break
      if (opts.publicOnly && parentRow.status !== "published") {
        currentId = parentRow.parent_id
        continue
      }
      chain.push(this.toEntity(parentRow))
      currentId = parentRow.parent_id
    }
    return chain
  }

  async detectHierarchyCycle(entityId: string, candidateParentId: string): Promise<boolean> {
    if (entityId === candidateParentId) return true
    const seen = new Set<string>([candidateParentId])
    let currentId: string | null = candidateParentId
    while (currentId) {
      const { data } = await this.supabase
        .from("entities")
        .select("parent_id")
        .eq("id", currentId)
        .eq("deleted", false)
        .maybeSingle()
      const row = data as { parent_id: string | null } | null
      if (!row || !row.parent_id) break
      if (row.parent_id === entityId) return true
      if (seen.has(row.parent_id)) break
      seen.add(row.parent_id)
      currentId = row.parent_id
    }
    return false
  }

  // ---------- v2：人物关系 ----------

  async getRelationsForPerson(personId: string): Promise<RelationWithEntity[]> {
    const { data, error } = await this.supabase
      .from("person_relations")
      .select("*")
      .or(`from_id.eq.${personId},to_id.eq.${personId}`)
      .order("ordinal")
    if (error) throw error
    const rows = (data ?? []) as {
      id: string; from_id: string; to_id: string; kind: string;
      reverse_kind: string; ordinal: number; created_at: string
    }[]

    const result: RelationWithEntity[] = []
    for (const r of rows) {
      const isFrom = r.from_id === personId
      const otherId = isFrom ? r.to_id : r.from_id
      const other = await this.getEntityById(otherId)
      if (!other) continue
      let label: string
      let isReverseFallback = false
      if (isFrom) {
        if (r.reverse_kind) {
          label = r.reverse_kind
        } else {
          label = r.kind
          isReverseFallback = true
        }
      } else {
        label = r.kind
      }
      result.push({
        relation: {
          id: r.id,
          fromId: r.from_id,
          toId: r.to_id,
          kind: r.kind,
          reverseKind: r.reverse_kind,
          ordinal: r.ordinal,
          createdAt: r.created_at,
        },
        perspective: isFrom ? "from" : "to",
        otherPerson: other,
        label,
        isReverseFallback,
      })
    }
    return result
  }

  async createRelation(input: RelationInput): Promise<PersonRelation> {
    await this.validateRelation(input.fromId, input.toId)
    const id = newId()
    const ordinal = await this.nextRelationOrdinal(input.fromId)
    const { error } = await this.supabase.from("person_relations").insert({
      id,
      from_id: input.fromId,
      to_id: input.toId,
      kind: input.kind.trim(),
      reverse_kind: (input.reverseKind ?? "").trim(),
      ordinal,
      created_at: nowIso(),
    })
    if (error) throw error
    return (await this.getRelationById(id))!
  }

  async updateRelation(id: string, input: RelationInput): Promise<PersonRelation> {
    const { data: existing } = await this.supabase
      .from("person_relations")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (!existing) throw new Error("关系记录不存在")
    await this.validateRelation(input.fromId, input.toId)
    const { error } = await this.supabase
      .from("person_relations")
      .update({
        from_id: input.fromId,
        to_id: input.toId,
        kind: input.kind.trim(),
        reverse_kind: (input.reverseKind ?? "").trim(),
      })
      .eq("id", id)
    if (error) throw error
    return (await this.getRelationById(id))!
  }

  async deleteRelation(id: string): Promise<void> {
    await this.supabase.from("person_relations").delete().eq("id", id)
  }

  async deleteRelationsForPerson(personId: string): Promise<void> {
    await this.supabase
      .from("person_relations")
      .delete()
      .or(`from_id.eq.${personId},to_id.eq.${personId}`)
  }

  private async getRelationById(id: string): Promise<PersonRelation | null> {
    const { data, error } = await this.supabase
      .from("person_relations")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    const row = data as {
      id: string; from_id: string; to_id: string; kind: string;
      reverse_kind: string; ordinal: number; created_at: string
    } | null
    if (!row) return null
    return {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      kind: row.kind,
      reverseKind: row.reverse_kind,
      ordinal: row.ordinal,
      createdAt: row.created_at,
    }
  }

  private async nextRelationOrdinal(fromId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("person_relations")
      .select("ordinal")
      .eq("from_id", fromId)
      .order("ordinal", { ascending: false })
      .limit(1)
    if (error) throw error
    const rows = (data ?? []) as { ordinal: number }[]
    return (rows[0]?.ordinal ?? -1) + 1
  }

  /** 校验关系双方均为人物且未删除，from ≠ to */
  private async validateRelation(fromId: string, toId: string): Promise<void> {
    if (fromId === toId) throw new Error("关系双方不能是同一人物")
    const from = await this.getEntityById(fromId)
    if (!from) throw new Error("关系主体人物不存在或已删除")
    if (from.type !== "person") throw new Error("关系主体必须是人物实体")
    const to = await this.getEntityById(toId)
    if (!to) throw new Error("关系客体人物不存在或已删除")
    if (to.type !== "person") throw new Error("关系客体必须是人物实体")
  }

  // ---------- v2：整篇级关联 ----------

  async getTextEntityAssociations(entryId: string): Promise<TextEntityAssociation[]> {
    const { data, error } = await this.supabase
      .from("text_entity_associations")
      .select("id,entry_id,target_id,ordinal")
      .eq("entry_id", entryId)
      .order("ordinal")
    if (error) throw error
    return ((data ?? []) as {
      id: string; entry_id: string; target_id: string; ordinal: number
    }[]).map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      targetId: r.target_id,
      ordinal: r.ordinal,
    }))
  }

  async setTextEntityAssociations(entryId: string, associations: TextAssociationInput[]): Promise<void> {
    await this.supabase.from("text_entity_associations").delete().eq("entry_id", entryId)
    if (associations.length > 0) {
      await this.supabase.from("text_entity_associations").insert(
        associations.map((a, i) => ({
          id: newId(),
          entry_id: entryId,
          target_id: a.targetId,
          ordinal: i,
        }))
      )
    }
  }

  async getWholeEntryTextsForEntity(entityId: string): Promise<WholeEntryText[]> {
    const { data: assocData, error: assocError } = await this.supabase
      .from("text_entity_associations")
      .select("id,ordinal,entry_id")
      .eq("target_id", entityId)
      .order("ordinal")
    if (assocError) throw assocError
    const assocs = (assocData ?? []) as {
      id: string; ordinal: number; entry_id: string
    }[]
    if (assocs.length === 0) return []
    const entryIds = assocs.map((a) => a.entry_id)
    const { data: entryData, error: entryError } = await this.supabase
      .from("text_entries")
      .select("*")
      .in("id", entryIds)
      .eq("deleted", false)
      .eq("status", "published")
    if (entryError) throw entryError
    const entryMap = new Map(((entryData ?? []) as TextEntryRow[]).map((r) => [r.id, r]))
    const result: WholeEntryText[] = []
    for (const a of assocs) {
      const entry = entryMap.get(a.entry_id)
      if (!entry) continue
      result.push({
        associationId: a.id,
        entryId: entry.id,
        entrySlug: entry.slug,
        entryTitle: entry.title,
        sourceCategory: entry.source_category,
        sourceName: entry.source_name,
        ingameLocation: entry.ingame_location,
        ordinal: a.ordinal,
      })
    }
    return result
  }

  async getWholeEntryIdsForEntity(entityId: string): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .from("text_entity_associations")
      .select("entry_id")
      .eq("target_id", entityId)
    if (error) throw error
    const rows = (data ?? []) as { entry_id: string }[]
    // 仅保留已发布文本的 entry_id
    const entryIds = [...new Set(rows.map((r) => r.entry_id))]
    if (entryIds.length === 0) return new Set()
    const { data: publishedData, error: pubError } = await this.supabase
      .from("text_entries")
      .select("id")
      .in("id", entryIds)
      .eq("deleted", false)
      .eq("status", "published")
    if (pubError) throw pubError
    return new Set(((publishedData ?? []) as { id: string }[]).map((r) => r.id))
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
    const { data: factionData } = await this.supabase
      .from("entity_factions")
      .select("*")
      .order("entity_id")
      .order("ordinal")
    const factions: EntityFaction[] = ((factionData ?? []) as {
      id: string; entity_id: string; faction_id: string; role: string; ordinal: number
    }[]).map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      factionId: r.faction_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
    const { data: relationData } = await this.supabase
      .from("person_relations")
      .select("*")
      .order("from_id")
      .order("ordinal")
    const relations: PersonRelation[] = ((relationData ?? []) as {
      id: string; from_id: string; to_id: string; kind: string; reverse_kind: string;
      ordinal: number; created_at: string
    }[]).map((r) => ({
      id: r.id,
      fromId: r.from_id,
      toId: r.to_id,
      kind: r.kind,
      reverseKind: r.reverse_kind,
      ordinal: r.ordinal,
      createdAt: r.created_at,
    }))
    const { data: assocData } = await this.supabase
      .from("text_entity_associations")
      .select("*")
      .order("entry_id")
      .order("ordinal")
    const textEntityAssociations: TextEntityAssociation[] = ((assocData ?? []) as {
      id: string; entry_id: string; target_id: string; ordinal: number
    }[]).map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      targetId: r.target_id,
      ordinal: r.ordinal,
    }))
    return {
      schemaVersion: 2,
      exportedAt: nowIso(),
      settings: await this.getSettings(),
      entities,
      textEntries,
      blocks,
      links,
      factions,
      relations,
      textEntityAssociations,
    }
  }
}
