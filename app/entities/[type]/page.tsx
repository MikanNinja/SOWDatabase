import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamic = "force-dynamic"

export default async function EntityListPage(props: {
  params: Promise<{ type: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { type } = await props.params
  const { q } = await props.searchParams
  const store = await getStore()

  if (!ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
    notFound()
  }

  const entityType = type as (typeof ENTITY_TYPES)[number]
  const search = q?.trim() || undefined
  const entities = await store.listEntities({
    type: entityType,
    status: "published",
    search,
  })

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: ENTITY_TYPE_LABELS[entityType] }]} />
        <h1 className="page-title">{ENTITY_TYPE_LABELS[entityType]}</h1>
        <p className="page-subtitle">共 {entities.length} 条已发布记录</p>
      </header>

      <div className="toolbar">
        <form action={`/entities/${entityType}`} method="get" className="search-form" role="search">
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
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
        </nav>
      </div>

      {entities.length === 0 ? (
        <p className="empty">暂无符合条件的记录。</p>
      ) : (
        <div className="table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th scope="col">标准名称</th>
                <th scope="col">简介</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => (
                <tr key={entity.id}>
                  <td>
                    <Link href={`/entities/${entity.type}/${entity.slug}`}>
                      {entity.name}
                    </Link>
                  </td>
                  <td>{entity.intro ? entity.intro.slice(0, 120) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
