import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { renderEntryBlocks } from "@/lib/render"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamic = "force-dynamic"

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function TextDetailPage(props: {
  params: Promise<{ slug: string }>
}) {
  const { slug: rawSlug } = await props.params
  const slug = decodeSlug(rawSlug)
  const store = await getStore()

  const entry = await store.getTextEntryBySlug(slug)
  if (!entry) {
    notFound()
  }

  const blocksWithLinks = await store.getEntryBlocks(entry.id)
  const rendered = await renderEntryBlocks(store, blocksWithLinks, { publicOnly: true })

  const metaRows: [string, string][] = [
    ["来源类别", entry.sourceCategory],
    ["来源名称", entry.sourceName],
    ["游戏内定位", entry.ingameLocation],
    ["触发条件", entry.triggerCondition],
    ["补充说明", entry.note],
  ].filter(([, value]) => value !== "") as [string, string][]

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "文本条目", href: "/texts" }, { label: entry.title }]} />
        <h1 className="page-title">{entry.title}</h1>
      </header>

      <dl className="record-meta">
        {metaRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="record-section">
        <h2>正文</h2>
        <div className="prose">
          {rendered.map((block) => (
            <div key={block.blockId} id={`block-${block.blockId}`}>
              {block.ordinal > 0 ? <a className="block-anchor" href={`#block-${block.blockId}`} aria-label={`第 ${block.ordinal + 1} 段`}>§{block.ordinal + 1}</a> : null}
              <div dangerouslySetInnerHTML={{ __html: block.html }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
