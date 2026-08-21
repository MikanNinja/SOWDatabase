import { randomUUID } from "node:crypto"

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return randomUUID()
}

export function slugify(input: string): string {
  const trimmed = (input ?? "").trim()
  if (!trimmed) return `item-${randomUUID().slice(0, 8)}`
  const slug = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || `item-${randomUUID().slice(0, 8)}`
}

export function escapeHtml(text: string): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const s = (v ?? "").trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function linesToList(text: string): string[] {
  return uniqueStrings((text ?? "").split(/\r?\n/))
}