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
  status: ContentStatus
  aliases: string[]
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

/** 整篇级关联（v2 新增）：文本条目↔实体 */
export interface TextEntityAssociation {
  id: string
  /** 所属文本条目 id */
  entryId: string
  /** 目标实体 id（人物/地点/势力） */
  targetId: string
  /** 备注，可留空 */
  note: string
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
  triggerCondition: string
  note: string
  body: string
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
  textEntries: TextEntry[]
  blocks: TextBlock[]
  links: ContentLink[]
  /** v2 新增：人物所属势力关联 */
  factions: EntityFaction[]
  /** v2 新增：人物关系 */
  relations: PersonRelation[]
  /** v2 新增：整篇级关联 */
  textEntityAssociations: TextEntityAssociation[]
}