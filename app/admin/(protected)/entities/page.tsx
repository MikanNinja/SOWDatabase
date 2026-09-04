import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"
import { deleteEntityAction, restoreEntityAction } from "@/app/admin/actions"
import SubmitButton from "@/components/admin/SubmitButton"

export const dynamic = "force-dynamic"

export default async function AdminEntitiesPage(props: {
  searchParams: Promise<{ type?: string; q?: string; deleted?: string }>
}) {
  const { type, q, deleted } = await props.searchParams
  const store = await getStore()

  const typeFilter =
    type && ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])
      ? (type as (typeof ENTITY_TYPES)[number])
      : undefined

  const entities = await store.listEntities({
    type: typeFilter,
    search: q?.trim() || undefined,
    deletedOnly: deleted === "1",
  })

  return (
    <>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 实体</p>
        <h1>实体管理</h1>
        <p className="page-subtitle">当前列表 {entities.length} 条记录{deleted === "1" ? "（已删除）" : ""}。</p>
      </header>

      <div className="admin-toolbar">
        <form action="/admin/entities" method="get" className="search-form">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="搜索名称或别名" aria-label="搜索" />
          <input type="hidden" name="type" value={type ?? ""} />
          <input type="hidden" name="deleted" value={deleted ?? ""} />
          <button type="submit">检索</button>
        </form>
        <nav className="toolbar-links" aria-label="实体管理筛选">
          <Link href="/admin/entities">{!typeFilter && deleted !== "1" ? "[全部]" : "全部"}</Link>
          {ENTITY_TYPES.map((entityType) => (
            <Link key={entityType} href={`/admin/entities?type=${entityType}`}>
              {typeFilter === entityType ? `[${ENTITY_TYPE_LABELS[entityType]}]` : ENTITY_TYPE_LABELS[entityType]}
            </Link>
          ))}
          <Link href="/admin/entities?deleted=1">{deleted === "1" ? "[已删除]" : "已删除"}</Link>
          <Link href="/admin/entities/new" className="btn primary">新增实体</Link>
        </nav>
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">类型</th>
              <th scope="col">状态</th>
              <th scope="col">修改日期</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr key={entity.id}>
                <td>
                  <Link href={`/admin/entities/${entity.id}/edit`}>{entity.name}</Link>
                </td>
                <td>{ENTITY_TYPE_LABELS[entity.type]}</td>
                <td><span className={`badge ${entity.status}`}>{entity.status === "published" ? "已发布" : "草稿"}</span></td>
                <td>{entity.updatedAt.slice(0, 10)}</td>
                <td>
                  {deleted === "1" ? (
                    <form action={restoreEntityAction}>
                      <input type="hidden" name="id" value={entity.id} />
                      <SubmitButton className="btn small" pendingLabel="恢复中…">恢复</SubmitButton>
                    </form>
                  ) : (
                    <form action={deleteEntityAction}>
                      <input type="hidden" name="id" value={entity.id} />
                      <SubmitButton className="btn small danger" pendingLabel="删除中…">删除</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {entities.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">暂无记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
