import fs from "node:fs"
import { getStore } from "../lib/db/store"

async function main() {
  const store = await getStore()
  const data = await store.exportAll()
  const filename = `export-${data.exportedAt.replace(/[:.]/g, "-")}.json`
  fs.writeFileSync(filename, JSON.stringify(data, null, 2), "utf8")
  console.log("已导出:", filename)
  console.log(
    "统计:",
    `实体 ${data.entities.length}`,
    `文本 ${data.textEntries.length}`,
    `文本块 ${data.blocks.length}`,
    `链接 ${data.links.length}`,
    `关系 ${data.relations.length}`
  )
}

main()
