import type { Metadata } from "next"
import Link from "next/link"
import { getStore } from "@/lib/db/store"
import { QUEST_CATEGORIES, QUEST_CATEGORY_LABELS } from "@/lib/db/types"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamicParams = false

export const metadata: Metadata = {
  title: "任务列表",
}

export default async function QuestListPage() {
  const store = await getStore()
  const quests = await store.listQuests({ status: "published" })

  const grouped = QUEST_CATEGORIES.map((category) => ({
    category,
    label: QUEST_CATEGORY_LABELS[category],
    items: quests.filter((quest) => quest.category === category),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "任务" }]} />
        <h1 className="page-title">任务</h1>
        <p className="page-subtitle">共 {quests.length} 条已发布任务</p>
      </header>

      {quests.length === 0 ? (
        <p className="empty">暂无已发布任务。</p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="record-section">
            <h2>
              {group.label} <span className="index-note">（{group.items.length}）</span>
            </h2>
            <div className="table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th scope="col">任务名称</th>
                    <th scope="col">篇章</th>
                    <th scope="col">进程</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((quest) => (
                    <tr key={quest.id}>
                      <td>
                        <Link href={`/quests/${quest.slug}`}>{quest.name}</Link>
                      </td>
                      <td>{quest.chapter || "—"}</td>
                      <td>{quest.stage || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  )
}
