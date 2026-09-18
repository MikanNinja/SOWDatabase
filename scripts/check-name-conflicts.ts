import { getStore } from "../lib/db/store"
import { ENTITY_TYPE_LABELS } from "../lib/db/types"
import type { Entity } from "../lib/db/types"

/**
 * 只读审计：不写入任何数据。
 * A. 同类实体标准名重复 —— 违反“同类实体的标准名必须唯一”规则，需人工处理。
 * B. 多候选命名 —— 跨类型同名 / 名称=别名 / 别名重复等合法情形，
 *    但 [[名称]] 解析会产生 ambiguous，需用钉定写法 [[名称@slug]] 指定目标。
 */
async function main() {
  const store = await getStore()
  const entities = await store.listEntities({})

  const byTypeKey = new Map<string, Entity[]>()
  for (const e of entities) {
    const key = `${e.type}|${e.name.trim().toLowerCase()}`
    const list = byTypeKey.get(key) ?? []
    list.push(e)
    byTypeKey.set(key, list)
  }
  const dupes = [...byTypeKey.values()].filter((list) => list.length > 1)
  console.log(`=== A. 同类标准名重复（违例，同类实体的标准名必须唯一）: ${dupes.length} 组 ===`)
  for (const list of dupes) {
    console.log(
      `  [${ENTITY_TYPE_LABELS[list[0].type]}] 「${list[0].name}」: ${list
        .map((e) => `${e.name}（${e.slug}）`)
        .join("、")}`
    )
  }

  const valueOwners = new Map<string, { value: string; owners: Entity[] }>()
  for (const e of entities) {
    const values = [e.name, ...e.aliases].map((v) => v.trim()).filter(Boolean)
    const seen = new Set<string>()
    for (const v of values) {
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const entry = valueOwners.get(key) ?? { value: v, owners: [] }
      entry.owners.push(e)
      valueOwners.set(key, entry)
    }
  }
  const ambiguous: { value: string; owners: Entity[] }[] = []
  for (const { value, owners } of valueOwners.values()) {
    const cands = await store.findEntityCandidates(value)
    if (cands.length > 1) ambiguous.push({ value, owners })
  }
  console.log(
    `\n=== B. 多候选命名（解析会产生 ambiguous，链接需用 [[名称@slug]] 钉定）: ${ambiguous.length} 个 ===`
  )
  for (const { value, owners } of ambiguous) {
    console.log(
      `  「${value}」 ← ${owners
        .map((e) => `${ENTITY_TYPE_LABELS[e.type]}·${e.name}（${e.slug}）`)
        .join("、")}`
    )
  }

  console.log(`\n未删除实体总数: ${entities.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
