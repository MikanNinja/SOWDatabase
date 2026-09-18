const zhCollator = new Intl.Collator("zh-Hans-CN")

export function compareZh(a: string, b: string): number {
  return zhCollator.compare(a, b)
}
