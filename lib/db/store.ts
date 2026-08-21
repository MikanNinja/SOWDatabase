import type {
  ContentLink,
  ContentStatus,
  Entity,
  EntityType,
  ExportData,
  LinkCandidate,
  RelatedBlock,
  SaveTextResult,
  Settings,
  TextBlock,
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

export interface EntityInput {
  slug?: string
  type: EntityType
  name: string
  intro?: string
  note?: string
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
