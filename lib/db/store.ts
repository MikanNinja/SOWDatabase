import type {
  ContentLink,
  ContentStatus,
  Entity,
  EntityFaction,
  EntityType,
  ExportData,
  LinkCandidate,
  PersonRelation,
  Quest,
  QuestCharacter,
  QuestPersonRef,
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

export interface ListQuestsOpts {
  status?: ContentStatus
  includeDeleted?: boolean
  deletedOnly?: boolean
}

export interface ListTextsOpts {
  category?: string
  sourceName?: string
  status?: ContentStatus
  /** 按所属任务过滤（v5：text_entries.quest_id） */
  questId?: string
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

/** 任务↔人物关联的写入项 */
export interface QuestPersonInput {
  personId: string
  role?: string
}

/** 任务写入项（v5：任务为独立数据存在） */
export interface QuestInput {
  slug?: string
  name: string
  /** 任务分类（机器键，非法值抛错） */
  category?: string
  /** 篇章（自由文字） */
  chapter?: string
  /** 进程（自由文字） */
  stage?: string
  /** 同分类内展示排序（可空） */
  sortOrder?: number | null
  /** 补充说明（支持受限 Markdown） */
  note?: string
  status?: ContentStatus
  /** 出场人物列表（保存时全量替换） */
  persons?: QuestPersonInput[]
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
  /** 人物专属：出生年/月/日与约数 */
  birthYear?: number | null
  birthMonth?: number | null
  birthDay?: number | null
  birthCirca?: boolean
  /** 人物专属：死亡年/月/日与约数 */
  deathYear?: number | null
  deathMonth?: number | null
  deathDay?: number | null
  deathCirca?: boolean
  /** 人物专属：出生于（关联地点 id + 自由文本兜底） */
  birthPlaceId?: string | null
  birthPlaceFree?: string
  /** 人物专属：死亡于（关联地点 id + 自由文本兜底） */
  deathPlaceId?: string | null
  deathPlaceFree?: string
  /** 人物专属：现状（生死状况，自由文本，可留空） */
  lifeStatus?: string
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
  note: string
  body: string
  /**
   * 所属任务 id（v5）。语义：
   * - 创建（id 为 null）：undefined/null 均表示不属于任何任务；
   * - 更新：undefined 表示保持现有值不变（主表单不触碰该字段）；null 表示清除；
   *   传入非空 id 时校验任务存在并写入。
   */
  questId?: string | null
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
  // v2：层级——祖先链（从顶级到直接父级），用于面包屑与上级展示；草稿/已删除父级在公开页跳过
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

  // v5：任务（独立于实体的第三种数据存在）
  /** 任务列表（分类固定序 → 展示排序 → 篇章 → 进程 → 名称拼音） */
  listQuests(opts?: ListQuestsOpts): Promise<Quest[]>
  getQuestById(id: string): Promise<Quest | null>
  getQuestBySlug(slug: string, opts?: { includeDraft?: boolean }): Promise<Quest | null>
  createQuest(input: QuestInput): Promise<Quest>
  updateQuest(id: string, input: QuestInput): Promise<Quest>
  deleteQuest(id: string): Promise<void>
  restoreQuest(id: string): Promise<void>
  /** 任务计数（含 status 过滤，用于导航与统计） */
  getQuestCount(status?: ContentStatus): Promise<number>

  // v4：任务↔人物关联
  /** 获取任务的出场人物列表（含人物实体与角色/备注），仅未删除人物 */
  getQuestCharacters(questId: string): Promise<QuestCharacter[]>
  /** 获取人物的相关任务（反向），仅未删除任务；published 过滤由页面负责 */
  getQuestsForPerson(personId: string): Promise<QuestPersonRef[]>

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
  /** 设置文本的所属任务（v5：一对多，一篇文本至多属于一个任务；null 表示清除） */
  setTextEntryQuest(entryId: string, questId: string | null): Promise<void>

  getEntryBlocks(entryId: string): Promise<BlockWithLinks[]>
  setManualLinks(blockId: string, entityIds: string[]): Promise<void>

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
