import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { deleteTextAction, restoreTextAction } from "@/app/admin/actions"
import SubmitButton from "@/components/admin/SubmitButton"

export const dynamic = "force-dynamic"

export default async function AdminTextsPage(props: {
  searchParams: Promise<{ q?: string; category?: string; deleted?: string }>
}) {
  const { q, category, deleted } = await props.searchParams
  const store = await getStore()
  const categories = await store.listTextCategories()

  const texts = await store.listTextEntries({
    search: q?.trim() || undefined,
    category: category || undefined,
    deletedOnly: deleted === "1",
  })

  return (
    <>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 文本</p>
        <h1>文本管理</h1>
        <p className="page-subtitle">当前列表 {texts.length} 条记录{deleted === "1" ? "（已删除）" : ""}。</p>
      </header>

      <div className="admin-toolbar">
        <form action="/admin/texts" method="get" className="search-form">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="按标题搜索" aria-label="搜索" />
          <input type="hidden" name="category" value={category ?? ""} />
          <input type="hidden" name="deleted" value={deleted ?? ""} />
          <button type="submit">检索</button>
        </form>
        <nav className="toolbar-links" aria-label="文本管理筛选">
          <Link href="/admin/texts">{!category && deleted !== "1" ? "[全部]" : "全部"}</Link>
          {categories.map((currentCategory) => (
            <Link key={currentCategory} href={`/admin/texts?category=${encodeURIComponent(currentCategory)}`}>
              {category === currentCategory ? `[${currentCategory}]` : currentCategory}
            </Link>
          ))}
          <Link href="/admin/texts?deleted=1">{deleted === "1" ? "[已删除]" : "已删除"}</Link>
          <Link href="/admin/texts/new" className="btn primary">新增文本</Link>
        </nav>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">标题</th>
              <th scope="col">来源</th>
              <th scope="col">游戏内定位</th>
              <th scope="col">状态</th>
              <th scope="col">修改日期</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {texts.map((text) => (
              <tr key={text.id}>
                <td><Link href={`/admin/texts/${text.id}/edit`}>{text.title}</Link></td>
                <td>{text.sourceCategory}{text.sourceName ? ` · ${text.sourceName}` : ""}</td>
                <td>{text.ingameLocation}</td>
                <td><span className={`badge ${text.status}`}>{text.status === "published" ? "已发布" : "草稿"}</span></td>
                <td>{text.updatedAt.slice(0, 10)}</td>
                <td>
                  {deleted === "1" ? (
                    <form action={restoreTextAction}>
                      <input type="hidden" name="id" value={text.id} />
                      <SubmitButton className="btn small" pendingLabel="恢复中…">恢复</SubmitButton>
                    </form>
                  ) : (
                    <form action={deleteTextAction}>
                      <input type="hidden" name="id" value={text.id} />
                      <SubmitButton className="btn small danger" pendingLabel="删除中…">删除</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {texts.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">暂无记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
