import Database from "better-sqlite3"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { SQLITE_SCHEMA } from "./schema"
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
  Quest,
  QuestCategory,
  QuestCharacter,
  QuestPersonRef,
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
  ListQuestsOpts,
  ListTextsOpts,
  QuestInput,
  QuestPersonInput,
  RelationInput,
  RelationWithEntity,
  Store,
  TextAssociationInput,
  TextEntryInput,
  WholeEntryText,
} from "./store"
import { extractWikiLinks, splitBlocks } from "../markdown"
import { resolveWikiLink } from "../links"
import { linesToList, newId, nowIso, slugify } from "../utils"
import { compareZh } from "../collate"
import { ENTITY_TYPE_LABELS, QUEST_CATEGORIES } from "./types"

type EntityRow = {
  id: string
  slug: string
  type: EntityType
  name: string
  intro: string
  note: string
  race: string
  parent_id: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  birth_circa: number
  death_year: number | null
  death_month: number | null
  death_day: number | null
  death_circa: number
  birth_place_id: string | null
  birth_place_free: string
  death_place_id: string | null
  death_place_free: string
  life_status: string
  status: ContentStatus
  created_at: string
  updated_at: string
  deleted: number
}

type QuestRow = {
  id: string
  slug: string
  name: string
  category: string
  chapter: string
  stage: string
  sort_order: number | null
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
  note: string
  body: string
  quest_id: string | null
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

function toInt(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : Math.trunc(v)
}

/** 任务分类的固定展示顺序（主线 → 个人 → 重要 → 次要 → 日常 → 活动），未知分类排最后 */
function questCategoryRank(category: string | undefined): number {
  const idx = QUEST_CATEGORIES.indexOf((category ?? "") as QuestCategory)
  return idx === -1 ? QUEST_CATEGORIES.length : idx
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
    // 对既有库先补齐 v2/v3/v4 新增列，再执行完整 schema（含依赖这些列的索引）。
    // 全新库因 entities 表不存在会跳过 ALTER，直接由 CREATE TABLE 建表。
    // 版本判定依据：
    //   - quests 表已存在 → 库已是 v5+，跳过全部 v4 升级路径；
    //   - 否则 entities 建表 SQL 含 'quest' → v4 库，需执行 v5 任务拆分迁移；
    //   - 否则为 v3- 旧库，走 v4 补列 + 整表重建，再进入 v5 迁移。
    const existing = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'")
      .get() as { name: string } | undefined
    if (existing) {
      const questsTableExists = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quests'")
        .get()
      const tableSqlBefore = this.tableSql("entities")
      // v5- 全新库的 entities SQL 同样不含 'quest'，以 quests 表存在性区分，避免误入 v4 路径
      const isPreV4 = Boolean(tableSqlBefore) && !tableSqlBefore!.includes("'quest'") && !questsTableExists

      const cols = this.db.prepare("PRAGMA table_info(entities)").all() as { name: string }[]
      const colNames = new Set(cols.map((c) => c.name))
      if (!colNames.has("race")) {
        this.tryAddColumn("entities", "race", "TEXT NOT NULL DEFAULT ''")
      }
      if (!colNames.has("parent_id")) {
        this.tryAddColumn("entities", "parent_id", "TEXT")
      }
      // v3：人物生卒字段（年/月/日可空，circa 默认0，place_free 默认空串）
      const legacyCols: Record<string, string> = {
        birth_year: "INTEGER",
        birth_month: "INTEGER",
        birth_day: "INTEGER",
        birth_circa: "INTEGER NOT NULL DEFAULT 0",
        death_year: "INTEGER",
        death_month: "INTEGER",
        death_day: "INTEGER",
        death_circa: "INTEGER NOT NULL DEFAULT 0",
        birth_place_id: "TEXT",
        birth_place_free: "TEXT NOT NULL DEFAULT ''",
        death_place_id: "TEXT",
        death_place_free: "TEXT NOT NULL DEFAULT ''",
        life_status: "TEXT NOT NULL DEFAULT ''",
      }
      for (const [col, def] of Object.entries(legacyCols)) {
        if (!colNames.has(col)) {
          this.tryAddColumn("entities", col, def)
        }
      }
      if (isPreV4) {
        // v4：任务字段（仅为把 v3- 旧库补到 v4 形态，供随后的 v5 迁移读取）
        const questCols: Record<string, string> = {
          quest_category: "TEXT NOT NULL DEFAULT ''",
          quest_chapter: "TEXT NOT NULL DEFAULT ''",
          quest_stage: "TEXT NOT NULL DEFAULT ''",
          quest_order: "INTEGER",
        }
        for (const [col, def] of Object.entries(questCols)) {
          if (!colNames.has(col)) {
            this.tryAddColumn("entities", col, def)
          }
        }
        // v4：type 的 CHECK 约束无法用 ALTER 修改，需整表重建以加入 'quest'。
        this.rebuildEntitiesForQuestType()
        // v5：任务从实体系统拆分为独立 quests 表（检测依据：entities 建表 SQL 仍含 'quest'）。
        this.migrateQuestsOutOfEntities()
      } else {
        // v4 库直接进入 v5 迁移（检测依据：entities 建表 SQL 仍含 'quest'）
        const tableSql = this.tableSql("entities")
        if (tableSql && tableSql.includes("'quest'")) {
          this.migrateQuestsOutOfEntities()
        }
      }
      // v5：text_entries 补 quest_id 列（既有库 ALTER 补齐；须先于 SQLITE_SCHEMA，
      // 因为 schema 会创建依赖该列的 idx_text_entries_quest 索引）。
      const textEntriesExists = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='text_entries'")
        .get()
      if (textEntriesExists) {
        const textCols = this.db.prepare("PRAGMA table_info(text_entries)").all() as { name: string }[]
        if (!textCols.some((c) => c.name === "quest_id")) {
          this.tryAddColumn(
            "text_entries",
            "quest_id",
            "TEXT REFERENCES quests(id) ON DELETE SET NULL"
          )
        }
      }
    }
    this.db.exec(SQLITE_SCHEMA)
  }

  private tableSql(table: string): string | undefined {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(table) as { sql: string } | undefined
    return row?.sql
  }

  /** 幂等加列：并发进程可能已加同名列，重复 ALTER 时静默忽略 */
  private tryAddColumn(table: string, col: string, def: string): void {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("duplicate column name")) throw err
    }
  }

  /**
   * v4：整表重建 entities，使 type 的 CHECK 约束接受 'quest'。
   * 幂等（仅在旧约束存在时调用）；显式列名拷贝以兼容各历史版本的列顺序差异；
   * 事务内完成，失败整体回滚。索引随旧表删除，由随后的 SQLITE_SCHEMA 重建。
   */
  private rebuildEntitiesForQuestType(): void {
    // foreign_keys 是连接级设置且在事务内为 no-op，必须在事务外切换
    this.db.pragma("foreign_keys = OFF")
    const rebuild = this.db.transaction(() => {
      // 事务内二次校验：并发进程可能已完成 v4 重建
      const sql = this.tableSql("entities")
      if (!sql || sql.includes("'quest'")) return
      this.db.exec(`
        CREATE TABLE entities_rebuild (
          id         TEXT PRIMARY KEY,
          slug       TEXT NOT NULL UNIQUE,
          type       TEXT NOT NULL CHECK (type IN ('person','place','faction','quest')),
          name       TEXT NOT NULL,
          intro      TEXT NOT NULL DEFAULT '',
          note       TEXT NOT NULL DEFAULT '',
          race       TEXT NOT NULL DEFAULT '',
          parent_id  TEXT,
          birth_year       INTEGER,
          birth_month      INTEGER,
          birth_day        INTEGER,
          birth_circa      INTEGER NOT NULL DEFAULT 0,
          death_year       INTEGER,
          death_month      INTEGER,
          death_day        INTEGER,
          death_circa      INTEGER NOT NULL DEFAULT 0,
          birth_place_id   TEXT,
          birth_place_free TEXT NOT NULL DEFAULT '',
          death_place_id   TEXT,
          death_place_free TEXT NOT NULL DEFAULT '',
          life_status      TEXT NOT NULL DEFAULT '',
          quest_category   TEXT NOT NULL DEFAULT '',
          quest_chapter    TEXT NOT NULL DEFAULT '',
          quest_stage      TEXT NOT NULL DEFAULT '',
          quest_order      INTEGER,
          status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted    INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO entities_rebuild (
          id, slug, type, name, intro, note, race, parent_id,
          birth_year, birth_month, birth_day, birth_circa,
          death_year, death_month, death_day, death_circa,
          birth_place_id, birth_place_free, death_place_id, death_place_free,
          life_status, quest_category, quest_chapter, quest_stage, quest_order,
          status, created_at, updated_at, deleted
        )
        SELECT
          id, slug, type, name, intro, note, race, parent_id,
          birth_year, birth_month, birth_day, birth_circa,
          death_year, death_month, death_day, death_circa,
          birth_place_id, birth_place_free, death_place_id, death_place_free,
          life_status, quest_category, quest_chapter, quest_stage, quest_order,
          status, created_at, updated_at, deleted
        FROM entities;
        DROP TABLE entities;
        ALTER TABLE entities_rebuild RENAME TO entities;
      `)
    })
    try {
      rebuild.immediate()
    } finally {
      this.db.pragma("foreign_keys = ON")
    }
  }

  /**
   * v5：任务拆分迁移——把 entities 中 type='quest' 的行迁入独立 quests 表，
   * entities 重建为三类型表（CHECK 去 'quest'、删除任务专属列），
   * quest_characters 重建使 quest_id 外键指向 quests（保留任务原 id，关联行原值平移）。
   * 任务实体的别名并入任务补充说明留档后删除（任务不再具备别名）。
   * 幂等（仅在 entities 建表 SQL 含 'quest' 时调用）；事务内完成，失败整体回滚。
   */
  private migrateQuestsOutOfEntities(): void {
    // foreign_keys 是连接级设置且在事务内为 no-op，必须在事务外切换
    this.db.pragma("foreign_keys = OFF")
    const migrate = this.db.transaction(() => {
      // 事务内二次校验：并发进程可能已完成 v5 迁移（next build 多 worker 并发打开同一库）
      const sql = this.tableSql("entities")
      if (!sql || !sql.includes("'quest'")) return
      this.db.exec(`
        CREATE TABLE quests_migrate (
          id         TEXT PRIMARY KEY,
          slug       TEXT NOT NULL UNIQUE,
          name       TEXT NOT NULL,
          category   TEXT NOT NULL DEFAULT 'main' CHECK (category IN ('main','personal','major','minor','daily','event')),
          chapter    TEXT NOT NULL DEFAULT '',
          stage      TEXT NOT NULL DEFAULT '',
          sort_order INTEGER,
          note       TEXT NOT NULL DEFAULT '',
          status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted    INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO quests_migrate (
          id, slug, name, category, chapter, stage, sort_order, note, status, created_at, updated_at, deleted
        )
        SELECT id, slug, name,
          CASE WHEN quest_category IN ('main','personal','major','minor','daily','event') THEN quest_category ELSE 'main' END,
          quest_chapter, quest_stage, quest_order, note, status, created_at, updated_at, deleted
        FROM entities WHERE type = 'quest';
      `)
      // 任务别名并入任务补充说明留档（任务不再是实体，不再支持别名）
      const questAliases = this.db
        .prepare(
          `SELECT a.entity_id AS quest_id, a.alias FROM entity_aliases a
           JOIN entities e ON e.id = a.entity_id
           WHERE e.type = 'quest' AND trim(a.alias) <> '' ORDER BY a.entity_id, a.id`
        )
        .all() as { quest_id: string; alias: string }[]
      if (questAliases.length > 0) {
        const grouped = new Map<string, string[]>()
        for (const { quest_id, alias } of questAliases) {
          const list = grouped.get(quest_id) ?? []
          list.push(alias.trim())
          grouped.set(quest_id, list)
        }
        const getNote = this.db.prepare("SELECT note FROM quests_migrate WHERE id = ?")
        const merge = this.db.prepare("UPDATE quests_migrate SET note = ? WHERE id = ?")
        for (const [questId, aliases] of grouped) {
          const note = (getNote.get(questId) as { note: string } | undefined)?.note ?? ""
          merge.run(
            `${note ? `${note}\n` : ""}别名：${aliases.join("、")}（原任务实体别名，拆分迁移时留档）`,
            questId
          )
        }
        this.db.exec(
          `DELETE FROM entity_aliases WHERE entity_id IN (SELECT id FROM entities WHERE type = 'quest')`
        )
      }
      this.db.exec(`
        CREATE TABLE entities_migrate (
          id         TEXT PRIMARY KEY,
          slug       TEXT NOT NULL UNIQUE,
          type       TEXT NOT NULL CHECK (type IN ('person','place','faction')),
          name       TEXT NOT NULL,
          intro      TEXT NOT NULL DEFAULT '',
          note       TEXT NOT NULL DEFAULT '',
          race       TEXT NOT NULL DEFAULT '',
          parent_id  TEXT,
          birth_year       INTEGER,
          birth_month      INTEGER,
          birth_day        INTEGER,
          birth_circa      INTEGER NOT NULL DEFAULT 0,
          death_year       INTEGER,
          death_month      INTEGER,
          death_day        INTEGER,
          death_circa      INTEGER NOT NULL DEFAULT 0,
          birth_place_id   TEXT,
          birth_place_free TEXT NOT NULL DEFAULT '',
          death_place_id   TEXT,
          death_place_free TEXT NOT NULL DEFAULT '',
          life_status      TEXT NOT NULL DEFAULT '',
          status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted    INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO entities_migrate (
          id, slug, type, name, intro, note, race, parent_id,
          birth_year, birth_month, birth_day, birth_circa,
          death_year, death_month, death_day, death_circa,
          birth_place_id, birth_place_free, death_place_id, death_place_free,
          life_status, status, created_at, updated_at, deleted
        )
        SELECT
          id, slug, type, name, intro, note, race, parent_id,
          birth_year, birth_month, birth_day, birth_circa,
          death_year, death_month, death_day, death_circa,
          birth_place_id, birth_place_free, death_place_id, death_place_free,
          life_status, status, created_at, updated_at, deleted
        FROM entities WHERE type <> 'quest';
        DROP TABLE entities;
        ALTER TABLE entities_migrate RENAME TO entities;
        ALTER TABLE quests_migrate RENAME TO quests;
        CREATE TABLE quest_characters_migrate (
          id        TEXT PRIMARY KEY,
          quest_id  TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
          person_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          role      TEXT NOT NULL DEFAULT '',
          ordinal   INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO quest_characters_migrate (id, quest_id, person_id, role, ordinal)
        SELECT id, quest_id, person_id, role, ordinal FROM quest_characters;
        DROP TABLE quest_characters;
        ALTER TABLE quest_characters_migrate RENAME TO quest_characters;
      `)
    })
    try {
      migrate.immediate()
    } finally {
      this.db.pragma("foreign_keys = ON")
    }
  }

  async init(): Promise<void> {
    const defaults: Record<string, string> = {
      site_name: process.env.SITE_NAME || "游戏资料库",
      site_description: process.env.SITE_DESCRIPTION || "",
      nav_label: process.env.NAV_LABEL || "资料索引",
      footer_text: process.env.FOOTER_TEXT || "内容公开可读，仅由站点拥有者维护。",
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
      race: row.race ?? "",
      parentId: row.parent_id ?? null,
      birthYear: row.birth_year ?? null,
      birthMonth: row.birth_month ?? null,
      birthDay: row.birth_day ?? null,
      birthCirca: row.birth_circa ? true : false,
      deathYear: row.death_year ?? null,
      deathMonth: row.death_month ?? null,
      deathDay: row.death_day ?? null,
      deathCirca: row.death_circa ? true : false,
      birthPlaceId: row.birth_place_id ?? null,
      birthPlaceFree: row.birth_place_free ?? "",
      deathPlaceId: row.death_place_id ?? null,
      deathPlaceFree: row.death_place_free ?? "",
      lifeStatus: row.life_status ?? "",
      status: row.status,
      aliases,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private rowToQuest(row: QuestRow): Quest {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category as Quest["category"],
      chapter: row.chapter,
      stage: row.stage,
      sortOrder: row.sort_order ?? null,
      note: row.note,
      status: row.status,
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
      note: row.note,
      body: row.body,
      questId: row.quest_id ?? null,
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
    table: "entities" | "text_entries" | "quests",
    excludeId: string | null
  ): string {
    const slug = slugify(base)
    let candidate = slug
    let i = 2
    while (true) {
      const row = this.db
        .prepare(
          `SELECT 1 AS x FROM ${table} WHERE slug = ? AND (? IS NULL OR id <> ?)`
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
      navLabel: map.get("nav_label") || "资料索引",
      footerText: map.get("footer_text") || "内容公开可读，仅由站点拥有者维护。",
    }
  }

  async updateSettings(settings: Settings): Promise<void> {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    upsert.run("site_name", settings.siteName)
    upsert.run("site_description", settings.siteDescription)
    upsert.run("nav_label", settings.navLabel)
    upsert.run("footer_text", settings.footerText)
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
    } ORDER BY type`
    const rows = this.db.prepare(sql).all(...params) as EntityRow[]
    const aliasMap = this.aliasesFor(rows.map((r) => r.id))
    return rows
      .map((r) => this.rowToEntity(r, aliasMap.get(r.id) ?? []))
      .sort((a, b) => a.type.localeCompare(b.type) || compareZh(a.name, b.name))
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
    return rows
      .map((r) => ({
        kind: "entity" as const,
        id: r.id,
        slug: r.slug,
        label: r.name,
        type: r.type,
        status: r.status,
      }))
      .sort((a, b) => compareZh(a.label, b.label))
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
    const race = (input.race ?? "").trim()
    const parentId = input.parentId ? input.parentId.trim() || null : null
    const birthYear = toInt(input.birthYear)
    const birthMonth = toInt(input.birthMonth)
    const birthDay = toInt(input.birthDay)
    const birthCirca = input.birthCirca ? 1 : 0
    const deathYear = toInt(input.deathYear)
    const deathMonth = toInt(input.deathMonth)
    const deathDay = toInt(input.deathDay)
    const deathCirca = input.deathCirca ? 1 : 0
    const birthPlaceId = input.birthPlaceId ? input.birthPlaceId.trim() || null : null
    const birthPlaceFree = (input.birthPlaceFree ?? "").trim()
    const deathPlaceId = input.deathPlaceId ? input.deathPlaceId.trim() || null : null
    const deathPlaceFree = (input.deathPlaceFree ?? "").trim()
    const lifeStatus = (input.lifeStatus ?? "").trim()

    // 校验父级：同类型、未删除、无环
    if (parentId) {
      await this.validateParent(id, type, parentId)
    }

    this.assertUniqueNameInType(type, name, null)

    this.db
      .prepare(
        `INSERT INTO entities (id, slug, type, name, intro, note, race, parent_id,
           birth_year, birth_month, birth_day, birth_circa, death_year, death_month, death_day, death_circa,
           birth_place_id, birth_place_free, death_place_id, death_place_free,
           life_status,
           status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        slug,
        type,
        name,
        input.intro ?? "",
        input.note ?? "",
        race,
        parentId,
        birthYear,
        birthMonth,
        birthDay,
        birthCirca,
        deathYear,
        deathMonth,
        deathDay,
        deathCirca,
        birthPlaceId,
        birthPlaceFree,
        deathPlaceId,
        deathPlaceFree,
        lifeStatus,
        status,
        now,
        now
      )
    const aliases = linesToList((input.aliases ?? []).join("\n"))
    this.replaceAliases(id, aliases)
    await this.replaceFactions(id, type === "person" ? input.factions ?? [] : [])
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
    const race = (input.race ?? "").trim()
    const parentId = input.parentId ? input.parentId.trim() || null : null
    const birthYear = toInt(input.birthYear)
    const birthMonth = toInt(input.birthMonth)
    const birthDay = toInt(input.birthDay)
    const birthCirca = input.birthCirca ? 1 : 0
    const deathYear = toInt(input.deathYear)
    const deathMonth = toInt(input.deathMonth)
    const deathDay = toInt(input.deathDay)
    const deathCirca = input.deathCirca ? 1 : 0
    const birthPlaceId = input.birthPlaceId ? input.birthPlaceId.trim() || null : null
    const birthPlaceFree = (input.birthPlaceFree ?? "").trim()
    const deathPlaceId = input.deathPlaceId ? input.deathPlaceId.trim() || null : null
    const deathPlaceFree = (input.deathPlaceFree ?? "").trim()
    const lifeStatus = (input.lifeStatus ?? "").trim()

    let finalAliases = aliases
    if (input.keepOldNameAsAlias && newName !== existing.name) {
      if (!finalAliases.includes(existing.name)) finalAliases = [...finalAliases, existing.name]
    }

    // 校验父级：同类型、未删除、无环
    if (parentId) {
      await this.validateParent(id, input.type, parentId)
    }

    this.assertUniqueNameInType(input.type, newName, id)

    this.db
      .prepare(
        `UPDATE entities SET slug = ?, type = ?, name = ?, intro = ?, note = ?, race = ?, parent_id = ?,
           birth_year = ?, birth_month = ?, birth_day = ?, birth_circa = ?, death_year = ?, death_month = ?, death_day = ?, death_circa = ?,
           birth_place_id = ?, birth_place_free = ?, death_place_id = ?, death_place_free = ?,
           life_status = ?,
           status = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        slug,
        input.type,
        newName,
        input.intro ?? "",
        input.note ?? "",
        race,
        parentId,
        birthYear,
        birthMonth,
        birthDay,
        birthCirca,
        deathYear,
        deathMonth,
        deathDay,
        deathCirca,
        birthPlaceId,
        birthPlaceFree,
        deathPlaceId,
        deathPlaceFree,
        lifeStatus,
        input.status ?? existing.status,
        now,
        id
      )
    this.replaceAliases(id, finalAliases)
    if (existing.type !== input.type) {
      this.db.prepare("DELETE FROM entity_factions WHERE entity_id = ?").run(id)
      await this.deleteRelationsForPerson(id)
      if (input.type === "person") {
        this.db.prepare("UPDATE entities SET parent_id = NULL WHERE id = ?").run(id)
      }
    }
    await this.replaceFactions(id, input.type === "person" ? input.factions ?? [] : [])
    return (await this.getEntityById(id))!
  }

  /** 同类实体的标准名必须唯一（大小写不敏感，与 findEntityCandidates 匹配口径一致） */
  private assertUniqueNameInType(type: EntityType, name: string, excludeId: string | null): void {
    const conflict = this.db
      .prepare(
        `SELECT name FROM entities
         WHERE deleted = 0 AND type = ? AND name = ? COLLATE NOCASE AND id <> ?
         LIMIT 1`
      )
      .get(type, name.trim(), excludeId ?? "") as { name: string } | undefined
    if (conflict) {
      throw new Error(
        `同类实体（${ENTITY_TYPE_LABELS[type]}）中已存在同名标准名「${conflict.name}」。` +
          "同类实体的标准名必须唯一，请改用别名区分或修改标准名。"
      )
    }
  }

  /** 校验父级引用：必须存在、未删除、同类型，且不形成环 */
  private async validateParent(entityId: string, type: EntityType, parentId: string): Promise<void> {    const parent = await this.getEntityById(parentId)
    if (!parent) throw new Error("上级实体不存在或已删除")
    if (parent.type !== type) throw new Error("上级实体类型必须与当前实体一致")
    if (await this.detectHierarchyCycle(entityId, parentId)) {
      throw new Error("不能将自身或后代设为上级，这会形成层级环")
    }
  }

  private async replaceFactions(entityId: string, factions: FactionInput[]): Promise<void> {
    if (factions.length > 0) {
      const member = this.db
        .prepare("SELECT type FROM entities WHERE id = ? AND deleted = 0")
        .get(entityId) as { type: string } | undefined
      if (!member) throw new Error("实体不存在或已删除，无法保存所属势力")
      if (member.type !== "person") throw new Error("只有人物实体可以设置所属势力")
      for (const f of factions) {
        const target = this.db
          .prepare("SELECT type FROM entities WHERE id = ? AND deleted = 0")
          .get(f.factionId) as { type: string } | undefined
        if (!target || target.type !== "faction") {
          throw new Error(`所属势力无效或不是势力类型实体：${f.factionId}`)
        }
      }
    }
    this.db.prepare("DELETE FROM entity_factions WHERE entity_id = ?").run(entityId)
    const insert = this.db.prepare(
      "INSERT INTO entity_factions (id, entity_id, faction_id, role, ordinal) VALUES (?, ?, ?, ?, ?)"
    )
    for (let i = 0; i < factions.length; i++) {
      const f = factions[i]
      insert.run(newId(), entityId, f.factionId, (f.role ?? "").trim(), i)
    }
  }

  private replaceAliases(entityId: string, aliases: string[]): void {
    this.db.prepare("DELETE FROM entity_aliases WHERE entity_id = ?").run(entityId)
    const insert = this.db.prepare(
      "INSERT INTO entity_aliases (entity_id, alias) VALUES (?, ?)"
    )
    for (const alias of aliases) insert.run(entityId, alias)
  }

  /** 校验并归一任务分类；空值默认为主线 */
  private normalizeQuestCategory(raw: string | undefined): string {
    const value = (raw ?? "").trim()
    if (!value) return "main"
    if (!(QUEST_CATEGORIES as string[]).includes(value)) {
      throw new Error(`任务分类不合法：${value}`)
    }
    return value
  }

  /** 任务的标准名必须唯一（大小写不敏感，未删除任务内） */
  private assertUniqueQuestName(name: string, excludeId: string | null): void {
    const conflict = this.db
      .prepare(
        `SELECT name FROM quests
         WHERE deleted = 0 AND name = ? COLLATE NOCASE AND id <> ?
         LIMIT 1`
      )
      .get(name.trim(), excludeId ?? "") as { name: string } | undefined
    if (conflict) {
      throw new Error(`已存在同名任务「${conflict.name}」。任务的标准名必须唯一。`)
    }
  }

  /** 校验任务存在且未删除 */
  private validateQuestEntity(questId: string): void {
    const quest = this.db
      .prepare("SELECT id FROM quests WHERE id = ? AND deleted = 0")
      .get(questId)
    if (!quest) throw new Error("任务不存在或已删除")
  }

  // ---------- 任务：独立数据存在的 CRUD（v5） ----------

  async listQuests(opts: ListQuestsOpts = {}): Promise<Quest[]> {
    const where: string[] = []
    const params: unknown[] = []
    if (opts.deletedOnly) {
      where.push("deleted = 1")
    } else if (!opts.includeDeleted) {
      where.push("deleted = 0")
    }
    if (opts.status) {
      where.push("status = ?")
      params.push(opts.status)
    }
    const sql = `SELECT * FROM quests${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`
    const rows = this.db.prepare(sql).all(...params) as QuestRow[]
    return rows
      .map((r) => this.rowToQuest(r))
      .sort(
        (a, b) =>
          questCategoryRank(a.category) - questCategoryRank(b.category) ||
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          compareZh(a.chapter, b.chapter) ||
          compareZh(a.stage, b.stage) ||
          compareZh(a.name, b.name)
      )
  }

  async getQuestById(id: string): Promise<Quest | null> {
    const row = this.db
      .prepare("SELECT * FROM quests WHERE id = ? AND deleted = 0")
      .get(id) as QuestRow | undefined
    return row ? this.rowToQuest(row) : null
  }

  async getQuestBySlug(
    slug: string,
    opts: { includeDraft?: boolean } = {}
  ): Promise<Quest | null> {
    const row = this.db
      .prepare("SELECT * FROM quests WHERE slug = ? AND deleted = 0")
      .get(slug) as QuestRow | undefined
    if (!row) return null
    if (!opts.includeDraft && row.status !== "published") return null
    return this.rowToQuest(row)
  }

  async createQuest(input: QuestInput): Promise<Quest> {
    const now = nowIso()
    const id = newId()
    const name = input.name.trim()
    if (!name) throw new Error("任务名称不能为空")
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "quests",
      null
    )
    const category = this.normalizeQuestCategory(input.category)
    const chapter = (input.chapter ?? "").trim()
    const stage = (input.stage ?? "").trim()
    const sortOrder = toInt(input.sortOrder)
    const status = input.status ?? "draft"
    const persons = input.persons ?? []

    // 校验出场人物：提前于任务插入，避免校验失败后留下脏任务行
    if (persons.length > 0) {
      await this.validateQuestPersons(persons)
    }
    this.assertUniqueQuestName(name, null)

    this.db
      .prepare(
        `INSERT INTO quests (id, slug, name, category, chapter, stage, sort_order, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, slug, name, category, chapter, stage, sortOrder, input.note ?? "", status, now, now)
    await this.replaceQuestCharacters(id, persons)
    return (await this.getQuestById(id))!
  }

  async updateQuest(id: string, input: QuestInput): Promise<Quest> {
    const existing = await this.getQuestById(id)
    if (!existing) throw new Error("任务不存在")
    const now = nowIso()
    const name = input.name.trim()
    if (!name) throw new Error("任务名称不能为空")
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.name,
      "quests",
      id
    )
    const category = this.normalizeQuestCategory(input.category)
    const chapter = (input.chapter ?? "").trim()
    const stage = (input.stage ?? "").trim()
    const sortOrder = toInt(input.sortOrder)
    const status = input.status ?? existing.status
    // 未显式传入 persons 时保留现有关联，避免误清空
    const persons =
      input.persons ??
      (await this.getQuestCharacters(id)).map((c) => ({ personId: c.personId, role: c.role }))
    await this.validateQuestPersons(persons)
    this.assertUniqueQuestName(name, id)

    this.db
      .prepare(
        `UPDATE quests SET slug = ?, name = ?, category = ?, chapter = ?, stage = ?,
           sort_order = ?, note = ?, status = ?, updated_at = ? WHERE id = ?`
      )
      .run(slug, name, category, chapter, stage, sortOrder, input.note ?? "", status, now, id)
    await this.replaceQuestCharacters(id, persons)
    return (await this.getQuestById(id))!
  }

  async deleteQuest(id: string): Promise<void> {
    this.db.prepare("UPDATE quests SET deleted = 1, updated_at = ? WHERE id = ?").run(nowIso(), id)
  }

  async restoreQuest(id: string): Promise<void> {
    const row = this.db
      .prepare("SELECT name FROM quests WHERE id = ?")
      .get(id) as { name: string } | undefined
    if (!row) throw new Error("任务不存在")
    this.assertUniqueQuestName(row.name, id)
    this.db.prepare("UPDATE quests SET deleted = 0, updated_at = ? WHERE id = ?").run(nowIso(), id)
  }

  async getQuestCount(status?: ContentStatus): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM quests WHERE deleted = 0 ${status ? "AND status = ?" : ""}`)
      .get(...(status ? [status] : [])) as { n: number }
    return row.n
  }

  // ---------- 任务↔人物关联 ----------

  async getQuestCharacters(questId: string): Promise<QuestCharacter[]> {
    const rows = this.db
      .prepare(
        `SELECT qc.id, qc.quest_id, qc.person_id, qc.role, qc.ordinal
         FROM quest_characters qc
         JOIN entities p ON p.id = qc.person_id AND p.deleted = 0 AND p.type = 'person'
         WHERE qc.quest_id = ?
         ORDER BY qc.ordinal`
      )
      .all(questId) as {
      id: string; quest_id: string; person_id: string; role: string; ordinal: number
    }[]
    return rows.map((r) => ({
      id: r.id,
      questId: r.quest_id,
      personId: r.person_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
  }

  async getQuestsForPerson(personId: string): Promise<QuestPersonRef[]> {
    const rows = this.db
      .prepare(
        `SELECT qc.role, qc.ordinal, q.*
         FROM quest_characters qc
         JOIN quests q ON q.id = qc.quest_id AND q.deleted = 0
         WHERE qc.person_id = ?`
      )
      .all(personId) as (QuestRow & { role: string; ordinal: number })[]
    return rows
      .map((r) => ({
        quest: this.rowToQuest(r),
        role: r.role,
        ordinal: r.ordinal,
      }))
      .sort(
        (a, b) =>
          questCategoryRank(a.quest.category) - questCategoryRank(b.quest.category) ||
          (a.quest.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.quest.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          compareZh(a.quest.chapter, b.quest.chapter) ||
          compareZh(a.quest.stage, b.quest.stage) ||
          a.ordinal - b.ordinal ||
          compareZh(a.quest.name, b.quest.name)
      )
  }

  /** 校验任务出场人物引用：必须存在、未删除且为人物类型 */
  private async validateQuestPersons(persons: QuestPersonInput[]): Promise<void> {
    for (const p of persons) {
      const person = this.db
        .prepare("SELECT type FROM entities WHERE id = ? AND deleted = 0")
        .get(p.personId) as { type: string } | undefined
      if (!person || person.type !== "person") {
        throw new Error(`出场人物无效或不是人物类型实体：${p.personId}`)
      }
    }
  }

  private async replaceQuestCharacters(questId: string, persons: QuestPersonInput[]): Promise<void> {
    if (persons.length > 0) {
      this.validateQuestEntity(questId)
      await this.validateQuestPersons(persons)
    }
    this.db.prepare("DELETE FROM quest_characters WHERE quest_id = ?").run(questId)
    const insert = this.db.prepare(
      "INSERT INTO quest_characters (id, quest_id, person_id, role, ordinal) VALUES (?, ?, ?, ?, ?)"
    )
    for (let i = 0; i < persons.length; i++) {
      const p = persons[i]
      insert.run(newId(), questId, p.personId, (p.role ?? "").trim(), i)
    }
  }

  async deleteEntity(id: string): Promise<void> {
    // v2：删除人物时清理其相关关系
    await this.deleteRelationsForPerson(id)
    this.db.prepare("UPDATE entities SET deleted = 1, updated_at = ? WHERE id = ?").run(nowIso(), id)
  }

  async restoreEntity(id: string): Promise<void> {
    const row = this.db
      .prepare("SELECT type, name FROM entities WHERE id = ?")
      .get(id) as { type: EntityType; name: string } | undefined
    if (!row) throw new Error("实体不存在")
    this.assertUniqueNameInType(row.type, row.name, id)
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

  async getEntityFactions(entityId: string): Promise<EntityFaction[]> {
    const rows = this.db
      .prepare(
        `SELECT ef.id, ef.entity_id, ef.faction_id, ef.role, ef.ordinal
         FROM entity_factions ef
         JOIN entities f ON f.id = ef.faction_id AND f.deleted = 0
         WHERE ef.entity_id = ?
         ORDER BY ef.ordinal`
      )
      .all(entityId) as {
      id: string; entity_id: string; faction_id: string; role: string; ordinal: number
    }[]
    return rows.map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      factionId: r.faction_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
  }

  async getFactionMembers(factionId: string): Promise<{ entity: Entity; role: string; ordinal: number }[]> {
    const rows = this.db
      .prepare(
        `SELECT e.*, ef.role, ef.ordinal
         FROM entity_factions ef
         JOIN entities e ON e.id = ef.entity_id AND e.deleted = 0
         WHERE ef.faction_id = ?
          ORDER BY ef.ordinal`
      )
      .all(factionId) as (EntityRow & { role: string; ordinal: number })[]
    const aliasMap = this.aliasesFor(rows.map((r) => r.id))
    return rows
      .map((r) => ({
        entity: this.rowToEntity(r, aliasMap.get(r.id) ?? []),
        role: r.role,
        ordinal: r.ordinal,
      }))
      .sort((a, b) => a.ordinal - b.ordinal || compareZh(a.entity.name, b.entity.name))
  }

  async getEntityChildren(parentId: string, opts: { status?: ContentStatus } = {}): Promise<Entity[]> {
    let sql = `SELECT * FROM entities WHERE parent_id = ? AND deleted = 0`
    const params: unknown[] = [parentId]
    if (opts.status) {
      sql += ` AND status = ?`
      params.push(opts.status)
    }
    const rows = this.db.prepare(sql).all(...params) as EntityRow[]
    const aliasMap = this.aliasesFor(rows.map((r) => r.id))
    return rows
      .map((r) => this.rowToEntity(r, aliasMap.get(r.id) ?? []))
      .sort((a, b) => compareZh(a.name, b.name))
  }

  async getEntityAncestors(entityId: string, opts: { publicOnly?: boolean } = {}): Promise<Entity[]> {
    const chain: Entity[] = []
    let currentId: string | null = entityId
    const seen = new Set<string>([entityId])
    while (currentId) {
      const row = this.db
        .prepare("SELECT * FROM entities WHERE id = ? AND deleted = 0")
        .get(currentId) as EntityRow | undefined
      if (!row || !row.parent_id) break
      if (seen.has(row.parent_id)) break // 防御性成环检测
      seen.add(row.parent_id)
      const parentRow = this.db
        .prepare("SELECT * FROM entities WHERE id = ? AND deleted = 0")
        .get(row.parent_id) as EntityRow | undefined
      if (!parentRow) break
      // 草稿父级不推入，但其祖先仍需继续向上收集
      if (!(opts.publicOnly && parentRow.status !== "published")) {
        const parentAliases = this.aliasesFor([parentRow.id]).get(parentRow.id) ?? []
        chain.push(this.rowToEntity(parentRow, parentAliases))
      }
      // 推进到父节点本身，下一轮才会推入父节点的父级（若跳到再上级会隔级丢失）
      currentId = parentRow.id
    }
    // 返回顺序：顶级 → 直接父级（与面包屑/上级展示的方向一致）
    return chain.reverse()
  }

  async detectHierarchyCycle(entityId: string, candidateParentId: string): Promise<boolean> {
    if (entityId === candidateParentId) return true
    const seen = new Set<string>([candidateParentId])
    let currentId: string | null = candidateParentId
    while (currentId) {
      const row = this.db
        .prepare("SELECT parent_id FROM entities WHERE id = ? AND deleted = 0")
        .get(currentId) as { parent_id: string | null } | undefined
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
    const rows = this.db
      .prepare(
        `SELECT r.* FROM person_relations r
         JOIN entities a ON a.id = r.from_id AND a.deleted = 0
         JOIN entities b ON b.id = r.to_id AND b.deleted = 0
         WHERE r.from_id = ? OR r.to_id = ?
         ORDER BY r.from_id = ? DESC, r.ordinal`
      )
      .all(personId, personId, personId) as {
      id: string; from_id: string; to_id: string; kind: string;
      reverse_kind: string; ordinal: number; created_at: string
    }[]

    const result: RelationWithEntity[] = []
    for (const r of rows) {
      const isFrom = r.from_id === personId
      const otherId = isFrom ? r.to_id : r.from_id
      const other = await this.getEntityById(otherId)
      if (!other) continue
      // 当前视角是 from：显示 to + 反向称呼（为空时回退正向）
      // 当前视角是 to：显示 from + 正向称呼
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
    const now = nowIso()
    const ordinal = this.nextRelationOrdinal(input.fromId)
    this.db
      .prepare(
        `INSERT INTO person_relations (id, from_id, to_id, kind, reverse_kind, ordinal, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.fromId, input.toId, input.kind.trim(), (input.reverseKind ?? "").trim(), ordinal, now)
    return (await this.getRelationById(id))!
  }

  async updateRelation(id: string, input: RelationInput): Promise<PersonRelation> {
    const existing = this.db
      .prepare("SELECT id FROM person_relations WHERE id = ?")
      .get(id) as { id: string } | undefined
    if (!existing) throw new Error("关系记录不存在")
    await this.validateRelation(input.fromId, input.toId)
    this.db
      .prepare(
        `UPDATE person_relations SET from_id = ?, to_id = ?, kind = ?, reverse_kind = ? WHERE id = ?`
      )
      .run(input.fromId, input.toId, input.kind.trim(), (input.reverseKind ?? "").trim(), id)
    return (await this.getRelationById(id))!
  }

  async deleteRelation(id: string): Promise<void> {
    this.db.prepare("DELETE FROM person_relations WHERE id = ?").run(id)
  }

  async deleteRelationsForPerson(personId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM person_relations WHERE from_id = ? OR to_id = ?")
      .run(personId, personId)
  }

  private async getRelationById(id: string): Promise<PersonRelation | null> {
    const row = this.db
      .prepare("SELECT * FROM person_relations WHERE id = ?")
      .get(id) as {
      id: string; from_id: string; to_id: string; kind: string;
      reverse_kind: string; ordinal: number; created_at: string
    } | undefined
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

  private nextRelationOrdinal(fromId: string): number {
    const row = this.db
      .prepare("SELECT MAX(ordinal) AS max_ordinal FROM person_relations WHERE from_id = ?")
      .get(fromId) as { max_ordinal: number | null } | undefined
    return (row?.max_ordinal ?? -1) + 1
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
    const rows = this.db
      .prepare(
        `SELECT tea.id, tea.entry_id, tea.target_id, tea.ordinal
         FROM text_entity_associations tea
         JOIN entities e ON e.id = tea.target_id AND e.deleted = 0
         WHERE tea.entry_id = ?
         ORDER BY tea.ordinal`
      )
      .all(entryId) as {
      id: string; entry_id: string; target_id: string; ordinal: number
    }[]
    return rows.map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      targetId: r.target_id,
      ordinal: r.ordinal,
    }))
  }

  async setTextEntityAssociations(entryId: string, associations: TextAssociationInput[]): Promise<void> {
    this.db.prepare("DELETE FROM text_entity_associations WHERE entry_id = ?").run(entryId)
    const insert = this.db.prepare(
      "INSERT INTO text_entity_associations (id, entry_id, target_id, ordinal) VALUES (?, ?, ?, ?)"
    )
    for (let i = 0; i < associations.length; i++) {
      const a = associations[i]
      insert.run(newId(), entryId, a.targetId, i)
    }
  }

  async getWholeEntryTextsForEntity(entityId: string): Promise<WholeEntryText[]> {
    const rows = this.db
      .prepare(
        `SELECT tea.id AS association_id, tea.ordinal,
                t.id AS entry_id, t.slug AS entry_slug, t.title AS entry_title,
                t.source_category, t.source_name, t.ingame_location
         FROM text_entity_associations tea
         JOIN text_entries t ON t.id = tea.entry_id AND t.deleted = 0 AND t.status = 'published'
         WHERE tea.target_id = ?
          ORDER BY tea.ordinal`
      )
      .all(entityId) as {
      association_id: string; ordinal: number;
      entry_id: string; entry_slug: string; entry_title: string;
      source_category: string; source_name: string; ingame_location: string
    }[]
    return rows
      .map((r) => ({
        associationId: r.association_id,
        entryId: r.entry_id,
        entrySlug: r.entry_slug,
        entryTitle: r.entry_title,
        sourceCategory: r.source_category,
        sourceName: r.source_name,
        ingameLocation: r.ingame_location,
        ordinal: r.ordinal,
      }))
      .sort((a, b) => a.ordinal - b.ordinal || compareZh(a.entryTitle, b.entryTitle))
  }

  async getWholeEntryIdsForEntity(entityId: string): Promise<Set<string>> {
    const rows = this.db
      .prepare(
        `SELECT t.id AS entry_id
         FROM text_entity_associations tea
         JOIN text_entries t ON t.id = tea.entry_id AND t.deleted = 0 AND t.status = 'published'
         WHERE tea.target_id = ?`
      )
      .all(entityId) as { entry_id: string }[]
    return new Set(rows.map((r) => r.entry_id))
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
    if (opts.questId) {
      where.push("quest_id = ?")
      params.push(opts.questId)
    }
    if (opts.search && opts.search.trim()) {
      where.push("title LIKE ? ESCAPE '\\'")
      params.push(`%${escapeLike(opts.search.trim())}%`)
    }
    const sql = `SELECT * FROM text_entries${
      where.length ? ` WHERE ${where.join(" AND ")}` : ""
    }`
    const rows = this.db.prepare(sql).all(...params) as TextEntryRow[]
    return rows.map((r) => this.rowToTextEntry(r)).sort((a, b) => compareZh(a.title, b.title))
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
        `SELECT DISTINCT source_category AS c FROM text_entries WHERE deleted = 0 AND source_category <> ''`
      )
      .all() as { c: string }[]
    return rows.map((r) => r.c).sort(compareZh)
  }

  async saveTextEntry(id: string | null, input: TextEntryInput): Promise<SaveTextResult> {
    const now = nowIso()
    const slug = this.uniqueSlug(
      input.slug && input.slug.trim() ? input.slug : input.title,
      "text_entries",
      id
    )
    // questId 语义：undefined = 更新时保持现有值 / 创建时为空；显式空值 = 清除；非空 = 校验后写入
    let questId: string | null
    if (input.questId === undefined) {
      if (id) {
        const row = this.db
          .prepare("SELECT quest_id FROM text_entries WHERE id = ?")
          .get(id) as { quest_id: string | null } | undefined
        if (!row) throw new Error("文本条目不存在")
        questId = row.quest_id ?? null
      } else {
        questId = null
      }
    } else {
      questId = input.questId && String(input.questId).trim() ? String(input.questId).trim() : null
      if (questId) {
        this.validateQuestEntity(questId)
      }
    }

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
        const resolved = await resolveWikiLink(this, link)
        if (resolved.issue) {
          issues.push({
            raw: link.raw,
            target: resolved.issue === "invalid" ? "" : link.target,
            reason: resolved.issue,
            candidates: resolved.candidates,
          })
        } else if (resolved.candidate) {
          resolvedLinks.push({
            blockIndex: i,
            raw: link.raw,
            targetKind: resolved.candidate.kind,
            targetId: resolved.candidate.id,
            displayText: resolved.displayText,
          })
        }
      }
    }

    let entryId: string
    if (id) {
      entryId = id
      this.db
        .prepare(
          `UPDATE text_entries SET slug = ?, title = ?, source_category = ?, source_name = ?,
             ingame_location = ?, note = ?, body = ?, quest_id = ?, status = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          slug,
          input.title.trim(),
          input.sourceCategory,
          input.sourceName,
          input.ingameLocation,
          input.note,
          input.body,
          questId,
          input.status,
          now,
          id
        )
    } else {
      entryId = newId()
      this.db
        .prepare(
          `INSERT INTO text_entries (id, slug, title, source_category, source_name,
             ingame_location, note, body, quest_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entryId,
          slug,
          input.title.trim(),
          input.sourceCategory,
          input.sourceName,
          input.ingameLocation,
          input.note,
          input.body,
          questId,
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

  /** 设置文本的所属任务（v5：一对多，一篇文本至多属于一个任务；null 表示清除） */
  async setTextEntryQuest(entryId: string, questId: string | null): Promise<void> {
    const normalized = questId && questId.trim() ? questId.trim() : null
    if (normalized) {
      this.validateQuestEntity(normalized)
    }
    const result = this.db
      .prepare("UPDATE text_entries SET quest_id = ?, updated_at = ? WHERE id = ? AND deleted = 0")
      .run(normalized, nowIso(), entryId)
    if (result.changes === 0) {
      throw new Error("文本条目不存在或已删除")
    }
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
    return out.sort(
      (a, b) => compareZh(a.entryTitle, b.entryTitle) || a.blockOrdinal - b.blockOrdinal
    )
  }

  async exportAll(): Promise<ExportData> {
    const entities = await this.listEntities({ includeDeleted: true })
    const quests = await this.listQuests({ includeDeleted: true })
    const textEntries = await this.listTextEntries({ includeDeleted: true })
    const allBlocks = this.db
      .prepare("SELECT * FROM text_blocks ORDER BY entry_id, ordinal")
      .all() as BlockRow[]
    const blocks: TextBlock[] = allBlocks.map((r) => this.rowToBlock(r))
    const allLinks = this.db.prepare("SELECT * FROM content_links").all() as LinkRow[]
    const links: ContentLink[] = allLinks.map((r) => this.rowToLink(r))
    const factionRows = this.db
      .prepare("SELECT * FROM entity_factions ORDER BY entity_id, ordinal")
      .all() as { id: string; entity_id: string; faction_id: string; role: string; ordinal: number }[]
    const factions: EntityFaction[] = factionRows.map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      factionId: r.faction_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
    const relationRows = this.db
      .prepare("SELECT * FROM person_relations ORDER BY from_id, ordinal")
      .all() as { id: string; from_id: string; to_id: string; kind: string; reverse_kind: string; ordinal: number; created_at: string }[]
    const relations: PersonRelation[] = relationRows.map((r) => ({
      id: r.id,
      fromId: r.from_id,
      toId: r.to_id,
      kind: r.kind,
      reverseKind: r.reverse_kind,
      ordinal: r.ordinal,
      createdAt: r.created_at,
    }))
    const assocRows = this.db
      .prepare("SELECT * FROM text_entity_associations ORDER BY entry_id, ordinal")
      .all() as { id: string; entry_id: string; target_id: string; ordinal: number }[]
    const textEntityAssociations: TextEntityAssociation[] = assocRows.map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      targetId: r.target_id,
      ordinal: r.ordinal,
    }))
    const questCharRows = this.db
      .prepare("SELECT * FROM quest_characters ORDER BY quest_id, ordinal")
      .all() as { id: string; quest_id: string; person_id: string; role: string; ordinal: number }[]
    const questCharacters: QuestCharacter[] = questCharRows.map((r) => ({
      id: r.id,
      questId: r.quest_id,
      personId: r.person_id,
      role: r.role,
      ordinal: r.ordinal,
    }))
    return {
      schemaVersion: 4,
      exportedAt: nowIso(),
      settings: await this.getSettings(),
      entities,
      quests,
      textEntries,
      blocks,
      links,
      factions,
      relations,
      textEntityAssociations,
      questCharacters,
    }
  }
}
