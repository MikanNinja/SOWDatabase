import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import QuestForm from "@/components/admin/QuestForm"
import { QUEST_CATEGORY_LABELS, type QuestCategory } from "@/lib/db/types"

export const dynamic = "force-dynamic"

export default async function EditQuestPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const store = await getStore()
  const quest = await store.getQuestById(id)
  if (!quest) notFound()

  const persons = (await store.listEntities({ type: "person" })).map((p) => ({
    id: p.id,
    name: p.name,
    aliases: p.aliases,
  }))
  const currentPersons = await store.getQuestCharacters(quest.id)
  const questTexts = await store.listTextEntries({ questId: quest.id })
  const quests = await store.listQuests({})

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 任务编辑</p>
        <h1>编辑任务：{quest.name}</h1>
        <div className="toolbar-links">
          <Link href={`/quests/${quest.slug}`} target="_blank">查看公开页面</Link>
        </div>
      </header>

      <QuestForm
        quest={quest}
        availablePersons={persons}
        availableQuests={quests}
        currentPersons={currentPersons}
      />

      <section className="record-section">
        <h2>所属文本（{questTexts.length}）</h2>
        {questTexts.length === 0 ? (
          <p className="muted">暂无所属文本。所属任务在后台各文本编辑页的“所属任务”字段维护，一篇文本至多属于一个任务。</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">来源</th>
                  <th scope="col">状态</th>
                </tr>
              </thead>
              <tbody>
                {questTexts.map((text) => (
                  <tr key={text.id}>
                    <td><Link href={`/admin/texts/${text.id}/edit`}>{text.title}</Link></td>
                    <td>{text.sourceCategory || "—"}{text.sourceName ? ` · ${text.sourceName}` : ""}</td>
                    <td><span className={`badge ${text.status}`}>{text.status === "published" ? "已发布" : "草稿"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="record-section">
        <h2>出场人物（{currentPersons.length}）</h2>
        {currentPersons.length === 0 ? (
          <p className="muted">暂未关联人物。</p>
        ) : (
          <ul className="item-list">
            {currentPersons.map(({ personId, role }) => (
              <li key={personId}>
                <Link href={`/admin/entities/${personId}/edit`}>
                  {persons.find((p) => p.id === personId)?.name ?? personId}
                </Link>
                {role ? <span className="muted">（{role}）</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="record-section">
        <h2>任务信息</h2>
        <p className="item-meta">
          分类：{QUEST_CATEGORY_LABELS[quest.category as QuestCategory]}
          {quest.chapter ? ` · 篇章：${quest.chapter}` : ""}
          {quest.stage ? ` · 进程：${quest.stage}` : ""}
          {quest.sortOrder != null ? ` · 排序：${quest.sortOrder}` : ""}
          <span className="muted">（创建于 {quest.createdAt.slice(0, 10)}）</span>
        </p>
      </section>
    </div>
  )
}
