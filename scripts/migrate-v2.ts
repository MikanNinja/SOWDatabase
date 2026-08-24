/**
 * v2 数据模型迁移脚本（幂等）
 *
 * 为已上线数据库做非破坏性扩展：
 * - entities 增加可空列 race（人物种族）、parent_id（地点/势力上级引用）
 * - 新建表 entity_factions（人物所属势力关联）
 * - 新建表 person_relations（人物↔人物有向关系）
 * - 新建表 text_entity_associations（整篇级关联）
 *
 * 同时支持 SQLite（默认）与 Supabase（DATA_BACKEND=supabase）两种后端。
 * 可在干净环境与已有数据环境各执行一次均成功。
 *
 * 用法：
 *   npm run migrate:v2
 *   DATA_BACKEND=supabase npm run migrate:v2   # 需同时设置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import Database from "better-sqlite3"
import { SQLITE_SCHEMA } from "../lib/db/schema"

// ---------- SQLite 迁移 ----------

function migrateSqlite(): void {
  const path = process.env.SQLITE_PATH || "data/app.db"
  const db = new Database(path)
  db.pragma("journal_mode = WAL")

  // 1. 对既有库先补齐 v2 新增列（ALTER TABLE），再执行完整 schema。
  //    全新库因 entities 表不存在会跳过 ALTER，直接由 CREATE TABLE 建表（含新列）。
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'")
    .get() as { name: string } | undefined
  if (existing) {
    const cols = db.prepare("PRAGMA table_info(entities)").all() as { name: string }[]
    const colNames = new Set(cols.map((c) => c.name))
    if (!colNames.has("race")) {
      db.exec("ALTER TABLE entities ADD COLUMN race TEXT NOT NULL DEFAULT ''")
      console.log("  + entities.race 已添加")
    } else {
      console.log("  = entities.race 已存在")
    }
    if (!colNames.has("parent_id")) {
      db.exec("ALTER TABLE entities ADD COLUMN parent_id TEXT")
      console.log("  + entities.parent_id 已添加")
    } else {
      console.log("  = entities.parent_id 已存在")
    }
  } else {
    console.log("  = entities 表不存在，将由 schema 一次性创建")
  }

  // 2. 执行完整 schema：新表用 CREATE TABLE IF NOT EXISTS，索引用 CREATE INDEX IF NOT EXISTS，均幂等。
  db.exec(SQLITE_SCHEMA)

  // 3. 确认新表存在
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]
  const tableNames = new Set(tables.map((t) => t.name))
  for (const t of ["entity_factions", "person_relations", "text_entity_associations"]) {
    if (!tableNames.has(t)) {
      throw new Error(`迁移失败：表 ${t} 未创建`)
    }
  }
  console.log("  = 新表 entity_factions / person_relations / text_entity_associations 均就绪")

  db.close()
  console.log("SQLite 迁移完成。")
}

// ---------- Supabase 迁移 ----------

async function migrateSupabase(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js")
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("使用 Supabase 后端必须配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // 1. 检查 entities 是否缺少 race / parent_id 列
  const { data: colData, error: colError } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "entities")
  if (colError) throw colError
  const colNames = new Set((colData ?? []).map((c: { column_name: string }) => c.column_name))

  if (!colNames.has("race")) {
    const { error } = await supabase.rpc("exec_sql", {
      sql: "ALTER TABLE entities ADD COLUMN IF NOT EXISTS race text NOT NULL DEFAULT '';",
    }).single()
    // 多数 Supabase 项目没有 exec_sql RPC；回退到直连提示
    if (error) {
      console.log("  ! 无法通过 RPC 添加 entities.race，请在 Supabase SQL Editor 手动执行：")
      console.log("    ALTER TABLE entities ADD COLUMN IF NOT EXISTS race text NOT NULL DEFAULT '';")
      console.log("    ALTER TABLE entities ADD COLUMN IF NOT EXISTS parent_id uuid;")
      console.log("    ALTER TABLE entities ADD CONSTRAINT entities_parent_fk FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE SET NULL;")
    } else {
      console.log("  + entities.race 已添加")
    }
  } else {
    console.log("  = entities.race 已存在")
  }

  if (!colNames.has("parent_id")) {
    console.log("  ! 请在 Supabase SQL Editor 确认 entities.parent_id 已添加：")
    console.log("    ALTER TABLE entities ADD COLUMN IF NOT EXISTS parent_id uuid;")
    console.log("    ALTER TABLE entities ADD CONSTRAINT entities_parent_fk FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE SET NULL;")
  } else {
    console.log("  = entities.parent_id 已存在")
  }

  // 2. 检查新表是否存在
  const { data: tblData, error: tblError } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .in("table_name", ["entity_factions", "person_relations", "text_entity_associations"])
  if (tblError) throw tblError
  const existing = new Set((tblData ?? []).map((t: { table_name: string }) => t.table_name))

  const missing = ["entity_factions", "person_relations", "text_entity_associations"].filter(
    (t) => !existing.has(t)
  )
  if (missing.length > 0) {
    console.log(`  ! 缺少新表：${missing.join(", ")}`)
    console.log("  ! 请在 Supabase SQL Editor 重新执行 supabase/schema.sql（CREATE TABLE 不会重建已存在的表，但会创建缺失的表与索引、RLS 策略）。")
  } else {
    console.log("  = 新表 entity_factions / person_relations / text_entity_associations 均已存在")
  }

  console.log("Supabase 迁移检查完成。")
}

// ---------- 入口 ----------

async function main(): Promise<void> {
  const backend = (process.env.DATA_BACKEND ?? "sqlite").toLowerCase()
  console.log(`开始 v2 迁移（后端：${backend}）...`)
  if (backend === "supabase") {
    await migrateSupabase()
  } else {
    migrateSqlite()
  }
  console.log("v2 迁移结束。")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
