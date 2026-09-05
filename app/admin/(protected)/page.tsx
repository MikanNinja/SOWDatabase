import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const store = await getStore()
  const counts = await store.getEntityCounts()
  const publishedCounts = await store.getEntityCounts("published")
  const draftCounts = await store.getEntityCounts("draft")
  const allTexts = await store.listTextEntries({})
  const publishedTextCount = allTexts.filter((text) => text.status === "published").length
  const draftTextCount = allTexts.filter((text) => text.status === "draft").length
  const recentEntities = (await store.listEntities({}))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
  const recentTexts = [...allTexts]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  return (
    <>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 总览</p>
        <h1>概览</h1>
        <p className="page-subtitle">内容数量、状态和最近修改记录。</p>
      </header>

      <table className="admin-stats">
        <thead>
          <tr>
            <th scope="col">类别</th>
            <th scope="col">总数</th>
            <th scope="col">已发布</th>
            <th scope="col">草稿</th>
            <th scope="col">入口</th>
          </tr>
        </thead>
        <tbody>
          {ENTITY_TYPES.map((type) => (
            <tr key={type}>
              <td>{ENTITY_TYPE_LABELS[type]}</td>
              <td>{counts[type]}</td>
              <td>{publishedCounts[type]}</td>
              <td>{draftCounts[type]}</td>
              <td><Link href={`/admin/entities?type=${type}`}>管理</Link></td>
            </tr>
          ))}
          <tr>
            <td>文本条目</td>
            <td>{allTexts.length}</td>
            <td>{publishedTextCount}</td>
            <td>{draftTextCount}</td>
            <td><Link href="/admin/texts">管理</Link></td>
          </tr>
        </tbody>
      </table>

      <div className="toolbar-links">
        <Link href="/admin/entities/new" className="btn primary">新增实体</Link>
        <Link href="/admin/texts/new" className="btn primary">新增文本</Link>
        <Link href="/admin/export" className="btn">导出全部数据（JSON）</Link>
      </div>

      <section className="record-section">
        <h2>最近修改的实体</h2>
        {recentEntities.length === 0 ? (
          <p className="empty">暂无实体。</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">名称</th>
                  <th scope="col">类型</th>
                  <th scope="col">状态</th>
                  <th scope="col">修改日期</th>
                </tr>
              </thead>
              <tbody>
                {recentEntities.map((entity) => (
                  <tr key={entity.id}>
                    <td><Link href={`/admin/entities/${entity.id}/edit`}>{entity.name}</Link></td>
                    <td>{ENTITY_TYPE_LABELS[entity.type]}</td>
                    <td><span className={`badge ${entity.status}`}>{entity.status === "published" ? "已发布" : "草稿"}</span></td>
                    <td>{entity.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="record-section">
        <h2>最近修改的文本</h2>
        {recentTexts.length === 0 ? (
          <p className="empty">暂无文本。</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">来源</th>
                  <th scope="col">状态</th>
                  <th scope="col">修改日期</th>
                </tr>
              </thead>
              <tbody>
                {recentTexts.map((text) => (
                  <tr key={text.id}>
                    <td><Link href={`/admin/texts/${text.id}/edit`}>{text.title}</Link></td>
                    <td>{text.sourceCategory || "—"}{text.sourceName ? ` · ${text.sourceName}` : ""}</td>
                    <td><span className={`badge ${text.status}`}>{text.status === "published" ? "已发布" : "草稿"}</span></td>
                    <td>{text.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
