import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS } from "@/lib/db/types"
import { renderEntryBlocks, renderMarkdownContent } from "@/lib/render"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamic = "force-dynamic"

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function EntityDetailPage(props: {
  params: Promise<{ type: string; slug: string }>
}) {
  const { type, slug: rawSlug } = await props.params
  const slug = decodeSlug(rawSlug)
  const store = await getStore()

  if (!(type in ENTITY_TYPE_LABELS)) {
    notFound()
  }

  const entity = await store.getEntityBySlug(slug)
  if (!entity || entity.type !== type) {
    notFound()
  }

  const related = await store.getRelatedBlocksForEntity(entity.id)
  const entryIds = [...new Set(related.map((item) => item.entryId))]
  const entryBlocks = new Map<string, Map<string, string>>()
  for (const entryId of entryIds) {
    const blocksWithLinks = await store.getEntryBlocks(entryId)
    const rendered = await renderEntryBlocks(store, blocksWithLinks, { publicOnly: true })
    entryBlocks.set(entryId, new Map(rendered.map((item) => [item.blockId, item.html])))
  }

  const introHtml = await renderMarkdownContent(store, entity.intro, { publicOnly: true })
  const noteHtml = await renderMarkdownContent(store, entity.note, { publicOnly: true })

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb
          items={[
            { label: ENTITY_TYPE_LABELS[entity.type], href: `/entities/${entity.type}` },
            { label: entity.name },
          ]}
        />
        <h1 className="page-title">{entity.name}</h1>
      </header>

      {entity.aliases.length > 0 && (
        <dl className="record-meta">
          <dt>别名</dt>
          <dd>{entity.aliases.join("、")}</dd>
        </dl>
      )}

      {entity.intro ? (
        <section className="record-section">
          <h2>简介</h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
        </section>
      ) : null}

      {entity.note ? (
        <section className="record-section">
          <h2>补充说明</h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: noteHtml }} />
        </section>
      ) : null}

      <section className="record-section">
        <h2>
          相关文本 <span className="index-note">（{entryIds.length} 条文本，{related.length} 个段落）</span>
        </h2>
        {related.length === 0 ? (
          <p className="empty">暂无相关文本。</p>
        ) : (
          <div className="table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col">文本</th>
                  <th scope="col">来源与定位</th>
                  <th scope="col">段落</th>
                  <th scope="col">相关片段</th>
                </tr>
              </thead>
              <tbody>
                {related.map((item) => (
                  <tr key={item.blockId} id={`related-${item.blockId}`}>
                    <td>
                      <Link href={`/texts/${item.entrySlug}`}>{item.entryTitle}</Link>
                    </td>
                    <td>
                      {item.sourceCategory}
                      {item.sourceName ? ` · ${item.sourceName}` : ""}
                      {item.ingameLocation ? <div className="item-meta">{item.ingameLocation}</div> : null}
                    </td>
                    <td>{item.blockOrdinal + 1}</td>
                    <td>
                      <div
                        className="prose related-excerpt"
                        dangerouslySetInnerHTML={{
                          __html: entryBlocks.get(item.entryId)?.get(item.blockId) ?? "",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
