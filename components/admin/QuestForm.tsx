"use client"

import { useState } from "react"
import Link from "next/link"
import { QUEST_CATEGORIES, QUEST_CATEGORY_LABELS } from "@/lib/db/types"
import type { Quest, QuestCharacter } from "@/lib/db/types"
import { saveQuestAction } from "@/app/admin/actions"
import SubmitButton from "@/components/admin/SubmitButton"

interface PersonOption {
  id: string
  name: string
  aliases: string[]
}

interface PersonRow {
  personId: string
  role: string
}

export default function QuestForm({
  quest,
  availablePersons,
  currentPersons = [],
}: {
  quest?: Quest | null
  availablePersons: PersonOption[]
  currentPersons?: QuestCharacter[]
}) {
  const editing = Boolean(quest)

  const [persons, setPersons] = useState<PersonRow[]>(
    (currentPersons ?? []).map((p) => ({ personId: p.personId, role: p.role }))
  )

  function addPerson() {
    setPersons((prev) => [...prev, { personId: "", role: "" }])
  }
  function removePerson(index: number) {
    setPersons((prev) => prev.filter((_, i) => i !== index))
  }
  function updatePerson(index: number, field: "personId" | "role", value: string) {
    setPersons((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const personsJson = JSON.stringify(
    persons.filter((p) => p.personId).map((p) => ({ personId: p.personId, role: p.role }))
  )

  return (
    <form action={saveQuestAction} className="form-grid" autoComplete="off">
      {editing && <input type="hidden" name="id" value={quest!.id} />}
      <div className="entity-form-meta">
        <div className="form-field">
          <label htmlFor="name">标准名称 *</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            defaultValue={quest?.name ?? ""}
          />
          <span className="hint">任务的标准名必须唯一（任务之间互斥）。</span>
        </div>
        <div className="form-field">
          <label htmlFor="category">任务分类 *</label>
          <select id="category" name="category" defaultValue={quest?.category ?? "main"}>
            {QUEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {QUEST_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="slug">链接地址标识（可选）</label>
          <input
            type="text"
            id="slug"
            name="slug"
            defaultValue={quest?.slug ?? ""}
          />
          <span className="hint">留空时根据名称自动生成。改名后保持此项不变可避免链接失效。</span>
        </div>
        <div className="form-field">
          <label htmlFor="status">发布状态</label>
          <select id="status" name="status" defaultValue={quest?.status ?? "published"}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
          <span className="hint">草稿任务在公开页与检索中隐形。</span>
        </div>
      </div>

      <div className="form-field-pair">
        <div className="form-field">
          <label htmlFor="chapter">篇章</label>
          <input
            type="text"
            id="chapter"
            name="chapter"
            defaultValue={quest?.chapter ?? ""}
            placeholder="如：第一章；角色名-篇章I"
          />
          <span className="hint"></span>
        </div>
        <div className="form-field">
          <label htmlFor="stage">进程</label>
          <input
            type="text"
            id="stage"
            name="stage"
            defaultValue={quest?.stage ?? ""}
            placeholder="如：进程I：碎裂大地"
          />
          <span className="hint"></span>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="sortOrder">展示排序</label>
        <input
          type="number"
          id="sortOrder"
          name="sortOrder"
          defaultValue={quest?.sortOrder ?? ""}
          aria-label="展示排序"
        />
        <span className="hint">可空；同分类内从小到大展示。</span>
      </div>

      <input type="hidden" name="persons" value={personsJson} />
      <div className="form-field">
        <label>出场人物</label>
        <div className="multi-row-editor">
          {persons.length === 0 && (
            <p className="muted">暂未关联人物。</p>
          )}
          {persons.map((row, index) => (
            <div key={index} className="multi-row">
              <select
                value={row.personId}
                onChange={(e) => updatePerson(index, "personId", e.target.value)}
                aria-label={`出场人物 ${index + 1}`}
              >
                <option value="">— 选择人物 —</option>
                {availablePersons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.aliases.length > 0 ? `（${p.aliases.join("、")}）` : ""}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={row.role}
                onChange={(e) => updatePerson(index, "role", e.target.value)}
                placeholder="角色/备注（如：委托人、队友）"
                aria-label={`任务角色备注 ${index + 1}`}
              />
              <button
                type="button"
                className="btn small danger"
                onClick={() => removePerson(index)}
              >
                移除
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={addPerson}>
            + 添加人物
          </button>
        </div>
        <span className="hint">保存时全量替换出场人物列表。</span>
      </div>

      <div className="form-field">
        <label htmlFor="note">补充说明（支持受限 Markdown）</label>
        <textarea id="note" name="note" rows={4} defaultValue={quest?.note ?? ""} />
      </div>

      <div className="form-actions">
        <SubmitButton>{editing ? "保存修改" : "创建"}</SubmitButton>
        <Link href="/admin/quests" className="btn">
          取消
        </Link>
      </div>
    </form>
  )
}
