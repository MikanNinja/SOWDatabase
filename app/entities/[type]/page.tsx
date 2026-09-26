import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { wikiLinksToText } from "@/lib/markdown"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"
import Breadcrumb from "@/components/Breadcrumb"
import TableFilter from "@/components/TableFilter"

export const dynamicParams = false

export function generateStaticParams() {
  return ENTITY_TYPES.map((type) => ({ type }))
}

export async function generateMetadata(props: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const { type } = await props.params
  if (!ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
    notFound()
  }
  const entityType = type as (typeof ENTITY_TYPES)[number]
  return { title: `${ENTITY_TYPE_LABELS[entityType]}列表` }
}

export default async function EntityListPage(props: {
  params: Promise<{ type: string }>
}) {
  const { type } = await props.params
  const store = await getStore()

  if (!ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
    notFound()
  }

  const entityType = type as (typeof ENTITY_TYPES)[number]
  const entities = await store.listEntities({
    type: entityType,
    status: "published",
  })

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: ENTITY_TYPE_LABELS[entityType] }]} />
        <h1 className="page-title">{ENTITY_TYPE_LABELS[entityType]}</h1>
        <p className="page-subtitle">共 {entities.length} 条已发布记录</p>
      </header>

      <div className="toolbar">
        <form action={`/entities/${entityType}`} method="get" className="search-form" role="search" autoComplete="off">
          <input
            type="search"
            name="q"
            placeholder={`搜索${ENTITY_TYPE_LABELS[entityType]}名称或别名`}
            aria-label="搜索"
          />
          <button type="submit">检索</button>
        </form>
        <nav className="toolbar-links" aria-label="实体类别">
          {ENTITY_TYPES.map((currentType) => (
            <Link key={currentType} href={`/entities/${currentType}`}>
              {currentType === entityType
                ? `[${ENTITY_TYPE_LABELS[currentType]}]`
                : ENTITY_TYPE_LABELS[currentType]}
            </Link>
          ))}
          <Link href="/quests">任务</Link>
        </nav>
      </div>

      <TableFilter
        filters={[{ key: "q", attr: "q", mode: "substring" }]}
        rows={entities.map((entity) => ({
          id: entity.id,
          attrs: { q: `${entity.name} ${entity.aliases.join(" ")}`.toLowerCase() },
        }))}
        basePath={`/entities/${entityType}`}
      />

      {entities.length === 0 ? (
        <p className="empty">暂无符合条件的记录。</p>
      ) : (
        <div className="table-wrap">
          <table className="catalog-table" data-filter-table="">
            <thead>
              <tr>
                <th scope="col">标准名称</th>
                <th scope="col">简介</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr
                  key={entity.id}
                  data-q={`${entity.name} ${entity.aliases.join(" ")}`.toLowerCase()}
                >
                  <td>
                    <Link href={`/entities/${entity.type}/${entity.slug}`}>
                      {entity.name}
                    </Link>
                  </td>
                  <td>{entity.intro ? wikiLinksToText(entity.intro).slice(0, 120) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
