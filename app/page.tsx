import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const store = await getStore()
  const settings = await store.getSettings()
  const counts = await store.getEntityCounts("published")
  const texts = await store.listTextEntries({ status: "published" })
  const categories = await store.listTextCategories()

  return (
    <div className="container">
      <section className="home-hero">
        <h1>{settings.siteName}</h1>
        {settings.siteDescription ? <p>{settings.siteDescription}</p> : <p>单款游戏的中文人物、地点、势力资料库。</p>}
        <form action="/search" method="get" className="search-form" role="search">
          <input
            type="search"
            name="q"
            placeholder="搜索人物、地点、势力名称或别名"
            aria-label="搜索实体"
          />
          <button type="submit">搜索</button>
        </form>
      </section>

      <section className="record-section">
        <h2>资料目录</h2>
        <div className="table-wrap">
          <table className="catalog-table directory-table">
            <thead>
              <tr>
                <th scope="col">类别</th>
                <th scope="col">已发布记录</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {ENTITY_TYPES.map((type) => (
                <tr key={type}>
                  <td>
                    <Link href={`/entities/${type}`}>{ENTITY_TYPE_LABELS[type]}</Link>
                  </td>
                  <td>{counts[type]}</td>
                  <td>{ENTITY_TYPE_LABELS[type]}的名称、别名、简介及相关文本。</td>
                </tr>
              ))}
              <tr>
                <td><Link href="/texts">文本条目</Link></td>
                <td>{texts.length}</td>
                <td>按来源类别、来源名称和游戏内定位浏览。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="record-section">
        <h2>文本来源分类</h2>
        {categories.length > 0 ? (
          <div className="chips">
            {categories.map((c) => (
              <Link key={c} href={`/texts?category=${encodeURIComponent(c)}`} className="chip">
                {c}
              </Link>
            ))}
          </div>
        ) : (
          <p className="empty">暂无已发布的文本。</p>
        )}
        <p className="index-note">分类只影响文本条目的目录筛选，不改变正文内容。</p>
      </section>
    </div>
  )
}
