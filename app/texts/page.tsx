import Link from "next/link"
import { getStore } from "@/lib/db/store"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamic = "force-dynamic"

export default async function TextListPage(props: {
  searchParams: Promise<{ q?: string; category?: string; sourceName?: string }>
}) {
  const { q, category, sourceName } = await props.searchParams
  const store = await getStore()
  const categories = await store.listTextCategories()
  const search = q?.trim() || undefined
  const source = sourceName?.trim() || undefined
  const texts = await store.listTextEntries({
    status: "published",
    category: category || undefined,
    sourceName: source,
    search,
  })

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "文本条目" }]} />
        <h1 className="page-title">文本条目</h1>
        <p className="page-subtitle">共 {texts.length} 条已发布记录</p>
      </header>

      <div className="toolbar">
        <form action="/texts" method="get" className="search-form" role="search">
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="按标题搜索"
            aria-label="按标题搜索"
          />
          <input
            type="text"
            name="sourceName"
            defaultValue={source ?? ""}
            placeholder="来源名称"
            aria-label="按来源名称筛选"
          />
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <button type="submit">筛选</button>
        </form>
        <nav className="toolbar-links" aria-label="文本来源类别">
          <Link href="/texts">{!category ? "[全部]" : "全部"}</Link>
          {categories.map((currentCategory) => (
            <Link
              key={currentCategory}
              href={`/texts?category=${encodeURIComponent(currentCategory)}`}
            >
              {category === currentCategory ? `[${currentCategory}]` : currentCategory}
            </Link>
          ))}
        </nav>
      </div>

      {texts.length === 0 ? (
        <p className="empty">暂无符合条件的记录。</p>
      ) : (
        <div className="table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">来源</th>
                <th scope="col">游戏内定位</th>
              </tr>
            </thead>
            <tbody>
              {texts.map((text) => (
                <tr key={text.id}>
                  <td>
                    <Link href={`/texts/${text.slug}`}>{text.title}</Link>
                  </td>
                  <td>
                    {text.sourceCategory}
                    {text.sourceName ? ` · ${text.sourceName}` : ""}
                  </td>
                  <td>{text.ingameLocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
