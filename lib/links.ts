import { extractWikiLinks, splitBlocks } from "./markdown"
import type { LinkIssue } from "./db/types"
import type { Store } from "./db/store"

export async function computeLinkIssues(store: Store, body: string): Promise<LinkIssue[]> {
  const blocks = splitBlocks(body)
  const issues: LinkIssue[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    for (const link of extractWikiLinks(block.content)) {
      if (seen.has(link.raw)) continue
      seen.add(link.raw)
      if (!link.valid || !link.target) {
        issues.push({ raw: link.raw, target: "", reason: "invalid", candidates: [] })
        continue
      }
      if (link.kind === "text") {
        const title = link.target.replace(/^文本:\s*/, "").trim()
        const cands = await store.findTextCandidates(title)
        if (cands.length === 0) {
          issues.push({ raw: link.raw, target: link.target, reason: "not_found", candidates: [] })
        } else if (cands.length > 1) {
          issues.push({ raw: link.raw, target: link.target, reason: "ambiguous", candidates: cands })
        }
      } else {
        const cands = await store.findEntityCandidates(link.target)
        if (cands.length === 0) {
          issues.push({ raw: link.raw, target: link.target, reason: "not_found", candidates: [] })
        } else if (cands.length > 1) {
          issues.push({ raw: link.raw, target: link.target, reason: "ambiguous", candidates: cands })
        }
      }
    }
  }
  return issues
}