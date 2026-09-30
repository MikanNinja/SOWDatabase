export type EntityType = "person" | "place" | "faction"
export type ContentStatus = "draft" | "published"
export type BlockKind = "paragraph" | "heading" | "quote" | "list" | "other"
export type LinkSource = "inline" | "manual"

export const ENTITY_TYPES: EntityType[] = ["person", "place", "faction"]

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: "人物",
  place: "地点",
  faction: "势力",
}

/** 任务分类（封闭集合，存储机器键，展示用标签映射） */
export type QuestCategory = "main" | "personal" | "major" | "minor" | "daily" | "event"

export const QUEST_CATEGORIES: QuestCategory[] = [
  "main",
  "personal",
  "major",
  "minor",
  "daily",
  "event",
]

export const QUEST_CATEGORY_LABELS: Record<QuestCategory, string> = {
  main: "主线任务",
  personal: "个人任务",
  major: "重要任务",
  minor: "次要任务",
  daily: "日常任务",
  event: "活动任务",
}

export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "草稿",
  published: "已发布",
}

/**
 * 人物分级（封闭三级枚举，仅 person 类型可赋值；存储机器键，展示用标签映射）。
 * 未分级的人物存空串，不进入人物列表置顶分组，留在主拼音索引区。
 * 语义：分级是"编辑选出的浏览优先级"，与任务数、文本数等派生量无关；
 * 主要人物：可操控角色、主要反派等；次要人物：有一定出场率的NPC；
 * 背景人物：出场极少但格外值得注意的人物。
 */
export type PersonProminence = "major" | "minor" | "background"

/** 人物分级的固定展示顺序（主要 → 次要 → 背景），未分级恒定垫底 */
export const PERSON_PROMINENCES: PersonProminence[] = ["major", "minor", "background"]

export const PERSON_PROMINENCE_LABELS: Record<PersonProminence, string> = {
  major: "主要人物",
  minor: "次要人物",
  background: "背景人物",
}

/** 值是否为合法的人物分级机器键 */
export function isPersonProminence(value: string | undefined | null): value is PersonProminence {
  return typeof value === "string" && (PERSON_PROMINENCES as string[]).includes(value)
}

/** 非法/未分级返回空串，合法键返回标签 */
export function personProminenceLabel(value: string | undefined | null): string {
  return isPersonProminence(value) ? PERSON_PROMINENCE_LABELS[value] : ""
}

/** 人物分级在公开人物列表中的展示序（主要 → 次要 → 背景 → 未分级垫底），未知值视同未分级 */
export function personProminenceRank(value: string | undefined | null): number {
  const idx = PERSON_PROMINENCES.indexOf((value ?? "") as PersonProminence)
  return idx === -1 ? PERSON_PROMINENCES.length : idx
}

/**
 * 势力类型（封闭四类枚举，仅 faction 类型可赋值；存储机器键，展示用标签映射）。
 * 语义为"本体标注"（该势力本质上是什么），与层级无关：不参与 parent 树、不进选择器约束、
 * 不参与链接解析；当前唯一消费点是结构总览页的"独立势力"分区分组。
 * 未分类存空串。国家/政权、企业/商社、帮派/佣兵、组织/机构。
 */
export type FactionKind = "nation" | "enterprise" | "gang" | "org"

/** 势力类型的固定展示顺序（国家 → 企业 → 帮派 → 组织），未分类恒定垫底 */
export const FACTION_KINDS: FactionKind[] = ["nation", "enterprise", "gang", "org"]

export const FACTION_KIND_LABELS: Record<FactionKind, string> = {
  nation: "国家/政权",
  enterprise: "企业/商社",
  gang: "帮派/佣兵",
  org: "组织/机构",
}

/** 值是否为合法的势力类型机器键 */
export function isFactionKind(value: string | undefined | null): value is FactionKind {
  return typeof value === "string" && (FACTION_KINDS as string[]).includes(value)
}

/** 非法/未分类返回空串，合法键返回标签 */
export function factionKindLabel(value: string | undefined | null): string {
  return isFactionKind(value) ? FACTION_KIND_LABELS[value] : ""
}

export interface Entity {
  id: string
  slug: string
  type: EntityType
  name: string
  intro: string
  note: string
  /** 人物专属：种族（单值自由文字，可留空） */
  race?: string
  /** 地点/势力专属：上级实体的稳定标识，单值，构成单父树 */
  parentId?: string | null
  /** 人物专属：出生年（架空纪年，可空） */
  birthYear?: number | null
  /** 人物专属：出生月 1–12（可空） */
  birthMonth?: number | null
  /** 人物专属：出生日 1–31（可空） */
  birthDay?: number | null
  /** 人物专属：出生日期是否为约数 */
  birthCirca?: boolean
  /** 人物专属：死亡年（可空） */
  deathYear?: number | null
  /** 人物专属：死亡月 1–12（可空） */
  deathMonth?: number | null
  /** 人物专属：死亡日 1–31（可空） */
  deathDay?: number | null
  /** 人物专属：死亡日期是否为约数 */
  deathCirca?: boolean
  /** 人物专属：出生于——关联地点实体 id（可空） */
  birthPlaceId?: string | null
  /** 人物专属：出生于——自由文本兜底（关联不上地点实体时） */
  birthPlaceFree?: string
  /** 人物专属：死亡于——关联地点实体 id（可空） */
  deathPlaceId?: string | null
  /** 人物专属：死亡于——自由文本兜底（关联不上地点实体时） */
  deathPlaceFree?: string
  /** 人物专属：现状（生死状况，自由文本，可留空） */
  lifeStatus?: string
  /** 人物专属：分级（封闭三级枚举的机器键；空串=未分级；非人物类型在写入层强制清空） */
  prominence?: string
  /** 势力专属：类型（封闭四类枚举的机器键；空串=未分类；非势力类型在写入层强制清空） */
  factionKind?: string
  /** 地点专属：辖区势力引用（对势力实体的软引用，可空；非地点类型在写入层强制清空） */
  territoryFactionId?: string | null
  /** 人物详情页"相关任务"是否默认折叠（用于主角团等任务数量极多的人物） */
  collapseRelatedQuests?: boolean
  status: ContentStatus
  aliases: string[]
  createdAt: string
  updatedAt: string
}

/**
 * 结构总览树节点（地点/势力层级；不含 type——两棵树按类型分节返回）。
 * 展示树形态："单链至叶"的链压缩为一行——链首节点 children 为空、chain 依序携带后续节点；
 * 链尾有分叉的整链不压缩，保持 children 结构。
 */
export interface EntityTreeNode {
  id: string
  slug: string
  name: string
  children: EntityTreeNode[]
  /** 单链至叶压缩：链首节点沿 chain 依序携带后续节点（各节点 children 均为空） */
  chain?: EntityTreeNode[]
  /** 势力类型标注（仅势力节点携带原始值，地点节点恒为空；分区消费） */
  factionKind?: string
  /** 地点辖区（store 解析后的有效引用：仅当引用目标为节点集合内的已发布势力时携带；悬空/未标注则缺省） */
  territory?: { id: string; name: string }
}

/**
 * 任务（v5：独立于实体与文本的第三种数据存在）。
 * 任务不参与 wiki 链接引用与实体层级，只通过「出场人物」关联人物、
 * 通过 text_entries.quest_id 一对多关联文本。
 */
export interface Quest {
  id: string
  slug: string
  name: string
  /** 任务分类（机器键，展示用标签映射 QUEST_CATEGORY_LABELS） */
  category: QuestCategory
  /** 篇章（自由文字，可留空） */
  chapter: string
  /** 进程（自由文字，主要主线任务使用，可留空） */
  stage: string
  /** 同分类内展示排序（可空；空值按名称拼音兜底） */
  sortOrder: number | null
  /** 补充说明（支持受限 Markdown，可留空） */
  note: string
  status: ContentStatus
  createdAt: string
  updatedAt: string
}

/** 人物所属势力关联（v2 新增） */
export interface EntityFaction {
  id: string
  /** 人物实体 id */
  entityId: string
  /** 势力实体 id */
  factionId: string
  /** 角色/备注，如“长老”“卧底”“前任成员”，可留空 */
  role: string
  /** 展示排序 */
  ordinal: number
}

/** 人物↔人物有向关系（v2 新增） */
export interface PersonRelation {
  id: string
  /** 关系主体（发起方）人物 id */
  fromId: string
  /** 关系客体（承受方）人物 id */
  toId: string
  /** from 对 to 的关系称呼，自由文字 */
  kind: string
  /** to 对 from 的关系称呼，可留空；为空时回退为 kind 并标注“（反向）” */
  reverseKind: string
  /** 展示排序 */
  ordinal: number
  createdAt: string
}

/** 任务↔人物关联：任务中出场的人物（v5：quest_id 指向 quests 表） */
export interface QuestCharacter {
  id: string
  /** 任务 id */
  questId: string
  /** 人物实体 id */
  personId: string
  /** 角色/备注，如“委托人”“队友”“目标”，可留空 */
  role: string
  /** 展示排序 */
  ordinal: number
}

/** 人物相关任务（反向视图：任务 + 该人物在任务中的角色/备注） */
export interface QuestPersonRef {
  /** 任务 */
  quest: Quest
  /** 该人物在任务中的角色/备注，可空 */
  role: string
  /** 展示排序 */
  ordinal: number
}

/** 整篇级关联（v2 新增）：文本条目↔实体 */
export interface TextEntityAssociation {
  id: string
  /** 所属文本条目 id */
  entryId: string
  /** 目标实体 id（人物/地点/势力） */
  targetId: string
  /** 展示排序 */
  ordinal: number
}

export interface TextEntry {
  id: string
  slug: string
  title: string
  sourceCategory: string
  sourceName: string
  ingameLocation: string
  note: string
  body: string
  /** 所属任务 id（v5 新增，可空；一对多：一个任务对应多篇文本） */
  questId?: string | null
  status: ContentStatus
  createdAt: string
  updatedAt: string
}

export interface TextBlock {
  id: string
  entryId: string
  ordinal: number
  kind: BlockKind
  content: string
}

export interface ContentLink {
  id: string
  blockId: string
  targetKind: "entity" | "text"
  targetId: string
  source: LinkSource
  displayText: string
  raw: string
}

export interface RelatedBlock {
  blockId: string
  blockOrdinal: number
  blockContent: string
  entryId: string
  entrySlug: string
  entryTitle: string
  sourceCategory: string
  sourceName: string
  ingameLocation: string
  linkRaw: string
  displayText: string
}

export interface LinkCandidate {
  kind: "entity" | "text"
  id: string
  slug: string
  label: string
  type?: EntityType
  status: ContentStatus
}

export interface LinkIssue {
  raw: string
  target: string
  reason: "invalid" | "not_found" | "ambiguous"
  candidates: LinkCandidate[]
}

export interface LinkResolutionResult {
  ok: boolean
  href: string
  display: string
  raw: string
  target: string
}

export interface Settings {
  siteName: string
  siteDescription: string
  /** 导航栏副标题（品牌名右侧的小字），可在后台修改，默认“资料索引”。 */
  navLabel: string
  /** 页脚文字，可在后台修改，默认“内容公开可读，仅由站点拥有者维护。”。 */
  footerText: string
}

export interface SaveTextResult {
  entry: TextEntry
  issues: LinkIssue[]
  carriedOverManualLinks: number
  droppedManualLinks: number
}

export interface ExportData {
  schemaVersion: number
  exportedAt: string
  settings: Settings
  entities: Entity[]
  /** v5 新增：任务（独立于实体） */
  quests: Quest[]
  textEntries: TextEntry[]
  blocks: TextBlock[]
  links: ContentLink[]
  /** v2 新增：人物所属势力关联 */
  factions: EntityFaction[]
  /** v2 新增：人物关系 */
  relations: PersonRelation[]
  /** v2 新增：整篇级关联 */
  textEntityAssociations: TextEntityAssociation[]
  /** v4 新增：任务↔人物关联 */
  questCharacters: QuestCharacter[]
}
