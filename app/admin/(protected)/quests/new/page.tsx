import QuestForm from "@/components/admin/QuestForm"
import { getStore } from "@/lib/db/store"

export const dynamic = "force-dynamic"

export default async function NewQuestPage() {
  const store = await getStore()
  const persons = (await store.listEntities({ type: "person" })).map((p) => ({
    id: p.id,
    name: p.name,
    aliases: p.aliases,
  }))
  const quests = await store.listQuests({})

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 任务</p>
        <h1>新增任务</h1>
      </header>
      <QuestForm availablePersons={persons} availableQuests={quests} />
    </div>
  )
}
