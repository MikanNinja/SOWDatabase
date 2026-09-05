import Database from "better-sqlite3"
import { getStore } from "../lib/db/store"

async function clearData(): Promise<void> {
  const path = process.env.SQLITE_PATH || "data/app.db"
  const db = new Database(path)
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
  db.pragma("foreign_keys = ON")
  db.close()
}

async function main() {
  const store = await getStore()
  await clearData()

  await store.updateSettings({
    siteName: "雾海边境资料库",
    siteDescription: "《雾海边境》中文人物、地点、势力资料库（虚构测试数据）",
    navLabel: "资料索引",
    footerText: "内容公开可读，仅由站点拥有者维护。",
  })

  // 势力（先创建，便于人物引用）
  const chaoxiyihui = await store.createEntity({
    type: "faction",
    name: "潮汐议会",
    aliases: ["议会"],
    intro: "管理白潮港航道和测潮记录的地方组织。",
    note: "部分 NPC 对话只称其为“议会”。",
    status: "published",
  })
  const wudeng = await store.createEntity({
    type: "faction",
    name: "无灯会",
    aliases: [],
    intro: "在雾海中活动的秘密组织，反对重新点燃古代灯塔。",
    note: "其成员通常避免在公开场合留下完整姓名。",
    status: "published",
  })
  const beijingdengwei = await store.createEntity({
    type: "faction",
    name: "北境灯卫",
    aliases: ["灯卫"],
    intro: "负责巡查北方灯塔和维护航标的守卫组织。",
    note: "早期文本中也会使用“守塔人”这一普通称呼，但不将其建立为别名。",
    status: "published",
  })
  // v2：测潮塔小组（潮汐议会的子势力）
  const cechazaxiaozu = await store.createEntity({
    type: "faction",
    name: "测潮塔小组",
    aliases: [],
    intro: "潮汐议会下设的测潮专门小组，负责维护测潮塔与日志。",
    note: "v2 测试：势力层级——上级为潮汐议会。",
    parentId: chaoxiyihui.id,
    status: "published",
  })

  // 地点
  const baichaogang = await store.createEntity({
    type: "place",
    name: "白潮港",
    aliases: ["旧港"],
    intro: "雾海边境最大的贸易港，也是多数旅人进入群岛的地方。",
    note: "文本中“港口”有时泛指白潮港，但不是正式别名。",
    status: "published",
  })
  await store.createEntity({
    type: "place",
    name: "灰烬台地",
    aliases: [],
    intro: "位于群岛北侧的黑色高地，旧灯塔遗迹散布其中。",
    note: "夜间会出现持续数小时的低空雾火。",
    status: "published",
  })
  // v2：镜井的上级为白潮港
  const jingjing = await store.createEntity({
    type: "place",
    name: "镜井",
    aliases: ["月镜井"],
    intro: "白潮港内一口能够映出远方灯火的古井。",
    note: "探索文本通常不会直接说明它的正式名称。v2 测试：地点层级——上级为白潮港。",
    parentId: baichaogang.id,
    status: "published",
  })

  // 人物（v2：带种族与所属势力）
  const shenyan = await store.createEntity({
    type: "person",
    name: "沈砚",
    aliases: ["夜渡者"],
    intro: "经常在雾潮最浓的夜晚出现在旧港附近的神秘旅人。",
    note: "部分文本只使用“那个穿黑衣服的人”指代他，该称呼不是别名。",
    race: "人族",
    factions: [{ factionId: wudeng.id, role: "外围联络人" }],
    status: "published",
  })
  const alan = await store.createEntity({
    type: "person",
    name: "阿澜",
    aliases: ["潮歌者"],
    intro: "白潮港的测潮师，负责记录每天的雾潮方向。",
    note: "她的公开记录常常以工作日志形式出现。",
    race: "人族",
    factions: [{ factionId: chaoxiyihui.id, role: "测潮师" }],
    status: "published",
  })
  const luchenzhou = await store.createEntity({
    type: "person",
    name: "陆沉舟",
    aliases: [],
    intro: "一名负责守护北方灯塔的年轻守卫。",
    note: "他的姓氏在早期记录中曾被误写为“陆沉州”，该错误不作为正式别名。",
    race: "人族",
    factions: [{ factionId: beijingdengwei.id, role: "灯塔守卫" }],
    status: "published",
  })
  const wenshuang = await store.createEntity({
    type: "person",
    name: "闻霜",
    aliases: ["霜鸦"],
    intro: "无灯会派驻在灰烬台地的联络人。",
    note: "她很少在公开文本中直接说出自己的名字。",
    race: "人族",
    factions: [{ factionId: wudeng.id, role: "灰烬台地联络人" }],
    status: "published",
  })
  // v2：铜舌（机关族人物，展示非人族种族）
  const tongtse = await store.createEntity({
    type: "person",
    name: "铜舌",
    aliases: ["古铜守卫"],
    intro: "北方灯塔底层残留的古代机关守卫，仍以铜制舌片发出指令。",
    note: "v2 测试：机关族种族 + 北境灯卫成员。",
    race: "机关族",
    factions: [{ factionId: beijingdengwei.id, role: "古代机关守卫" }],
    status: "published",
  })

  // 文本
  const t1 = await store.saveTextEntry(null, {
    title: "旧港的黑衣旅人",
    sourceCategory: "描述文本",
    sourceName: "白潮港",
    ingameLocation: "白潮港西侧栈桥，第一次进入港口后的夜晚，调查尽头的湿脚印",
    note: "",
    body: `栈桥尽头留着一串没有被潮水冲散的湿脚印。

守船人说，昨夜他看见[[沈砚|那个穿黑衣服的人]]站在雾里，手里提着一盏没有火焰的灯。

如果你想知道更多，可以查阅[[文本:白潮港的测潮记录|阿澜的测潮记录]]。`,
    status: "published",
  })

  const t2 = await store.saveTextEntry(null, {
    title: "白潮港的测潮记录",
    sourceCategory: "角色对话",
    sourceName: "阿澜",
    ingameLocation: "白潮港测潮塔二层，阿澜的工作日志，第三页",
    note: "",
    body: `第七日，雾潮比往常提前了两个时辰。

我在旧港看见[[夜渡者]]，但他没有回应我的招呼。

那个人似乎在寻找[[镜井]]，也可能只是想避开[[潮汐议会]]的巡查。`,
    status: "published",
  })

  const t3 = await store.saveTextEntry(null, {
    title: "北方灯塔守则",
    sourceCategory: "档案资料",
    sourceName: "北方灯塔",
    ingameLocation: "灰烬台地北侧灯塔入口，任务“雾中的火种”开始后阅读木牌",
    note: "",
    body: `第一条：雾火熄灭后，任何人不得独自进入灯塔底层。

第二条：如遇黑衣旅人，请将灯芯交给[[陆沉舟]]，不要交给[[未知人物|那位没有影子的人]]。`,
    status: "draft",
  })

  const t4 = await store.saveTextEntry(null, {
    title: "灰烬台地的低语",
    sourceCategory: "地图气泡",
    sourceName: "灰烬台地",
    ingameLocation: "灰烬台地东南坡，倒塌灯塔后的黑色石板",
    note: "",
    body: `石板上只剩下半句话：

“当[[闻霜|那个来自无灯会的人]]敲响第三次钟声，镜井里的月亮就会沉下去。”`,
    status: "published",
  })

  // v2：T-005 测潮条例（长文本，整篇关联到潮汐议会，无段落级关联）
  const t5 = await store.saveTextEntry(null, {
    title: "潮汐议会测潮条例",
    sourceCategory: "邮件",
    sourceName: "潮汐议会",
    ingameLocation: "白潮港测潮塔一层公告板，进入测潮塔后可阅读",
    note: "v2 测试：整篇关联——整篇关联到潮汐议会，无段落级 [[...]] 链接。",
    body: `第一条：所有测潮师须于每日卯时与酉时各记录一次雾潮方向与浓度。

第二条：雾潮浓度超过常值两倍时，立即关闭港口栈桥并升起警示灯。

第三条：测潮记录须妥善保存于测潮塔二层，非议会成员不得翻阅原始日志。

第四条：如遇无灯会活动迹象，须在记录中加注并通报议会值日官。`,
    status: "published",
  })

  // v2：人际关系
  // 沈砚 ↔ 闻霜：同僚（对称称呼）
  await store.createRelation({
    fromId: shenyan.id,
    toId: wenshuang.id,
    kind: "同僚",
    reverseKind: "同僚",
  })
  // 陆沉舟 → 沈砚：戒备对象 / 可疑旅人（不对称称呼）
  await store.createRelation({
    fromId: luchenzhou.id,
    toId: shenyan.id,
    kind: "戒备对象",
    reverseKind: "可疑旅人",
  })
  // 陆沉舟 → 铜舌：守护对象 / (空)（反向为空，展示回退标注）
  await store.createRelation({
    fromId: luchenzhou.id,
    toId: tongtse.id,
    kind: "守护对象",
    reverseKind: "",
  })

  // v2：整篇级关联
  // T-005 测潮条例 → 潮汐议会（仅整篇关联，无段落级关联）
  await store.setTextEntityAssociations(t5.entry.id, [
    { targetId: chaoxiyihui.id },
  ])
  // T-002 测潮记录 → 潮汐议会（同时有段落级关联和整篇关联，展示折叠）
  await store.setTextEntityAssociations(t2.entry.id, [
    { targetId: chaoxiyihui.id },
  ])

  console.log("种子数据已写入（含 v2 扩展）。")
  console.log(`- 实体：12 个（人物 5、地点 3、势力 4）`)
  console.log(`  - 人物种族：4 人族 + 1 机关族（铜舌）`)
  console.log(`  - 所属势力：每人物带角色/备注`)
  console.log(`  - 地点层级：镜井 → 白潮港`)
  console.log(`  - 势力层级：测潮塔小组 → 潮汐议会`)
  console.log(`- 文本条目：5 条（T-001~T-004 同 v1，T-005 测潮条例）`)
  console.log(`- 人际关系：3 条`)
  console.log(`  - 沈砚 ↔ 闻霜：同僚（对称）`)
  console.log(`  - 陆沉舟 → 沈砚：戒备对象 / 可疑旅人（不对称）`)
  console.log(`  - 陆沉舟 → 铜舌：守护对象 / (空)（反向回退标注）`)
  console.log(`- 整篇级关联：2 条`)
  console.log(`  - T-005 → 潮汐议会（仅整篇关联）`)
  console.log(`  - T-002 → 潮汐议会（整篇 + 段落双关联，展示折叠）`)

  void cechazaxiaozu
  void jingjing
  void alan
  void tongtse
  void t1
  void t2
  void t3
  void t4
  void t5
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})