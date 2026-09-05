import { extractWikiLinks, linkDisplayFallback, renderMarkdown } from "./markdown"
import type { BlockWithLinks } from "./db/store"
import type { ContentLink, Entity, TextEntry } from "./db/types"
import type { Store } from "./db/store"

export interface RenderedBlock {
  blockId: string
  ordinal: number
  kind: string
  html: string
}

export async function renderEntryBlocks(
  store: Store,
  blocksWithLinks: BlockWithLinks[],
  opts: { publicOnly?: boolean } = {}
): Promise<RenderedBlock[]> {
  const entityIds = new Set<string>()
  const textIds = new Set<string>()
  for (const { links } of blocksWithLinks) {
    for (const l of links) {
      if (l.source !== "inline") continue
      if (l.targetKind === "entity") entityIds.add(l.targetId)
      else textIds.add(l.targetId)
    }
  }

  const entityMap = new Map<string, Entity>()
  for (const id of entityIds) {
    const e = await store.getEntityById(id)
    if (e) entityMap.set(id, e)
  }
  const textMap = new Map<string, TextEntry>()
  for (const id of textIds) {
    const t = await store.getTextEntryById(id)
    if (t) textMap.set(id, t)
  }

  const out: RenderedBlock[] = []
  for (const { block, links } of blocksWithLinks) {
    const inlineByRaw = new Map(
      links.filter((l) => l.source === "inline").map((l) => [l.raw, l])
    )
    const resolve = (link: {
      raw: string
      target: string
      display: string | null
    }): { ok: boolean; href?: string; display: string } => {
      const fallback = linkDisplayFallback(link.display, link.target)
      const stored = inlineByRaw.get(link.raw)
      if (!stored) return { ok: false, display: fallback }
      let href: string | null = null
      let published = false
      if (stored.targetKind === "entity") {
        const e = entityMap.get(stored.targetId)
        if (e) {
          href = `/entities/${e.type}/${e.slug}`
          published = e.status === "published"
        }
      } else {
        const t = textMap.get(stored.targetId)
        if (t) {
          href = `/texts/${t.slug}`
          published = t.status === "published"
        }
      }
      if (!href || (opts.publicOnly && !published)) {
        return { ok: false, display: fallback }
      }
      return { ok: true, href, display: fallback }
    }
    out.push({
      blockId: block.id,
      ordinal: block.ordinal,
      kind: block.kind,
      html: renderMarkdown(block.content, resolve),
    })
  }
  return out
}

export async function renderMarkdownContent(
  store: Store,
  src: string,
  opts: { publicOnly?: boolean } = {}
): Promise<string> {
  const raws = extractWikiLinks(src)
  const resolved = new Map<
    string,
    { ok: boolean; href?: string; display: string }
  >()
  for (const link of raws) {
    if (resolved.has(link.raw)) continue
    if (!link.valid || !link.target) {
      resolved.set(link.raw, {
        ok: false,
        display: linkDisplayFallback(link.display, link.target) || link.raw,
      })
      continue
    }
    let cands: { status: string; slug: string; label: string; kind: "entity" | "text"; type?: string }[] = []
    if (link.kind === "text") {
      const title = link.target.replace(/^文本:\s*/, "").trim()
      cands = await store.findTextCandidates(title)
    } else {
      cands = await store.findEntityCandidates(link.target)
    }
    const fallback = linkDisplayFallback(link.display, link.target)
    if (cands.length === 1) {
      const c = cands[0]
      const href = c.kind === "entity" ? `/entities/${c.type}/${c.slug}` : `/texts/${c.slug}`
      if (opts.publicOnly && c.status !== "published") {
        resolved.set(link.raw, { ok: false, display: fallback })
      } else {
        resolved.set(link.raw, { ok: true, href, display: fallback })
      }
    } else {
      resolved.set(link.raw, { ok: false, display: fallback })
    }
  }
  return renderMarkdown(src, (link) => resolved.get(link.raw) ?? { ok: false, display: link.display ?? link.target })
}

export type { ContentLink }