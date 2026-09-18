import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SQLITE_SCHEMA } from "../lib/db/schema"

type Row = Record<string, unknown>

const PAGE_SIZE = 1000

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (value == null) return fallback
  return String(value)
}

function nullableStr(value: unknown): string | null {
  return value == null ? null : String(value)
}

function int(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function ord(value: unknown): number {
  return int(value) ?? 0
}

function bool(value: unknown): number {
  return value === true || value === "true" ? 1 : 0
}

async function fetchAll(client: SupabaseClient, table: string): Promise<Row[]> {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`读取表 ${table} 失败：${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

interface EntityMapped {
  id: string
  slug: string
  type: string
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
  status: string
  created_at: string
  updated_at: string
  deleted: number
}

function mapEntity(row: Row): EntityMapped {
  const now = new Date().toISOString()
  return {
    id: str(row.id),
    slug: str(row.slug),
    type: str(row.type),
    name: str(row.name),
    intro: str(row.intro),
    note: str(row.note),
    race: str(row.race),
    parent_id: nullableStr(row.parent_id),
    birth_year: int(row.birth_year),
    birth_month: int(row.birth_month),
    birth_day: int(row.birth_day),
    birth_circa: bool(row.birth_circa),
    death_year: int(row.death_year),
    death_month: int(row.death_month),
    death_day: int(row.death_day),
    death_circa: bool(row.death_circa),
    birth_place_id: nullableStr(row.birth_place_id),
    birth_place_free: str(row.birth_place_free),
    death_place_id: nullableStr(row.death_place_id),
    death_place_free: str(row.death_place_free),
    status: str(row.status, "draft"),
    created_at: str(row.created_at, now),
    updated_at: str(row.updated_at, now),
    deleted: bool(row.deleted),
  }
}

function mapTextEntry(row: Row) {
  const now = new Date().toISOString()
  return {
    id: str(row.id),
    slug: str(row.slug),
    title: str(row.title),
    source_category: str(row.source_category),
    source_name: str(row.source_name),
    ingame_location: str(row.ingame_location),
    note: str(row.note),
    body: str(row.body),
    status: str(row.status, "draft"),
    created_at: str(row.created_at, now),
    updated_at: str(row.updated_at, now),
    deleted: bool(row.deleted),
  }
}

function mapTextBlock(row: Row) {
  return {
    id: str(row.id),
    entry_id: str(row.entry_id),
    ordinal: ord(row.ordinal),
    kind: str(row.kind, "paragraph"),
    content: str(row.content),
  }
}

function mapContentLink(row: Row) {
  return {
    id: str(row.id),
    block_id: str(row.block_id),
    target_kind: str(row.target_kind),
    target_id: str(row.target_id),
    source: str(row.source, "inline"),
    display_text: str(row.display_text),
    raw: str(row.raw),
  }
}

function mapEntityFaction(row: Row) {
  return {
    id: str(row.id),
    entity_id: str(row.entity_id),
    faction_id: str(row.faction_id),
    role: str(row.role),
    ordinal: ord(row.ordinal),
  }
}

function mapPersonRelation(row: Row) {
  const now = new Date().toISOString()
  return {
    id: str(row.id),
    from_id: str(row.from_id),
    to_id: str(row.to_id),
    kind: str(row.kind),
    reverse_kind: str(row.reverse_kind),
    note: str(row.note),
    ordinal: ord(row.ordinal),
    created_at: str(row.created_at, now),
  }
}

function mapTextEntityAssociation(row: Row) {
  return {
    id: str(row.id),
    entry_id: str(row.entry_id),
    target_id: str(row.target_id),
    ordinal: ord(row.ordinal),
  }
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。tsx 不读取 .env.local，请在 shell 中设置：" +
        "\n  Git Bash:  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run migrate:pull" +
        "\n  PowerShell: $env:SUPABASE_URL=\"https://xxx.supabase.co\"; $env:SUPABASE_SERVICE_ROLE_KEY=\"eyJ...\"; npm run migrate:pull" +
        "\n密钥位置：Supabase 控制台 → Project Settings → API keys → service_role"
    )
  }

  const dbPath = process.env.SQLITE_PATH || "data/app.db"
  const isDefaultTarget = !process.env.SQLITE_PATH
  console.log(`目标数据库: ${dbPath}${isDefaultTarget ? "（正式目标）" : "（试运行目标）"}`)

  const client = createClient(url, key, { auth: { persistSession: false } })

  const probe = await client
    .from("entities")
    .select("id, race, parent_id, birth_place_id, death_place_id")
    .limit(1)
  if (probe.error) {
    throw new Error(
      `生产库可能尚未执行 v2 迁移（缺 race/parent_id 列）。请先对 Supabase 运行："DATA_BACKEND=supabase npm run migrate:v2"，再重试本脚本。` +
        `\n原始错误：${probe.error.message}`
    )
  }

  console.log("正在从 Supabase 拉取数据（1000 行/页）……")
  const [settingsRows, entityRows, aliasRows, factionRows, relationRows, entryRows, blockRows, linkRows, assocRows] =
    await Promise.all([
      fetchAll(client, "settings"),
      fetchAll(client, "entities"),
      fetchAll(client, "entity_aliases"),
      fetchAll(client, "entity_factions"),
      fetchAll(client, "person_relations"),
      fetchAll(client, "text_entries"),
      fetchAll(client, "text_blocks"),
      fetchAll(client, "content_links"),
      fetchAll(client, "text_entity_associations"),
    ])
  console.log(
    `拉取完成：settings=${settingsRows.length} entities=${entityRows.length} aliases=${aliasRows.length} factions=${factionRows.length} relations=${relationRows.length} entries=${entryRows.length} blocks=${blockRows.length} links=${linkRows.length} associations=${assocRows.length}`
  )
  if (settingsRows.length === 0) {
    console.log("警告：来源 settings 表为空，将沿用本地现有设置（若无则回退默认值）")
  }

  if (fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
    const db = new Database(dbPath)
    db.pragma("wal_checkpoint(TRUNCATE)")
    db.close()
    fs.copyFileSync(dbPath, backupPath)
    console.log(`已备份 ${dbPath} → ${backupPath}`)
  } else {
    const dir = path.dirname(dbPath)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    console.log(`目标库 ${dbPath} 不存在，将新建`)
  }

  const db = new Database(dbPath)
  db.pragma("foreign_keys = ON")
  db.exec(SQLITE_SCHEMA)
  const cols = (db.prepare("PRAGMA table_info(entities)").all() as { name: string }[]).map((c) => c.name)
  for (const required of ["race", "parent_id"]) {
    if (!cols.includes(required)) {
      db.close()
      throw new Error(`本地库 ${dbPath} 缺少 entities.${required} 列，请先运行 npm run migrate:v2`)
    }
  }

  db.pragma("foreign_keys = OFF")
  db.exec(`
    DELETE FROM text_entity_associations;
    DELETE FROM person_relations;
    DELETE FROM entity_factions;
    DELETE FROM content_links;
    DELETE FROM text_blocks;
    DELETE FROM text_entries;
    DELETE FROM entity_aliases;
    DELETE FROM entities;
    DELETE FROM settings;
  `)

  const insertEntity = db.prepare(`INSERT INTO entities (
    id, slug, type, name, intro, note, race, parent_id,
    birth_year, birth_month, birth_day, birth_circa,
    death_year, death_month, death_day, death_circa,
    birth_place_id, birth_place_free, death_place_id, death_place_free,
    status, created_at, updated_at, deleted
  ) VALUES (
    @id, @slug, @type, @name, @intro, @note, @race, @parent_id,
    @birth_year, @birth_month, @birth_day, @birth_circa,
    @death_year, @death_month, @death_day, @death_circa,
    @birth_place_id, @birth_place_free, @death_place_id, @death_place_free,
    @status, @created_at, @updated_at, @deleted
  )`)
  const insertAlias = db.prepare("INSERT INTO entity_aliases (entity_id, alias) VALUES (?, ?)")
  const insertFaction = db.prepare(
    "INSERT INTO entity_factions (id, entity_id, faction_id, role, ordinal) VALUES (@id, @entity_id, @faction_id, @role, @ordinal)"
  )
  const insertRelation = db.prepare(
    "INSERT INTO person_relations (id, from_id, to_id, kind, reverse_kind, note, ordinal, created_at) VALUES (@id, @from_id, @to_id, @kind, @reverse_kind, @note, @ordinal, @created_at)"
  )
  const insertEntry = db.prepare(`INSERT INTO text_entries (
    id, slug, title, source_category, source_name, ingame_location, note, body,
    status, created_at, updated_at, deleted
  ) VALUES (
    @id, @slug, @title, @source_category, @source_name, @ingame_location, @note, @body,
    @status, @created_at, @updated_at, @deleted
  )`)
  const insertBlock = db.prepare(
    "INSERT INTO text_blocks (id, entry_id, ordinal, kind, content) VALUES (@id, @entry_id, @ordinal, @kind, @content)"
  )
  const insertLink = db.prepare(
    "INSERT INTO content_links (id, block_id, target_kind, target_id, source, display_text, raw) VALUES (@id, @block_id, @target_kind, @target_id, @source, @display_text, @raw)"
  )
  const insertAssociation = db.prepare(
    "INSERT INTO text_entity_associations (id, entry_id, target_id, ordinal) VALUES (@id, @entry_id, @target_id, @ordinal)"
  )
  const upsertSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )

  db.transaction(() => {
    for (const row of settingsRows) {
      upsertSetting.run(str(row.key), str(row.value))
    }
    for (const raw of entityRows) {
      insertEntity.run(mapEntity(raw))
    }
    for (const raw of aliasRows) {
      insertAlias.run(str(raw.entity_id), str(raw.alias))
    }
    for (const raw of entryRows) {
      insertEntry.run(mapTextEntry(raw))
    }
    for (const raw of blockRows) {
      insertBlock.run(mapTextBlock(raw))
    }
    for (const raw of linkRows) {
      insertLink.run(mapContentLink(raw))
    }
    for (const raw of factionRows) {
      insertFaction.run(mapEntityFaction(raw))
    }
    for (const raw of relationRows) {
      insertRelation.run(mapPersonRelation(raw))
    }
    for (const raw of assocRows) {
      insertAssociation.run(mapTextEntityAssociation(raw))
    }
  })()

  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

  const orphanChecks: { label: string; sql: string }[] = [
    {
      label: "entity_aliases.entity_id",
      sql: "SELECT COUNT(*) AS n FROM entity_aliases a LEFT JOIN entities e ON e.id = a.entity_id WHERE e.id IS NULL",
    },
    {
      label: "entity_factions.entity_id",
      sql: "SELECT COUNT(*) AS n FROM entity_factions f LEFT JOIN entities e ON e.id = f.entity_id WHERE e.id IS NULL",
    },
    {
      label: "entity_factions.faction_id",
      sql: "SELECT COUNT(*) AS n FROM entity_factions f LEFT JOIN entities e ON e.id = f.faction_id WHERE e.id IS NULL",
    },
    {
      label: "person_relations.from_id/to_id",
      sql: "SELECT COUNT(*) AS n FROM person_relations r LEFT JOIN entities f ON f.id = r.from_id LEFT JOIN entities t ON t.id = r.to_id WHERE f.id IS NULL OR t.id IS NULL",
    },
    {
      label: "text_blocks.entry_id",
      sql: "SELECT COUNT(*) AS n FROM text_blocks b LEFT JOIN text_entries t ON t.id = b.entry_id WHERE t.id IS NULL",
    },
    {
      label: "content_links.block_id",
      sql: "SELECT COUNT(*) AS n FROM content_links l LEFT JOIN text_blocks b ON b.id = l.block_id WHERE b.id IS NULL",
    },
    {
      label: "content_links.target(entity)",
      sql: "SELECT COUNT(*) AS n FROM content_links l LEFT JOIN entities e ON e.id = l.target_id WHERE l.target_kind = 'entity' AND e.id IS NULL",
    },
    {
      label: "content_links.target(text)",
      sql: "SELECT COUNT(*) AS n FROM content_links l LEFT JOIN text_entries t ON t.id = l.target_id WHERE l.target_kind = 'text' AND t.id IS NULL",
    },
    {
      label: "text_entity_associations.entry_id",
      sql: "SELECT COUNT(*) AS n FROM text_entity_associations a LEFT JOIN text_entries t ON t.id = a.entry_id WHERE t.id IS NULL",
    },
    {
      label: "text_entity_associations.target_id",
      sql: "SELECT COUNT(*) AS n FROM text_entity_associations a LEFT JOIN entities e ON e.id = a.target_id WHERE e.id IS NULL",
    },
  ]
  for (const check of orphanChecks) {
    const n = (db.prepare(check.sql).get() as { n: number }).n
    if (n > 0) throw new Error(`孤儿外键 ${check.label}：${n} 行`)
  }

  const publishedEntities = (db.prepare("SELECT COUNT(*) AS n FROM entities WHERE status = 'published' AND deleted = 0").get() as { n: number }).n
  const draftEntities = (db.prepare("SELECT COUNT(*) AS n FROM entities WHERE status = 'draft' AND deleted = 0").get() as { n: number }).n
  const deletedEntities = (db.prepare("SELECT COUNT(*) AS n FROM entities WHERE deleted = 1").get() as { n: number }).n
  const publishedEntries = (db.prepare("SELECT COUNT(*) AS n FROM text_entries WHERE status = 'published' AND deleted = 0").get() as { n: number }).n
  const draftEntries = (db.prepare("SELECT COUNT(*) AS n FROM text_entries WHERE status = 'draft' AND deleted = 0").get() as { n: number }).n
  const deletedEntries = (db.prepare("SELECT COUNT(*) AS n FROM text_entries WHERE deleted = 1").get() as { n: number }).n
  const inlineLinks = (db.prepare("SELECT COUNT(*) AS n FROM content_links WHERE source = 'inline'").get() as { n: number }).n
  const manualLinks = (db.prepare("SELECT COUNT(*) AS n FROM content_links WHERE source = 'manual'").get() as { n: number }).n

  const expected: [string, number, number][] = [
    ["settings", settingsRows.length, count("settings")],
    ["entities", entityRows.length, count("entities")],
    ["entity_aliases", aliasRows.length, count("entity_aliases")],
    ["entity_factions", factionRows.length, count("entity_factions")],
    ["person_relations", relationRows.length, count("person_relations")],
    ["text_entries", entryRows.length, count("text_entries")],
    ["text_blocks", blockRows.length, count("text_blocks")],
    ["content_links", linkRows.length, count("content_links")],
    ["text_entity_associations", assocRows.length, count("text_entity_associations")],
  ]
  for (const [table, source, stored] of expected) {
    if (source !== stored) throw new Error(`行数不一致 ${table}：来源 ${source} vs 入库 ${stored}`)
  }

  console.log("行数核对：全部一致")
  console.log("孤儿外键检查：全部通过")
  console.log(
    `实体：已发布 ${publishedEntities} / 草稿 ${draftEntities} / 已删除 ${deletedEntities}（别名 ${aliasRows.length}，所属势力 ${factionRows.length}，关系 ${relationRows.length}）`
  )
  console.log(
    `文本：已发布 ${publishedEntries} / 草稿 ${draftEntries} / 已删除 ${deletedEntries}（文本块 ${blockRows.length}，inline 链接 ${inlineLinks}，manual 链接 ${manualLinks}，整篇关联 ${assocRows.length}）`
  )
  console.log(isDefaultTarget ? "迁移完成：data/app.db 已替换为 Supabase 生产数据。" : "试运行完成：检查统计无误后，删除该预览库并对 data/app.db 正式执行。")

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
