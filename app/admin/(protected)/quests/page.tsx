import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { QUEST_CATEGORY_LABELS, type QuestCategory } from "@/lib/db/types"
import { deleteQuestAction, restoreQuestAction } from "@/app/admin/actions"
import SubmitButton from "@/components/admin/SubmitButton"

export const dynamic = "force-dynamic"

export default async function AdminQuestsPage(props: {
  searchParams: Promise<{ q?: string; deleted?: string }>
}) {
  const { q, deleted } = await props.searchParams
  const store = await getStore()

  const all = await store.listQuests({
    deletedOnly: deleted === "1",
  })
  const needle = q?.trim().toLowerCase() ?? ""
  const quests = needle
    ? all.filter((quest) => quest.name.toLowerCase().includes(needle))
    : all

  return (
    <>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 任务</p>
        <h1>任务管理</h1>
        <p className="page-subtitle">当前列表 {quests.length} 条记录{deleted === "1" ? "（已删除）" : ""}。</p>
      </header>

      <div className="admin-toolbar">
        <form action="/admin/quests" method="get" className="search-form" autoComplete="off">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="搜索任务名称" aria-label="搜索" />
          <input type="hidden" name="deleted" value={deleted ?? ""} />
          <button type="submit">检索</button>
        </form>
        <nav className="toolbar-links" aria-label="任务管理筛选">
          <Link href="/admin/quests">{deleted === "1" ? "全部" : "[全部]"}</Link>
          <Link href="/admin/quests?deleted=1">{deleted === "1" ? "[已删除]" : "已删除"}</Link>
          <Link href="/admin/quests/new" className="btn primary">新增任务</Link>
        </nav>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">分类</th>
              <th scope="col">篇章</th>
              <th scope="col">进程</th>
              <th scope="col">状态</th>
              <th scope="col">修改日期</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {quests.map((quest) => (
              <tr key={quest.id}>
                <td>
                  <Link href={`/admin/quests/${quest.id}/edit`}>{quest.name}</Link>
                </td>
                <td>{QUEST_CATEGORY_LABELS[quest.category as QuestCategory]}</td>
                <td>{quest.chapter || "—"}</td>
                <td>{quest.stage || "—"}</td>
                <td><span className={`badge ${quest.status}`}>{quest.status === "published" ? "已发布" : "草稿"}</span></td>
                <td>{quest.updatedAt.slice(0, 10)}</td>
                <td>
                  {deleted === "1" ? (
                    <form action={restoreQuestAction}>
                      <input type="hidden" name="id" value={quest.id} />
                      <SubmitButton className="btn small" pendingLabel="恢复中…">恢复</SubmitButton>
                    </form>
                  ) : (
                    <form action={deleteQuestAction}>
                      <input type="hidden" name="id" value={quest.id} />
                      <SubmitButton className="btn small danger" pendingLabel="删除中…">删除</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {quests.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">暂无记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
