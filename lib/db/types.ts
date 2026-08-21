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
  status: ContentStatus
  aliases: string[]
  createdAt: string
  updatedAt: string
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
}