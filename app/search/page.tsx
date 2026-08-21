import Link from "next/link"
import { getStore } from "@/lib/db/store"
import type { Store } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS } from "@/lib/db/types"

export const dynamic = "force-dynamic"

export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await props.searchParams
  const query = q?.trim() ?? ""
  const store = await getStore()

  let results: Awaited<ReturnType<Store["listEntities"]>> = []
  let searched = false
  if (query) {
    searched = true
    results = await store.listEntities({ status: "published", search: query })
  }

  const grouped = {
    person: results.filter((result) => result.type === "person"),
    place: results.filter((result) => result.type === "place"),
    faction: results.filter((result) => result.type === "faction"),
  }

  return (
    <div className="container">
      <header className="record-header">
        <p className="page-kicker">公开资料 / 名称检索</p>
        <h1 className="page-title">实体检索</h1>
        <p className="page-subtitle">当前检索人物、地点、势力的标准名称和别名。</p>
      </header>

      <form action="/search" method="get" className="search-form" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="输入名称或别名"
          aria-label="搜索实体"
          autoFocus
        />
        <button type="submit">检索</button>
      </form>

      {!searched ? (
        <p className="empty">输入关键词开始检索。</p>
      ) : results.length === 0 ? (
        <p className="empty">没有找到与“{query}”匹配的已发布记录。</p>
      ) : (
        <section className="record-section">
          <h2>检索结果（{results.length}）</h2>
          {(["person", "place", "faction"] as const).map((type) => {
            const items = grouped[type]
            if (items.length === 0) return null
            return (
              <section key={type} className="record-section">
                <h3>{ENTITY_TYPE_LABELS[type]}（{items.length}）</h3>
                <div className="table-wrap">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th scope="col">标准名称</th>
                        <th scope="col">别名</th>
                        <th scope="col">简介</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((entity) => (
                        <tr key={entity.id}>
                          <td>
                            <Link href={`/entities/${entity.type}/${entity.slug}`}>
                              {entity.name}
                            </Link>
                          </td>
                          <td>{entity.aliases.length > 0 ? entity.aliases.join("、") : ""}</td>
                          <td>{entity.intro ? entity.intro.slice(0, 120) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </section>
      )}
    </div>
  )
}
