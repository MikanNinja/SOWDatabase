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
  status: ContentStatus
  aliases: string[]
  createdAt: string
  updatedAt: string
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
