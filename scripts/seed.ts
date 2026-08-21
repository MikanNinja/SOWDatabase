import Database from "better-sqlite3"
import { getStore } from "../lib/db/store"

async function clearData(): Promise<void> {
  const path = process.env.SQLITE_PATH || "data/app.db"
  const db = new Database(path)
  db.pragma("foreign_keys = OFF")
  db.exec("DELETE FROM content_links; DELETE FROM text_blocks; DELETE FROM text_entries; DELETE FROM entity_aliases; DELETE FROM entities; DELETE FROM settings;")
  db.pragma("foreign_keys = ON")
  db.close()
}

async function main() {
  const store = await getStore()
  await clearData()

  await store.updateSettings({
    siteName: "雾海边境资料库",
    siteDescription: "《雾海边境》中文人物、地点、势力资料库（虚构测试数据）",
  })

  // 人物
  const shenyan = await store.createEntity({
    type: "person",
    name: "沈砚",
    aliases: ["夜渡者"],
    intro: "经常在雾潮最浓的夜晚出现在旧港附近的神秘旅人。",
    note: "部分文本只使用“那个穿黑衣服的人”指代他，该称呼不是别名。",
    status: "published",
  })
  const alan = await store.createEntity({
    type: "person",
    name: "阿澜",
    aliases: ["潮歌者"],
    intro: "白潮港的测潮师，负责记录每天的雾潮方向。",
    note: "她的公开记录常常以工作日志形式出现。",
    status: "published",
  })
  const luchenzhou = await store.createEntity({
    type: "person",
    name: "陆沉舟",
    aliases: [],
    intro: "一名负责守护北方灯塔的年轻守卫。",
    note: "他的姓氏在早期记录中曾被误写为“陆沉州”，该错误不作为正式别名。",
    status: "published",
  })
  const wenshuang = await store.createEntity({
    type: "person",
    name: "闻霜",
    aliases: ["霜鸦"],
    intro: "无灯会派驻在灰烬台地的联络人。",
    note: "她很少在公开文本中直接说出自己的名字。",
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
  const jingjing = await store.createEntity({
    type: "place",
    name: "镜井",
    aliases: ["月镜井"],
    intro: "白潮港内一口能够映出远方灯火的古井。",
    note: "探索文本通常不会直接说明它的正式名称。",
    status: "published",
  })

  // 势力
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
  await store.createEntity({
    type: "faction",
    name: "北境灯卫",
    aliases: ["灯卫"],
    intro: "负责巡查北方灯塔和维护航标的守卫组织。",
    note: "早期文本中也会使用“守塔人”这一普通称呼，但不将其建立为别名。",
    status: "published",
  })

  // 文本
  const t1 = await store.saveTextEntry(null, {
    title: "旧港的黑衣旅人",
    sourceCategory: "世界探索",
    sourceName: "白潮港",
    ingameLocation: "白潮港西侧栈桥，第一次进入港口后的夜晚，调查尽头的湿脚印",
    triggerCondition: "夜间进入西侧栈桥",
    note: "",
    body: `栈桥尽头留着一串没有被潮水冲散的湿脚印。

守船人说，昨夜他看见[[沈砚|那个穿黑衣服的人]]站在雾里，手里提着一盏没有火焰的灯。

如果你想知道更多，可以查阅[[文本:白潮港的测潮记录|阿澜的测潮记录]]。`,
    status: "published",
  })

  const t2 = await store.saveTextEntry(null, {
    title: "白潮港的测潮记录",
    sourceCategory: "角色信息",
    sourceName: "阿澜",
    ingameLocation: "白潮港测潮塔二层，阿澜的工作日志，第三页",
    triggerCondition: "取得测潮塔钥匙后阅读日志",
    note: "",
    body: `第七日，雾潮比往常提前了两个时辰。

我在旧港看见[[夜渡者]]，但他没有回应我的招呼。

那个人似乎在寻找[[镜井]]，也可能只是想避开[[潮汐议会]]的巡查。`,
    status: "published",
  })

  const t3 = await store.saveTextEntry(null, {
    title: "北方灯塔守则",
    sourceCategory: "主线任务",
    sourceName: "北方灯塔",
    ingameLocation: "灰烬台地北侧灯塔入口，任务“雾中的火种”开始后阅读木牌",
    triggerCondition: "接受任务“雾中的火种”",
    note: "",
    body: `第一条：雾火熄灭后，任何人不得独自进入灯塔底层。

第二条：如遇黑衣旅人，请将灯芯交给[[陆沉舟]]，不要交给[[未知人物|那位没有影子的人]]。`,
    status: "draft",
  })

  const t4 = await store.saveTextEntry(null, {
    title: "灰烬台地的低语",
    sourceCategory: "世界探索",
    sourceName: "灰烬台地",
    ingameLocation: "灰烬台地东南坡，倒塌灯塔后的黑色石板",
    triggerCondition: "获得“碎裂的灯芯”后调查石板",
    note: "",
    body: `石板上只剩下半句话：

“当[[闻霜|那个来自无灯会的人]]敲响第三次钟声，镜井里的月亮就会沉下去。”`,
    status: "published",
  })

  console.log("种子数据已写入。")
  console.log(`- 实体：10 个（人物 4、地点 3、势力 3）`)
  console.log(`- 文本条目：4 条（T-001 已发布，T-002 已发布，T-003 草稿，T-004 已发布）`)
  console.log(`- T-001 内联链接：沈砚（显示文字“那个穿黑衣服的人”）+ 文本“白潮港的测潮记录”`)
  console.log(`- T-002 内联链接：夜渡者→沈砚、镜井、潮汐议会`)
  console.log(`- T-003 未解析链接：未知人物（应产生警告）`)
  console.log(`- T-004 内联链接：闻霜（显示文字“那个来自无灯会的人”）`)
  console.log(`- 实体反向关联：沈砚应出现在 T-001 与 T-002 中`)

  void shenyan
  void alan
  void luchenzhou
  void wenshuang
  void baichaogang
  void jingjing
  void chaoxiyihui
  void wudeng
  void t1
  void t2
  void t3
  void t4
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})