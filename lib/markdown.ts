import MarkdownIt from "markdown-it"
import type { Env, MarkdownItOptions, StateInline, Token } from "markdown-it"
import { escapeHtml } from "./utils"
import type { BlockKind } from "./db/types"

export interface WikiLinkRaw {
  raw: string
  target: string
  display: string | null
  kind: "entity" | "text"
  valid: boolean
}

export type ResolvedLink = {
  ok: boolean
  href?: string
  display: string
}

export type LinkResolver = (link: WikiLinkRaw) => ResolvedLink

const WIKI_PATTERN = /\[\[([^\[\]]+?)(?:\|([^\[\]]*))?\]\]/

export function parseWikiRaw(raw: string): { target: string; display: string | null } | null {
  const m = WIKI_PATTERN.exec(raw)
  if (!m) return null
  const target = m[1].trim()
  if (!target) return null
  const display = m[2] !== undefined && m[2].length > 0 ? m[2].trim() : null
  return { target, display }
}

export function linkDisplayFallback(display: string | null, target: string): string {
  if (display) return display
  // 钉定写法的显示文字取名称部分，不能把 @slug 带进正文
  const base = splitPinnedTarget(target)?.base ?? target
  return base.replace(/^文本:\s*/, "").trim() || base
}

/** 钉定写法拆解结果：base 为名称部分，slug 为目标唯一标识 */
export interface PinnedTarget {
  base: string
  slug: string
}

// slug 由 slugify 生成，字符集为字母/数字/下划线/连字符（不含 @）；
// 以 @ 后缀钉定目标实体/文本，如 [[夜渡者@shen-yan]]、[[文本:标题@text-slug]]，
// 名称部分不能包含 @（否则会被当作钉定分隔符）
const PINNED_TARGET_PATTERN = /^([^@]+)@([\p{L}\p{N}_-]+)$/u

/** 拆出钉定写法的 base 与 slug；不匹配（未钉定或格式不符）时返回 null */
export function splitPinnedTarget(target: string): PinnedTarget | null {
  const m = PINNED_TARGET_PATTERN.exec((target ?? "").trim())
  if (!m) return null
  const base = m[1].trim()
  const slug = m[2].trim()
  if (!base || !slug) return null
  return { base, slug }
}

export function extractWikiLinks(src: string): WikiLinkRaw[] {
  const out: WikiLinkRaw[] = []
  const re = /\[\[[^\[\]]+\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const raw = m[0]
    const parsed = parseWikiRaw(raw)
    if (parsed) {
      out.push({
        raw,
        target: parsed.target,
        display: parsed.display,
        kind: parsed.target.startsWith("文本:") ? "text" : "entity",
        valid: true,
      })
    } else {
      out.push({ raw, target: "", display: null, kind: "entity", valid: false })
    }
  }
  return out
}

function detectKind(content: string): BlockKind {
  const firstLine = (content.split("\n").find((l) => l.trim()) ?? "").trim()
  if (/^#{1,6}\s/.test(firstLine)) return "heading"
  if (firstLine.startsWith(">")) return "quote"
  if (/^[-*+]\s/.test(firstLine) || /^\s*\d+[.、)]\s/.test(firstLine)) return "list"
  return "paragraph"
}

export function splitBlocks(body: string): { kind: BlockKind; content: string }[] {
  const norm = (body ?? "").replace(/\r\n/g, "\n")
  const segments = norm.split(/\n\s*\n/)
  const out: { kind: BlockKind; content: string }[] = []
  for (const seg of segments) {
    const content = seg.replace(/\n+$/g, "").replace(/^[ \t]+$/gm, "")
    if (!content.trim()) continue
    out.push({ kind: detectKind(content), content })
  }
  return out
}

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: false,
  typographer: false,
})

md.disable([
  "image",
  "table",
  "link",
  "linkify",
  "autolink",
  "html_block",
  "html_inline",
  "fence",
  "code",
  "backticks",
  "hr",
  "reference",
])

function wikiRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x5b) return false
  if (src.charCodeAt(start + 1) !== 0x5b) return false
  const end = src.indexOf("]]", start + 2)
  if (end === -1) return false
  const inner = src.slice(start + 2, end)
  if (/[\[\]]/.test(inner)) return false
  const parsed = parseWikiRaw(`[[${inner}]]`)
  if (!parsed) return false
  if (!silent) {
    const token = state.push("wiki_link", "", 0)
    token.markup = "[["
    token.content = parsed.target
    token.meta = {
      display: parsed.display,
      raw: `[[${inner}]]`,
    }
  }
  state.pos = end + 2
  return true
}

md.inline.ruler.before("text", "wiki_link", wikiRule)

md.renderer.rules.wiki_link = (
  tokens: Token[],
  idx: number,
  _options: MarkdownItOptions,
  env: Env | undefined
) => {
  const token = tokens[idx]
  const meta = (token.meta ?? {}) as { raw?: string; display?: string | null }
  const raw: string = meta.raw ?? ""
  const target: string = token.content
  const display: string | null = meta.display ?? null
  const fallback = linkDisplayFallback(display, target)
  const resolve = (env as { resolve?: LinkResolver } | undefined)?.resolve
  if (resolve) {
    const link: WikiLinkRaw = {
      raw,
      target,
      display,
      kind: target.startsWith("文本:") ? "text" : "entity",
      valid: true,
    }
    const resolved = resolve(link)
    if (resolved.ok && resolved.href) {
      return `<a href="${escapeHtml(resolved.href)}" class="wiki-link">${escapeHtml(resolved.display)}</a>`
    }
  }
  return escapeHtml(fallback)
}

export function renderMarkdown(src: string, resolve?: LinkResolver): string {
  const env = resolve ? { resolve } : {}
  return md.render(src ?? "", env)
}