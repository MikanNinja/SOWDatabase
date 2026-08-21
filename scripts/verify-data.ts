import { getStore } from "../lib/db/store"
import { renderEntryBlocks, renderMarkdownContent } from "../lib/render"
import { computeLinkIssues } from "../lib/links"

async function main() {
  const store = await getStore()

  const entities = await store.listEntities({})
  const texts = await store.listTextEntries({})
  console.log("实体总数:", entities.length)
  console.log("文本总数:", texts.length)

  const shenyan = await store.findEntityCandidates("沈砚")
  const yeduzhe = await store.findEntityCandidates("夜渡者")
  console.log("按标准名解析[沈砚]:", shenyan.length, shenyan[0]?.label)
  console.log("按别名解析[夜渡者]:", yeduzhe.length, yeduzhe[0]?.label)

  const missing = await store.findEntityCandidates("未知人物")
  console.log("按不存在的名称解析[未知人物]:", missing.length, "(应为 0)")

  const textEntry = texts.find((t) => t.title === "旧港的黑衣旅人")
  if (!textEntry) throw new Error("未找到测试文本")
  const blocks = await store.getEntryBlocks(textEntry.id)
  console.log("T-001 文本块数:", blocks.length)
  const rendered = await renderEntryBlocks(store, blocks, { publicOnly: true })
  console.log("T-001 渲染段落数:", rendered.length)
  const hasCustomLink = rendered.some((b) => b.html.includes("那个穿黑衣服的人"))
  console.log("T-001 自定义显示文字链接渲染:", hasCustomLink)

  const issues = await computeLinkIssues(store, textEntry.body)
  console.log("T-001 链接问题数（应为 0）:", issues.length)

  const t3 = texts.find((t) => t.title === "北方灯塔守则")
  if (!t3) throw new Error("未找到草稿文本")
  const t3Issues = await computeLinkIssues(store, t3.body)
  console.log("T-003 链接问题数（应为 1：未知人物）:", t3Issues.length, t3Issues[0]?.target)

  const related = await store.getRelatedBlocksForEntity(shenyan[0].id)
  console.log("沈砚相关已发布文本条目数（应为 2）:", new Set(related.map((r) => r.entryId)).size)

  const introHtml = await renderMarkdownContent(store, "参见[[沈砚|黑衣人]]。", { publicOnly: true })
  console.log("实体简介渲染含自定义链接:", introHtml.includes("黑衣人"))

  console.log("\n验证完成。")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})