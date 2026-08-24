import type {
  ContentLink,
  ContentStatus,
  Entity,
  EntityFaction,
  EntityType,
  ExportData,
  LinkCandidate,
  PersonRelation,
  RelatedBlock,
  SaveTextResult,
  Settings,
  TextBlock,
  TextEntityAssociation,
  TextEntry,
} from "./types"

export interface ListEntitiesOpts {
  type?: EntityType
  status?: ContentStatus
  search?: string
  includeDeleted?: boolean
  deletedOnly?: boolean
}

export interface ListTextsOpts {
  category?: string
  sourceName?: string
  status?: ContentStatus
  search?: string
  includeDeleted?: boolean
  deletedOnly?: boolean
}

export interface FactionInput {
  factionId: string
  role?: string
}

export interface RelationInput {
  fromId: string
  toId: string
  kind: string
  reverseKind?: string
}

/** 关系记录 + 对端人物实体信息，用于双向展示 */
export interface RelationWithEntity {
  relation: PersonRelation
  /** 当前查看的人物是 from 还是 to */
  perspective: "from" | "to"
  /** 对端人物实体 */
  otherPerson: Entity
  /** 在当前视角下应显示的称呼 */
  label: string
  /** 是否为回退正向称呼（反向称呼为空时） */
  isReverseFallback: boolean
}

export interface TextAssociationInput {
  targetId: string
  note?: string
}

/** 整篇级关联的文本条目（用于实体页"长篇资料"区） */
export interface WholeEntryText {
  associationId: string
  entryId: string
  entrySlug: string
  entryTitle: string
  sourceCategory: string
  sourceName: string
  ingameLocation: string
  note: string
  ordinal: number
}

export interface EntityInput {
  slug?: string
  type: EntityType
  name: string
  intro?: string
  note?: string
  /** 人物专属：种族 */
  race?: string
  /** 地点/势力专属：上级实体 id */
  parentId?: string | null
  /** 人物专属：所属势力列表 */
  factions?: FactionInput[]
  status?: ContentStatus
  aliases?: string[]
  keepOldNameAsAlias?: boolean
}

export interface TextEntryInput {
  slug?: string
  title: string
  sourceCategory: string
  sourceName: string
  ingameLocation: string
  triggerCondition: string
  note: string
  body: string
  status: ContentStatus
}

export interface BlockWithLinks {
  block: TextBlock
  links: ContentLink[]
}

export interface Store {
  init(): Promise<void>

  getSettings(): Promise<Settings>
  updateSettings(settings: Settings): Promise<void>

  listEntities(opts: ListEntitiesOpts): Promise<Entity[]>
  getEntityById(id: string): Promise<Entity | null>
  getEntityBySlug(slug: string, opts?: { includeDraft?: boolean }): Promise<Entity | null>
  findEntityCandidates(name: string): Promise<LinkCandidate[]>
  searchEntitySuggestions(query: string): Promise<LinkCandidate[]>
  createEntity(input: EntityInput): Promise<Entity>
  updateEntity(id: string, input: EntityInput): Promise<Entity>
  deleteEntity(id: string): Promise<void>
  restoreEntity(id: string): Promise<void>
  getEntityCounts(status?: ContentStatus): Promise<Record<EntityType, number>>

  // v2：人物所属势力
  getEntityFactions(entityId: string): Promise<EntityFaction[]>
  // v2：势力成员（反向来自人物所属势力），返回人物 id 与角色/备注
  getFactionMembers(factionId: string): Promise<{ entity: Entity; role: string; ordinal: number }[]>
  // v2：层级——直接下级
  getEntityChildren(parentId: string, opts?: { status?: ContentStatus }): Promise<Entity[]>
  // v2：层级——祖先链（从直接父级到根），用于面包屑；草稿/已删除父级在公开页跳过
  getEntityAncestors(entityId: string, opts?: { publicOnly?: boolean }): Promise<Entity[]>
  // v2：层级——成环检测，返回 true 表示设置 parentId 会成环
  detectHierarchyCycle(entityId: string, candidateParentId: string): Promise<boolean>

  // v2：人物↔人物关系
  /** 获取人物的所有关系（双向聚合），返回含对端人物信息的结构 */
  getRelationsForPerson(personId: string): Promise<RelationWithEntity[]>
  /** 创建一条关系；校验双方均为人物且未删除 */
  createRelation(input: RelationInput): Promise<PersonRelation>
  /** 更新一条关系 */
  updateRelation(id: string, input: RelationInput): Promise<PersonRelation>
  /** 删除一条关系 */
  deleteRelation(id: string): Promise<void>
  /** 删除人物时清理其相关关系 */
  deleteRelationsForPerson(personId: string): Promise<void>

  // v2：整篇级关联（文本↔实体）
  /** 获取文本条目的整篇级关联列表 */
  getTextEntityAssociations(entryId: string): Promise<TextEntityAssociation[]>
  /** 设置文本条目的整篇级关联（全量替换） */
  setTextEntityAssociations(entryId: string, associations: TextAssociationInput[]): Promise<void>
  /** 获取对某实体有整篇级关联的已发布文本条目（用于实体页"长篇资料"区） */
  getWholeEntryTextsForEntity(entityId: string): Promise<WholeEntryText[]>
  /** 获取对某实体有整篇级关联的文本 entry id 集合（用于从"相关文本"中排除） */
  getWholeEntryIdsForEntity(entityId: string): Promise<Set<string>>

  listTextEntries(opts: ListTextsOpts): Promise<TextEntry[]>
  getTextEntryById(id: string): Promise<TextEntry | null>
  getTextEntryBySlug(slug: string, opts?: { includeDraft?: boolean }): Promise<TextEntry | null>
  findTextCandidates(title: string): Promise<LinkCandidate[]>
  listTextCategories(): Promise<string[]>
  saveTextEntry(id: string | null, input: TextEntryInput): Promise<SaveTextResult>
  deleteTextEntry(id: string): Promise<void>
  restoreTextEntry(id: string): Promise<void>

  getEntryBlocks(entryId: string): Promise<BlockWithLinks[]>
  setManualLinks(blockId: string, entityIds: string[]): Promise<void>
  batchAddManualLinks(entryId: string, entityIds: string[]): Promise<void>

  getRelatedBlocksForEntity(entityId: string): Promise<RelatedBlock[]>

  exportAll(): Promise<ExportData>
}

let cachedStore: Store | null = null

export async function getStore(): Promise<Store> {
  if (cachedStore) return cachedStore
  const backend = (process.env.DATA_BACKEND ?? "sqlite").toLowerCase()
  if (backend === "supabase") {
    const { SupabaseStore } = await import("./supabase")
    const store = new SupabaseStore()
    await store.init()
    cachedStore = store
    return store
  }
  const { SQLiteStore } = await import("./sqlite")
  const store = new SQLiteStore()
  await store.init()
  cachedStore = store
  return store
}
