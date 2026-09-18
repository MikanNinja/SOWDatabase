import {
  extractWikiLinks,
  linkDisplayFallback,
  splitBlocks,
  splitPinnedTarget,
} from "./markdown"
import type { WikiLinkRaw } from "./markdown"
import type { LinkCandidate, LinkIssue } from "./db/types"
import type { Store } from "./db/store"

export interface ResolvedWikiLink {
  /** null 表示解析成功且目标唯一，其余为问题原因 */
  issue: "invalid" | "not_found" | "ambiguous" | null
  /** issue 为 null 时为命中目标，否则为 null */
  candidate: LinkCandidate | null
  /** issue 为 ambiguous 时为多候选，其余为空 */
  candidates: LinkCandidate[]
  /** 链接应显示的文字：优先显式 |显示文字，否则钉定写法取名称部分，普通写法取 target 原文（文本类去前缀） */
  displayText: string
}

/** 统一的 wiki 链接解析入口：钉定写法（[[名称@slug]]）优先按 slug 直接命中，否则按名称/别名精确匹配 */
export async function resolveWikiLink(store: Store, link: WikiLinkRaw): Promise<ResolvedWikiLink> {
  const invalid: ResolvedWikiLink = {
    issue: "invalid",
    candidate: null,
    candidates: [],
    displayText: linkDisplayFallback(link.display, link.target),
  }
  if (!link.valid || !link.target) return invalid

  const pinned = splitPinnedTarget(link.target)
  if (pinned) {
    const displayText = linkDisplayFallback(link.display, pinned.base)
    if (link.kind === "text") {
      const t = await store.getTextEntryBySlug(pinned.slug, { includeDraft: true })
      if (t) {
        return {
          issue: null,
          candidate: { kind: "text", id: t.id, slug: t.slug, label: t.title, status: t.status },
          candidates: [],
          displayText,
        }
      }
    } else {
      const e = await store.getEntityBySlug(pinned.slug, { includeDraft: true })
      if (e) {
        return {
          issue: null,
          candidate: {
            kind: "entity",
            id: e.id,
            slug: e.slug,
            label: e.name,
            type: e.type,
            status: e.status,
          },
          candidates: [],
          displayText,
        }
      }
    }
    // 钉定的 slug 查不到：回退为对名称部分做普通精确匹配
    return matchByName(store, link.kind, pinned.base, displayText)
  }

  const displayText = linkDisplayFallback(link.display, link.target)
  return matchByName(store, link.kind, link.target, displayText)
}

async function matchByName(
  store: Store,
  kind: "entity" | "text",
  name: string,
  displayText: string
): Promise<ResolvedWikiLink> {
  const cands = kind === "text" ? await store.findTextCandidates(name.replace(/^文本:\s*/, "").trim()) : await store.findEntityCandidates(name)
  if (cands.length === 1) {
    return { issue: null, candidate: cands[0], candidates: [], displayText }
  }
  return {
    issue: cands.length === 0 ? "not_found" : "ambiguous",
    candidate: null,
    candidates: cands,
    displayText,
  }
}

export async function computeLinkIssues(store: Store, body: string): Promise<LinkIssue[]> {
  const blocks = splitBlocks(body)
  const issues: LinkIssue[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    for (const link of extractWikiLinks(block.content)) {
      if (seen.has(link.raw)) continue
      seen.add(link.raw)
      const resolved = await resolveWikiLink(store, link)
      if (resolved.issue) {
        issues.push({
          raw: link.raw,
          target: resolved.issue === "invalid" ? "" : link.target,
          reason: resolved.issue,
          candidates: resolved.candidates,
        })
      }
    }
  }
  return issues
}
