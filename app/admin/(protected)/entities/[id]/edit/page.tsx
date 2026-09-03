import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import EntityForm from "@/components/admin/EntityForm"
import PersonRelationsForm from "@/components/admin/PersonRelationsForm"
import { renderEntryBlocks } from "@/lib/render"
import type { Entity, PersonRelation } from "@/lib/db/types"

export const dynamic = "force-dynamic"

interface RelationDisplay {
  relation: PersonRelation
  otherPerson: Entity
  perspective: "from" | "to"
  label: string
  isReverseFallback: boolean
}

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

  // v2：加载所属势力、可用势力列表、可用父级列表
  const currentFactions = await store.getEntityFactions(entity.id)
  const allEntities = await store.listEntities({})
  const availableFactions = allEntities
    .filter((e) => e.type === "faction")
    .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases }))
  const availableParents = allEntities.filter((e) => e.type === "place" || e.type === "faction")
  const availablePlaces = allEntities.filter((e) => e.type === "place")

  // v2：加载层级信息用于后台展示
  const ancestors = entity.parentId ? await store.getEntityAncestors(entity.id) : []
  const children = await store.getEntityChildren(entity.id)
  const factionMembers = entity.type === "faction" ? await store.getFactionMembers(entity.id) : []

  // v2：加载人物关系
  const relations = entity.type === "person"
    ? await store.getRelationsForPerson(entity.id)
    : []
  const allPersons = allEntities.filter((e) => e.type === "person")

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 实体编辑</p>
        <h1>编辑实体：{entity.name}</h1>
        <div className="toolbar-links">
          <Link href={`/entities/${entity.type}/${entity.slug}`} target="_blank">查看公开页面</Link>
        </div>
      </header>

      <EntityForm
        entity={entity}
        availableFactions={availableFactions}
        availableParents={availableParents}
        availablePlaces={availablePlaces}
        currentFactions={currentFactions}
      />

      {/* v2：层级概览 */}
      {(entity.type === "place" || entity.type === "faction") && (
        <section className="record-section">
          <h2>层级概览</h2>
          {ancestors.length > 0 && (
            <p className="item-meta">
              <strong>上级链：</strong>
              {ancestors.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && " › "}
                  <Link href={`/admin/entities/${a.id}/edit`}>{a.name}</Link>
                </span>
              ))}
            </p>
          )}
          {children.length > 0 && (
            <p className="item-meta">
              <strong>直接下级（{children.length}）：</strong>
              {children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && "、"}
                  <Link href={`/admin/entities/${c.id}/edit`}>{c.name}</Link>
                </span>
              ))}
            </p>
          )}
          {ancestors.length === 0 && children.length === 0 && (
            <p className="muted">未设置层级关系。</p>
          )}
        </section>
      )}

      {/* v2：势力成员概览 */}
      {entity.type === "faction" && (
        <section className="record-section">
          <h2>成员（{factionMembers.length}）</h2>
          {factionMembers.length === 0 ? (
            <p className="muted">暂无成员。成员通过人物的“所属势力”字段维护。</p>
          ) : (
            <ul className="item-list">
              {factionMembers.map(({ entity: member, role }) => (
                <li key={member.id}>
                  <Link href={`/admin/entities/${member.id}/edit`}>{member.name}</Link>
                  {role ? <span className="muted">（{role}）</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* v2：人际关系 */}
      {entity.type === "person" && (
        <section className="record-section">
          <h2>人际关系（{relations.length}）</h2>
          <PersonRelationsForm
            personId={entity.id}
            persons={allPersons}
            relations={relations as RelationDisplay[]}
          />
        </section>
      )}

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
