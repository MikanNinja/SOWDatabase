"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { ENTITY_TYPE_LABELS, type EntityType, type QuestCategory } from "@/lib/db/types"

interface IndexEntity {
  name: string
  aliases: string[]
  type: EntityType
  slug: string
  intro: string
}

interface IndexQuest {
  name: string
  slug: string
  category: QuestCategory
  chapter: string
  stage: string
}

interface SearchIndex {
  entities: IndexEntity[]
  quests: IndexQuest[]
}

function SearchResultsInner() {
  const searchParams = useSearchParams()
  const query = (searchParams.get("q") ?? "").trim()
  const needle = query.toLowerCase()
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!needle) return
    let alive = true
    fetch("/search-index.json")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<SearchIndex>
      })
      .then((data) => {
        if (alive) setIndex(data)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [needle])

  if (!query) {
    return <p className="empty">输入关键词开始检索。</p>
  }
  if (failed) {
    return <p className="empty">检索索引加载失败，请刷新重试。</p>
  }
  if (!index) {
    return <p className="empty">检索中……</p>
  }

  const results = index.entities.filter(
    (entity) =>
      entity.name.toLowerCase().includes(needle) ||
      entity.aliases.some((alias) => alias.toLowerCase().includes(needle))
  )
  const questResults = index.quests.filter((quest) =>
    quest.name.toLowerCase().includes(needle)
  )

  if (results.length === 0 && questResults.length === 0) {
    return <p className="empty">没有找到与“{query}”匹配的已发布记录。</p>
  }

  const grouped: Record<EntityType, IndexEntity[]> = {
    person: results.filter((result) => result.type === "person"),
    place: results.filter((result) => result.type === "place"),
    faction: results.filter((result) => result.type === "faction"),
  }

  return (
    <section className="record-section">
      <h2>检索结果（{results.length + questResults.length}）</h2>
      {(["person", "place", "faction"] as const).map((type) => {
        const items = grouped[type]
        if (items.length === 0) return null
        return (
          <section key={type} className="record-section">
            <h3>
              {ENTITY_TYPE_LABELS[type]}（{items.length}）
            </h3>
            <div className="table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th scope="col">标准名称</th>
                    <th scope="col">简介</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entity) => (
                    <tr key={entity.slug}>
                      <td>
                        <Link href={`/entities/${entity.type}/${entity.slug}`}>
                          {entity.name}
                        </Link>
                      </td>
                      <td>{entity.intro ? entity.intro.slice(0, 120) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
      {questResults.length > 0 && (
        <section className="record-section">
          <h3>任务（{questResults.length}）</h3>
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
                {questResults.map((quest) => (
                  <tr key={quest.slug}>
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
      )}
    </section>
  )
}

export default function SearchResults() {
  return (
    <Suspense fallback={null}>
      <SearchResultsInner />
    </Suspense>
  )
}
