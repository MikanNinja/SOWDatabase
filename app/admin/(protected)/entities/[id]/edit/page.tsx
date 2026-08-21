import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import EntityForm from "@/components/admin/EntityForm"
import { renderEntryBlocks } from "@/lib/render"

export const dynamic = "force-dynamic"

export default async function EditEntityPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const store = await getStore()
  const entity = await store.getEntityById(id)
  if (!entity) notFound()

  const related = await store.getRelatedBlocksForEntity(entity.id)
  const entryIds = [...new Set(related.map((item) => item.entryId))]
  const entryBlocks = new Map<string, Map<string, string>>()
  for (const entryId of entryIds) {
    const blocksWithLinks = await store.getEntryBlocks(entryId)
    const rendered = await renderEntryBlocks(store, blocksWithLinks)
    entryBlocks.set(entryId, new Map(rendered.map((item) => [item.blockId, item.html])))
  }

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 实体编辑</p>
        <h1>编辑实体：{entity.name}</h1>
        <div className="toolbar-links">
          <Link href={`/entities/${entity.type}/${entity.slug}`} target="_blank">查看公开页面</Link>
        </div>
      </header>

      <EntityForm entity={entity} />

      <section className="record-section">
        <h2>关联文本 <span className="index-note">（{entryIds.length} 条文本，{related.length} 个段落）</span></h2>
        {related.length === 0 ? (
          <p className="empty">暂无关联文本。</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">文本</th>
                  <th scope="col">来源</th>
                  <th scope="col">段落</th>
                  <th scope="col">片段</th>
                </tr>
              </thead>
              <tbody>
                {related.map((item) => (
                  <tr key={item.blockId}>
                    <td><Link href={`/admin/texts/${item.entryId}/edit`}>{item.entryTitle}</Link></td>
                    <td>{item.sourceCategory}{item.sourceName ? ` · ${item.sourceName}` : ""}</td>
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
