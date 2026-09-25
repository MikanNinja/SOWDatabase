import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { QUEST_CATEGORY_LABELS } from "@/lib/db/types"
import type { QuestCategory } from "@/lib/db/types"
import { renderMarkdownContent } from "@/lib/render"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamicParams = false

export async function generateStaticParams() {
  const store = await getStore()
  const quests = await store.listQuests({ status: "published" })
  return quests.map((quest) => ({ slug: quest.slug }))
}

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const slug = decodeSlug((await props.params).slug)
  const store = await getStore()
  const quest = await store.getQuestBySlug(slug)
  if (!quest) {
    return {}
  }
  return { title: quest.name }
}

export default async function QuestDetailPage(props: {
  params: Promise<{ slug: string }>
}) {
  const { slug: rawSlug } = await props.params
  const slug = decodeSlug(rawSlug)
  const store = await getStore()

  const quest = await store.getQuestBySlug(slug)
  if (!quest) {
    notFound()
  }

  // 出场人物（仅已发布人物，镜像势力"成员"的过滤方式）
  const questCharacters: { personId: string; role: string; personName: string; personSlug: string }[] = []
  const qcs = await store.getQuestCharacters(quest.id)
  for (const qc of qcs) {
    const person = await store.getEntityById(qc.personId)
    if (person && person.status === "published") {
      questCharacters.push({
        personId: qc.personId,
        role: qc.role,
        personName: person.name,
        personSlug: person.slug,
      })
    }
  }

  // 所属文本（一对多：仅已发布文本）
  const questTexts = await store.listTextEntries({ questId: quest.id, status: "published" })

  const noteHtml = await renderMarkdownContent(store, quest.note, { publicOnly: true })

  const metaRows: { label: string; value: React.ReactNode }[] = [
    { label: "任务分类", value: QUEST_CATEGORY_LABELS[quest.category as QuestCategory] },
  ]
  if (quest.chapter) {
    metaRows.push({ label: "篇章", value: quest.chapter })
  }
  if (quest.stage) {
    metaRows.push({ label: "进程", value: quest.stage })
  }
  if (questCharacters.length > 0) {
    metaRows.push({
      label: `出场人物（${questCharacters.length}）`,
      value: questCharacters.map(({ personId, role, personName, personSlug }, i) => (
        <span key={personId}>
          {i > 0 && " • "}
          <Link href={`/entities/person/${personSlug}`}>{personName}</Link>
          {role ? <span className="muted">（{role}）</span> : null}
        </span>
      )),
    })
  }

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "任务", href: "/quests" }, { label: quest.name }]} />
        <h1 className="page-title">{quest.name}</h1>
      </header>

      <dl className="record-meta">
        {metaRows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {quest.note ? (
        <section className="record-section">
          <h2>补充说明</h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: noteHtml }} />
        </section>
      ) : null}

      <section className="record-section">
        <h2>
          所属文本 <span className="index-note">（{questTexts.length} 条文本）</span>
        </h2>
        {questTexts.length === 0 ? (
          <p className="empty">暂无所属文本。</p>
        ) : (
          <div className="table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col">文本</th>
                  <th scope="col">来源与定位</th>
                </tr>
              </thead>
              <tbody>
                {questTexts.map((text) => (
                  <tr key={text.id}>
                    <td>
                      <Link href={`/texts/${text.slug}`}>{text.title}</Link>
                    </td>
                    <td>
                      {text.sourceCategory || "—"}
                      {text.sourceName ? ` · ${text.sourceName}` : ""}
                      {text.ingameLocation ? <div className="item-meta">{text.ingameLocation}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
