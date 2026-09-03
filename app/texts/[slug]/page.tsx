import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS } from "@/lib/db/types"
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

  // v2：加载整篇级关联目标实体（仅已发布）
  const associations = await store.getTextEntityAssociations(entry.id)
  const associationTargets = []
  for (const a of associations) {
    const target = await store.getEntityById(a.targetId)
    if (target && target.status === "published") {
      associationTargets.push({ association: a, entity: target })
    }
  }

  const metaRows: [string, string | React.ReactNode][] = [
    ["来源类别", entry.sourceCategory],
    ["来源名称", entry.sourceName],
    ["游戏内定位", entry.ingameLocation],
    ["补充说明", entry.note],
  ].filter(([, value]) => value !== "") as [string, string | React.ReactNode][]

  // v2：将整篇关联作为元信息行
  if (associationTargets.length > 0) {
    metaRows.push([
      "整篇关联",
      associationTargets.map(({ entity }, i) => (
        <span key={entity.id}>
          {i > 0 && "、"}
          <Link href={`/entities/${entity.type}/${entity.slug}`}>{entity.name}</Link>
          <span className="muted">（{ENTITY_TYPE_LABELS[entity.type]}）</span>
        </span>
      )),
    ])
  }

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
