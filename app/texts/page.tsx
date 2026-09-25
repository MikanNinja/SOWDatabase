import type { Metadata } from "next"
import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { compareZh } from "@/lib/collate"
import Breadcrumb from "@/components/Breadcrumb"
import TableFilter from "@/components/TableFilter"

export const metadata: Metadata = {
  title: "文本列表",
}

export default async function TextListPage() {
  const store = await getStore()
  const texts = await store.listTextEntries({ status: "published" })
  const categories = [
    ...new Set(texts.map((text) => text.sourceCategory).filter(Boolean)),
  ].sort(compareZh)

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "文本条目" }]} />
        <h1 className="page-title">文本条目</h1>
        <p className="page-subtitle">共 {texts.length} 条已发布记录</p>
      </header>

      <div className="toolbar">
        <form action="/texts" method="get" className="search-form" role="search" autoComplete="off">
          <input
            type="search"
            name="q"
            placeholder="按标题搜索"
            aria-label="按标题搜索"
          />
          <input
            type="text"
            name="sourceName"
            placeholder="来源名称"
            aria-label="按来源名称筛选"
          />
          <button type="submit">筛选</button>
        </form>
        <nav className="toolbar-links" aria-label="文本来源类别">
          <Link href="/texts">全部</Link>
          {categories.map((currentCategory) => (
            <Link
              key={currentCategory}
              href={`/texts?category=${encodeURIComponent(currentCategory)}`}
            >
              {currentCategory}
            </Link>
          ))}
        </nav>
      </div>

      <TableFilter
        filters={[
          { key: "q", attr: "q", mode: "substring" },
          { key: "sourceName", attr: "sourceName", mode: "substring" },
          { key: "category", attr: "category", mode: "exact" },
        ]}
        rows={texts.map((text) => ({
          id: text.id,
          attrs: {
            q: text.title.toLowerCase(),
            sourceName: text.sourceName.toLowerCase(),
            category: text.sourceCategory,
          },
        }))}
        basePath="/texts"
      />

      {texts.length === 0 ? (
        <p className="empty">暂无符合条件的记录。</p>
      ) : (
        <div className="table-wrap">
          <table className="catalog-table" data-filter-table="">
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">来源</th>
                <th scope="col">游戏内定位</th>
              </tr>
            </thead>
            <tbody>
              {texts.map((text) => (
                <tr
                  key={text.id}
                  data-q={text.title.toLowerCase()}
                  data-sourceName={text.sourceName.toLowerCase()}
                  data-category={text.sourceCategory}
                >
                  <td>
                    <Link href={`/texts/${text.slug}`}>{text.title}</Link>
                  </td>
                  <td>
                    {text.sourceCategory || "—"}
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
