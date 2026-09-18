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

  const personNames = entities.filter((e) => e.type === "person").map((e) => e.name)
  console.log("人物拼音序（应为 阿澜、陆沉舟、沈砚、铜舌、闻霜）:", personNames.join("、"))
  if (personNames.join(",") !== "阿澜,陆沉舟,沈砚,铜舌,闻霜") {
    throw new Error("人物列表拼音序验证失败")
  }
  const textTitles = texts.filter((t) => t.status === "published").map((t) => t.title)
  console.log(
    "已发布文本拼音序（应为 白潮港的测潮记录、北方灯塔点火记录、潮汐议会测潮条例、灰烬台地的低语、旧港的黑衣旅人）:",
    textTitles.join("、")
  )
  if (
    textTitles.join(",") !==
    "白潮港的测潮记录,北方灯塔点火记录,潮汐议会测潮条例,灰烬台地的低语,旧港的黑衣旅人"
  ) {
    throw new Error("文本列表拼音序验证失败")
  }

  const textEntry = texts.find((t) => t.title === "旧港的黑衣旅人")
  if (!textEntry) throw new Error("未找到测试文本")
  const blocks = await store.getEntryBlocks(textEntry.id)
  console.log("T-001 文本块数:", blocks.length)
  const rendered = await renderEntryBlocks(store, blocks, { publicOnly: true })
  console.log("T-001 渲染段落数:", rendered.length)
  const hasCustomLink = rendered.some((b) => b.html.includes("那个穿黑衣服的人"))
  console.log("T-001 自定义显示文字链接渲染:", hasCustomLink)
  if (!hasCustomLink) throw new Error("自定义显示文字链接渲染失败")

  const aliasEntry = texts.find((t) => t.title === "白潮港的测潮记录")
  if (!aliasEntry) throw new Error("未找到别名测试文本")
  const aliasBlocks = await store.getEntryBlocks(aliasEntry.id)
  const aliasRendered = await renderEntryBlocks(store, aliasBlocks, { publicOnly: true })
  const aliasAnchor = `<a href="/entities/person/${shenyan[0].slug}" class="wiki-link">夜渡者</a>`
  const aliasAsTyped = aliasRendered.some((b) => b.html.includes(aliasAnchor))
  console.log("T-002 别名链接按原文渲染（应为 true）:", aliasAsTyped)
  if (!aliasAsTyped) throw new Error("别名渲染验证失败：[[夜渡者]] 应显示为“夜渡者”并链接到沈砚")
  if (aliasRendered.some((b) => b.html.includes(">沈砚</a>"))) {
    throw new Error("别名改写验证失败：渲染结果不应把别名替换为标准名“沈砚”")
  }

  const aliasStored = aliasBlocks.flatMap((b) => b.links).find((l) => l.raw === "[[夜渡者]]")
  console.log("T-002 别名链接落库显示文字（应为 夜渡者）:", aliasStored?.displayText)
  if (!aliasStored || aliasStored.displayText !== "夜渡者") {
    throw new Error("落库显示文字验证失败：displayText 应保存原文“夜渡者”")
  }

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

  const aliasIntroHtml = await renderMarkdownContent(store, "参见[[夜渡者]]。", { publicOnly: true })
  console.log("简介渲染别名按原文显示（应为 true）:", aliasIntroHtml.includes(">夜渡者</a>"))
  if (!aliasIntroHtml.includes(">夜渡者</a>")) {
    throw new Error("别名渲染验证失败：renderMarkdownContent 应按原文显示别名")
  }

  // ========== 钉定写法（[[名称@slug]]）显示文字回归：显示文字必须与原文一致，不得出现 @slug ==========

  const shenyanSlug = shenyan[0].slug
  const pinIntroHtml = await renderMarkdownContent(store, `参见[[沈砚@${shenyanSlug}]]。`, { publicOnly: true })
  console.log("钉定链接按名称部分渲染（应为 true）:", pinIntroHtml.includes(">沈砚</a>"))
  if (!pinIntroHtml.includes(">沈砚</a>")) {
    throw new Error("钉定显示文字验证失败：[[沈砚@slug]] 应显示为“沈砚”")
  }
  if (pinIntroHtml.includes("@")) {
    throw new Error("钉定显示文字验证失败：显示文字不应包含 @slug")
  }
  if (!pinIntroHtml.includes(`href="/entities/person/${shenyanSlug}"`)) {
    throw new Error("钉定显示文字验证失败：[[沈砚@slug]] 应链接到沈砚")
  }

  const pinDisplayHtml = await renderMarkdownContent(store, `参见[[沈砚@${shenyanSlug}|黑衣人]]。`, { publicOnly: true })
  console.log("钉定 + 显式显示文字优先（应为 true）:", pinDisplayHtml.includes(">黑衣人</a>"))
  if (!pinDisplayHtml.includes(">黑衣人</a>")) {
    throw new Error("钉定显示文字验证失败：显式 |显示文字 应优先")
  }

  const draftPinHtml = await renderMarkdownContent(store, `见[[文本:北方灯塔守则@${t3.slug}]]。`, { publicOnly: true })
  console.log("钉定草稿目标公开页降级显示名称部分（应为 true）:", draftPinHtml.includes("北方灯塔守则"))
  if (!draftPinHtml.includes("北方灯塔守则") || draftPinHtml.includes("wiki-link")) {
    throw new Error("钉定显示文字验证失败：草稿目标公开页应降级为名称部分纯文本")
  }
  if (draftPinHtml.includes("@")) {
    throw new Error("钉定显示文字验证失败：草稿降级显示不应包含 @slug")
  }

  // ========== v2 验证 ==========

  // 场景 F：人物种族 + 现状
  const shenyanEntity = await store.getEntityById(shenyan[0].id)
  console.log("\n--- v2 验证 ---")
  console.log("沈砚种族（应为 人族）:", shenyanEntity?.race)
  const tongtse = entities.find((e) => e.name === "铜舌")
  console.log("铜舌种族（应为 机关族）:", tongtse?.race)
  if (shenyanEntity?.race !== "人族") throw new Error("种族验证失败：沈砚")
  if (tongtse?.race !== "机关族") throw new Error("种族验证失败：铜舌")
  console.log("沈砚现状（应为 下落不明）:", shenyanEntity?.lifeStatus)
  if (shenyanEntity?.lifeStatus !== "下落不明") {
    throw new Error("人物现状字段验证失败：lifeStatus 应为“下落不明”")
  }

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
  console.log("  schemaVersion（应为 4）:", exportData.schemaVersion)
  console.log("  factions 数（应为 5）:", exportData.factions.length)
  console.log("  relations 数（应为 3）:", exportData.relations.length)
  console.log("  textEntityAssociations 数（应为 2）:", exportData.textEntityAssociations.length)
  console.log("  quests 数（应为 4）:", exportData.quests.length)
  console.log("  questCharacters 数（应为 7）:", exportData.questCharacters.length)
  if (exportData.schemaVersion !== 4) throw new Error("导出 schemaVersion 验证失败")
  if (exportData.factions.length !== 5) throw new Error("导出 factions 验证失败")
  if (exportData.relations.length !== 3) throw new Error("导出 relations 验证失败")
  if (exportData.textEntityAssociations.length !== 2) throw new Error("导出 textEntityAssociations 验证失败")
  if (exportData.quests.length !== 4) throw new Error("导出 quests 验证失败")
  if (exportData.questCharacters.length !== 7) throw new Error("导出 questCharacters 验证失败")

  // ========== 数据一致性：entity_factions 类型约束 ==========

  // 成员必须是人物、faction_id 必须是势力（脏行会表现为势力页混入非人物成员）
  const invalidMemberRows: string[] = []
  for (const f of entities.filter((e) => e.type === "faction")) {
    const members = await store.getFactionMembers(f.id)
    for (const m of members) {
      if (m.entity.type !== "person") {
        invalidMemberRows.push(`${f.name} 的成员「${m.entity.name}」类型为 ${m.entity.type}`)
      }
    }
  }
  const invalidTargetRows: string[] = []
  for (const e of entities) {
    const facs = await store.getEntityFactions(e.id)
    for (const ef of facs) {
      const target = await store.getEntityById(ef.factionId)
      if (!target || target.type !== "faction") {
        invalidTargetRows.push(`「${e.name}」的所属势力 ${ef.factionId} 不是有效势力实体`)
      }
    }
  }
  console.log("entity_factions 脏行（成员非人物）:", invalidMemberRows.length)
  console.log("entity_factions 脏行（目标非势力）:", invalidTargetRows.length)
  if (invalidMemberRows.length > 0 || invalidTargetRows.length > 0) {
    throw new Error(`entity_factions 类型一致性验证失败：\n${[...invalidMemberRows, ...invalidTargetRows].join("\n")}`)
  }

  // ========== v5 验证：任务为独立于实体与文本的第三种数据存在 ==========

  console.log("\n--- v5 验证 ---")

  const quests = await store.listQuests({})
  console.log("任务总数（应为 4）:", quests.length)
  if (quests.length !== 4) throw new Error("任务数量验证失败")

  // 场景 K：任务字段
  const huozhongQuest = quests.find((quest) => quest.name === "雾中的火种")
  if (!huozhongQuest) throw new Error("未找到任务“雾中的火种”")
  console.log(
    "雾中的火种（应为 main/第一篇章/进程二/排序 2）:",
    huozhongQuest.category, "/", huozhongQuest.chapter, "/", huozhongQuest.stage, "/", huozhongQuest.sortOrder
  )
  if (huozhongQuest.category !== "main") throw new Error("任务分类验证失败")
  if (huozhongQuest.chapter !== "第一篇章") throw new Error("任务篇章验证失败")
  if (huozhongQuest.stage !== "进程二") throw new Error("任务进程验证失败")
  if (huozhongQuest.sortOrder !== 2) throw new Error("任务排序验证失败：应为 2")
  const jingzhaoQuest = quests.find((quest) => quest.name === "镜井的月影")!
  if (jingzhaoQuest.category !== "personal" || jingzhaoQuest.sortOrder !== 1) {
    throw new Error("个人任务字段验证失败")
  }

  // 场景 L：任务出场人物（正向）
  const huozhongCharacters = await store.getQuestCharacters(huozhongQuest.id)
  console.log("雾中的火种出场人物数（应为 2）:", huozhongCharacters.length)
  const huozhongRoles = new Map(huozhongCharacters.map((c) => [c.personId, c.role]))
  const luchenzhouQuestRole = huozhongRoles.get(luchenzhou.id)
  const shenyanQuestRole = huozhongRoles.get(shenyan[0].id)
  console.log("  陆沉舟角色（应为 执行者）:", luchenzhouQuestRole)
  console.log("  沈砚角色（应为 线索人物）:", shenyanQuestRole)
  if (luchenzhouQuestRole !== "执行者") throw new Error("任务出场人物验证失败：陆沉舟")
  if (shenyanQuestRole !== "线索人物") throw new Error("任务出场人物验证失败：沈砚")

  // 场景 M：人物相关任务（反向）
  const wenshuangEntity = entities.find((e) => e.name === "闻霜")!
  const alanEntity = entities.find((e) => e.name === "阿澜")!
  const shenyanQuests = await store.getQuestsForPerson(shenyan[0].id)
  console.log("沈砚相关任务数（应为 2）:", shenyanQuests.length)
  const shenyanQuestNames = shenyanQuests.map((r) => r.quest.name)
  console.log("  相关任务列表:", shenyanQuestNames.join("、"))
  if (shenyanQuests.length !== 2) throw new Error("人物相关任务数量验证失败")
  if (!shenyanQuestNames.includes("雾中的火种") || !shenyanQuestNames.includes("镜井的月影")) {
    throw new Error("人物相关任务内容验证失败")
  }
  // 草稿任务也应返回（published 过滤由页面负责）
  const wenshuangQuests = await store.getQuestsForPerson(wenshuangEntity.id)
  console.log("闻霜相关任务数（应为 1，含草稿）:", wenshuangQuests.length)
  if (wenshuangQuests.length !== 1 || wenshuangQuests[0].quest.status !== "draft") {
    throw new Error("人物相关任务（草稿返回）验证失败")
  }
  // 排序：阿澜的两条任务应按分类固定序（个人 → 日常）
  const alanQuests = await store.getQuestsForPerson(alanEntity.id)
  const alanQuestNames = alanQuests.map((r) => r.quest.name)
  console.log("阿澜相关任务顺序（应为 镜井的月影、例行的潮信）:", alanQuestNames.join("、"))
  if (alanQuestNames.join(",") !== "镜井的月影,例行的潮信") {
    throw new Error("人物相关任务排序验证失败")
  }

  // 场景 N：任务不再参与实体名称解析（wiki 链接不支持指向任务）
  const questCandidates = await store.findEntityCandidates("雾中的火种")
  console.log("按标准名解析任务[雾中的火种]（应为 0）:", questCandidates.length)
  if (questCandidates.length !== 0) {
    throw new Error("任务不应再作为实体参与名称解析")
  }
  const questLinkHtml = await renderMarkdownContent(store, "参见[[雾中的火种]]。", { publicOnly: true })
  console.log("[[任务名]]渲染为纯文本（应为 true）:", !questLinkHtml.includes("wiki-link"))
  if (questLinkHtml.includes("wiki-link")) {
    throw new Error("任务名称链接应降级为纯文本")
  }
  if (!questLinkHtml.includes("雾中的火种")) {
    throw new Error("任务名称链接降级后应保留显示文字")
  }

  // 场景 N2：任务↔文本一对多（一个任务对应多篇完整文本）
  const huozhongTexts = await store.listTextEntries({ questId: huozhongQuest.id })
  console.log("雾中的火种所属文本数（应为 2）:", huozhongTexts.length)
  if (huozhongTexts.length !== 2) throw new Error("任务所属文本数量验证失败")
  const huozhongPublishedTexts = await store.listTextEntries({ questId: huozhongQuest.id, status: "published" })
  console.log("雾中的火种已发布所属文本（应为 北方灯塔点火记录）:", huozhongPublishedTexts.map((t) => t.title).join("、"))
  if (huozhongPublishedTexts.length !== 1 || huozhongPublishedTexts[0].title !== "北方灯塔点火记录") {
    throw new Error("任务所属文本（published 过滤）验证失败")
  }
  const t3Entry = texts.find((t) => t.title === "北方灯塔守则")!
  if (t3Entry.questId !== huozhongQuest.id) throw new Error("文本 questId 落库验证失败")

  // 任务列表排序：分类固定序（主线 → 个人 → 次要 → 日常）
  const questNameOrder = quests.map((quest) => quest.name)
  console.log("任务列表顺序（应为 雾中的火种、镜井的月影、未公开的委托、例行的潮信）:", questNameOrder.join("、"))
  if (questNameOrder.join(",") !== "雾中的火种,镜井的月影,未公开的委托,例行的潮信") {
    throw new Error("任务列表排序验证失败")
  }

  // 公开解析：已发布任务按 slug 命中，草稿任务隐形
  const publishedQuests = await store.listQuests({ status: "published" })
  if (publishedQuests.length !== 3) throw new Error("已发布任务数应为 3")
  const huozhongBySlug = await store.getQuestBySlug(huozhongQuest.slug)
  if (!huozhongBySlug || huozhongBySlug.id !== huozhongQuest.id) throw new Error("getQuestBySlug 失败")
  const draftQuest = quests.find((quest) => quest.name === "未公开的委托")!
  const draftBySlug = await store.getQuestBySlug(draftQuest.slug)
  if (draftBySlug) throw new Error("草稿任务公开解析应返回 null")

  // 场景 O：约束——任务标准名唯一 / 出场人物必须是人物 / 分类必须合法
  let dupThrew = false
  try {
    await store.createQuest({
      name: "雾中的火种",
      category: "main",
      status: "draft",
    })
  } catch {
    dupThrew = true
  }
  console.log("同名任务创建被拒绝（应为 true）:", dupThrew)
  if (!dupThrew) throw new Error("任务标准名唯一性验证失败")

  const factionEntity = entities.find((e) => e.name === "潮汐议会")!
  let badPersonThrew = false
  try {
    await store.createQuest({
      name: "非法关联的任务",
      category: "main",
      persons: [{ personId: factionEntity.id, role: "" }],
      status: "draft",
    })
  } catch {
    badPersonThrew = true
  }
  console.log("出场人物非人物被拒绝（应为 true）:", badPersonThrew)
  if (!badPersonThrew) throw new Error("任务出场人物类型校验失败")

  let badCategoryThrew = false
  try {
    await store.createQuest({
      name: "非法分类的任务",
      category: "unknown",
      status: "draft",
    })
  } catch {
    badCategoryThrew = true
  }
  console.log("非法任务分类被拒绝（应为 true）:", badCategoryThrew)
  if (!badCategoryThrew) throw new Error("任务分类校验失败")

  // 场景 P：非法创建失败后不应留下脏行（全量替换语义）
  const finalQuestCount = await store.listQuests({})
  console.log("任务总数（应为 4）:", finalQuestCount.length)
  if (finalQuestCount.length !== 4) throw new Error("任务数量验证失败")

  console.log("\n验证完成（含 v2/v5 扩展）。")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})