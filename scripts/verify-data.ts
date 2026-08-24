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

  // ========== v2 验证 ==========

  // 场景 F：人物种族
  const shenyanEntity = await store.getEntityById(shenyan[0].id)
  console.log("\n--- v2 验证 ---")
  console.log("沈砚种族（应为 人族）:", shenyanEntity?.race)
  const tongtse = entities.find((e) => e.name === "铜舌")
  console.log("铜舌种族（应为 机关族）:", tongtse?.race)
  if (shenyanEntity?.race !== "人族") throw new Error("种族验证失败：沈砚")
  if (tongtse?.race !== "机关族") throw new Error("种族验证失败：铜舌")

  // 场景 G：所属势力与势力成员反向
  const shenyanFactions = await store.getEntityFactions(shenyan[0].id)
  console.log("沈砚所属势力数（应为 1）:", shenyanFactions.length, shenyanFactions[0] ? `→ ${shenyanFactions[0].factionId}` : "")
  const wudengEntity = entities.find((e) => e.name === "无灯会")!
  const wudengMembers = await store.getFactionMembers(wudengEntity.id)
  const wudengMemberNames = wudengMembers.map((m) => m.entity.name)
  console.log("无灯会成员（应含沈砚、闻霜）:", wudengMemberNames.join("、"))
  if (!wudengMemberNames.includes("沈砚") || !wudengMemberNames.includes("闻霜")) {
    throw new Error("势力成员反向验证失败")
  }
  const beijingdengweiEntity = entities.find((e) => e.name === "北境灯卫")!
  const beijingdengweiMembers = await store.getFactionMembers(beijingdengweiEntity.id)
  const beijingdengweiMemberNames = beijingdengweiMembers.map((m) => m.entity.name)
  console.log("北境灯卫成员（应含陆沉舟、铜舌）:", beijingdengweiMemberNames.join("、"))
  if (!beijingdengweiMemberNames.includes("陆沉舟") || !beijingdengweiMemberNames.includes("铜舌")) {
    throw new Error("势力成员反向验证失败：北境灯卫")
  }

  // 场景 H：人际关系双向展示
  // 规则：to 方页面显示 from + 正向称呼；from 方页面显示 to + 反向称呼（为空时回退正向并标注）
  const shenyanRelations = await store.getRelationsForPerson(shenyan[0].id)
  console.log("沈砚关系数（应为 2）:", shenyanRelations.length)
  const wenshuangRelation = shenyanRelations.find((r) => r.otherPerson.name === "闻霜")
  console.log("  沈砚看闻霜 称呼（应为 同僚）:", wenshuangRelation?.label)
  const luchenzhouRelation = shenyanRelations.find((r) => r.otherPerson.name === "陆沉舟")
  // 沈砚是 to，显示 from(陆沉舟) + 正向称呼 = 戒备对象
  console.log("  沈砚看陆沉舟 称呼（应为 戒备对象，perspective: to）:", luchenzhouRelation?.label, "perspective:", luchenzhouRelation?.perspective)
  if (wenshuangRelation?.label !== "同僚") throw new Error("关系对称验证失败")
  if (luchenzhouRelation?.label !== "戒备对象") throw new Error("关系正向称呼验证失败")

  const luchenzhou = entities.find((e) => e.name === "陆沉舟")!
  const luchenzhouRelations = await store.getRelationsForPerson(luchenzhou.id)
  console.log("陆沉舟关系数（应为 2）:", luchenzhouRelations.length)
  const shenyanFromLc = luchenzhouRelations.find((r) => r.otherPerson.name === "沈砚")
  // 陆沉舟是 from，显示 to(沈砚) + 反向称呼 = 可疑旅人
  console.log("  陆沉舟看沈砚 称呼（应为 可疑旅人，perspective: from）:", shenyanFromLc?.label, "perspective:", shenyanFromLc?.perspective)
  const tongtseFromLc = luchenzhouRelations.find((r) => r.otherPerson.name === "铜舌")
  // 陆沉舟是 from，显示 to(铜舌) + 反向称呼(空→回退正向) = 守护对象(反向)
  console.log("  陆沉舟看铜舌 称呼（应为 守护对象，isReverseFallback: true）:", tongtseFromLc?.label, "isReverseFallback:", tongtseFromLc?.isReverseFallback)
  if (shenyanFromLc?.label !== "可疑旅人") throw new Error("关系反向称呼验证失败")
  if (tongtseFromLc?.label !== "守护对象" || !tongtseFromLc?.isReverseFallback) {
    throw new Error("关系反向回退验证失败")
  }

  // 场景 I：地点/势力层级
  const jingjingEntity = entities.find((e) => e.name === "镜井")!
  const jingjingAncestors = await store.getEntityAncestors(jingjingEntity.id, { publicOnly: true })
  console.log("镜井祖先链（应为 白潮港）:", jingjingAncestors.map((a) => a.name).join(" › "))
  if (jingjingAncestors.length !== 1 || jingjingAncestors[0].name !== "白潮港") {
    throw new Error("地点层级验证失败")
  }
  const baichaogangEntity = entities.find((e) => e.name === "白潮港")!
  const baichaogangChildren = await store.getEntityChildren(baichaogangEntity.id, { status: "published" })
  console.log("白潮港下级（应含 镜井）:", baichaogangChildren.map((c) => c.name).join("、"))
  if (!baichaogangChildren.some((c) => c.name === "镜井")) {
    throw new Error("地点下级验证失败")
  }
  const cechazaxiaozuEntity = entities.find((e) => e.name === "测潮塔小组")!
  const cechazaxiaozuAncestors = await store.getEntityAncestors(cechazaxiaozuEntity.id, { publicOnly: true })
  console.log("测潮塔小组祖先链（应为 潮汐议会）:", cechazaxiaozuAncestors.map((a) => a.name).join(" › "))
  if (cechazaxiaozuAncestors.length !== 1 || cechazaxiaozuAncestors[0].name !== "潮汐议会") {
    throw new Error("势力层级验证失败")
  }

  // 成环检测：将白潮港的上级设为镜井（镜井是白潮港的后代）应检测到成环
  const cycleDetected = await store.detectHierarchyCycle(baichaogangEntity.id, jingjingEntity.id)
  console.log("成环检测：白潮港 → 镜井（应为 true）:", cycleDetected)
  if (!cycleDetected) throw new Error("成环检测失败")

  // 场景 J：整篇级关联
  const chaoxiyihuiEntity = entities.find((e) => e.name === "潮汐议会")!
  const wholeEntryTexts = await store.getWholeEntryTextsForEntity(chaoxiyihuiEntity.id)
  console.log("潮汐议会长篇资料数（应为 2）:", wholeEntryTexts.length, "→", wholeEntryTexts.map((t) => t.entryTitle).join("、"))
  if (wholeEntryTexts.length !== 2) throw new Error("整篇关联数量验证失败")

  const wholeEntryIds = await store.getWholeEntryIdsForEntity(chaoxiyihuiEntity.id)
  const t2Entry = texts.find((t) => t.title === "白潮港的测潮记录")!
  const t5Entry = texts.find((t) => t.title === "潮汐议会测潮条例")!
  console.log("T-002 在整篇关联集合中（应为 true）:", wholeEntryIds.has(t2Entry.id))
  console.log("T-005 在整篇关联集合中（应为 true）:", wholeEntryIds.has(t5Entry.id))
  if (!wholeEntryIds.has(t2Entry.id) || !wholeEntryIds.has(t5Entry.id)) {
    throw new Error("整篇关联集合验证失败")
  }

  // T-002 同时有段落级和整篇级关联 → 应从"相关文本"中排除
  const chaoxiyihuiRelated = await store.getRelatedBlocksForEntity(chaoxiyihuiEntity.id)
  const chaoxiyihuiRelatedFiltered = chaoxiyihuiRelated.filter((r) => !wholeEntryIds.has(r.entryId))
  console.log("潮汐议会相关文本（排除整篇后，不应含 T-002）:", chaoxiyihuiRelatedFiltered.map((r) => r.entryTitle).join("、"))
  if (chaoxiyihuiRelatedFiltered.some((r) => r.entryId === t2Entry.id)) {
    throw new Error("双关联折叠验证失败：T-002 应从相关文本中排除")
  }

  // 整篇关联读取
  const t5Assocs = await store.getTextEntityAssociations(t5Entry.id)
  console.log("T-005 整篇关联数（应为 1）:", t5Assocs.length)
  if (t5Assocs.length !== 1) throw new Error("T-005 整篇关联验证失败")

  // 导出验证
  const exportData = await store.exportAll()
  console.log("\n导出验证：")
  console.log("  schemaVersion（应为 2）:", exportData.schemaVersion)
  console.log("  factions 数（应为 5）:", exportData.factions.length)
  console.log("  relations 数（应为 3）:", exportData.relations.length)
  console.log("  textEntityAssociations 数（应为 2）:", exportData.textEntityAssociations.length)
  if (exportData.schemaVersion !== 2) throw new Error("导出 schemaVersion 验证失败")
  if (exportData.factions.length !== 5) throw new Error("导出 factions 验证失败")
  if (exportData.relations.length !== 3) throw new Error("导出 relations 验证失败")
  if (exportData.textEntityAssociations.length !== 2) throw new Error("导出 textEntityAssociations 验证失败")

  console.log("\n验证完成（含 v2 扩展）。")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})