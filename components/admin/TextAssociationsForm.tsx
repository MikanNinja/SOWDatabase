"use client"

import { useState } from "react"
import type { TextEntityAssociation } from "@/lib/db/types"
import { saveTextAssociationsAction } from "@/app/admin/actions"

interface AssociationRow {
  targetId: string
  note: string
}

interface EntityOption {
  id: string
  name: string
  type: string
  aliases: string[]
}

export default function TextAssociationsForm({
  entryId,
  entities,
  currentAssociations,
}: {
  entryId: string
  entities: EntityOption[]
  currentAssociations: TextEntityAssociation[]
}) {
  const [rows, setRows] = useState<AssociationRow[]>(
    currentAssociations.map((a) => ({ targetId: a.targetId, note: a.note }))
  )

  function addRow() {
    setRows((prev) => [...prev, { targetId: "", note: "" }])
  }
  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }
  function updateRow(index: number, field: "targetId" | "note", value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const associationsJson = JSON.stringify(
    rows.filter((r) => r.targetId).map((r) => ({ targetId: r.targetId, note: r.note }))
  )

  return (
    <form action={saveTextAssociationsAction} className="form-grid">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="associations" value={associationsJson} />
      <div className="multi-row-editor">
        {rows.length === 0 && (
          <p className="muted">暂未添加整篇关联。</p>
        )}
        {rows.map((row, index) => (
          <div key={index} className="multi-row">
            <select
              value={row.targetId}
              onChange={(e) => updateRow(index, "targetId", e.target.value)}
              aria-label={`整篇关联目标 ${index + 1}`}
            >
              <option value="">— 选择实体 —</option>
              {(["person", "place", "faction"] as const).map((type) => (
                <optgroup key={type} label={type === "person" ? "人物" : type === "place" ? "地点" : "势力"}>
                  {entities
                    .filter((e) => e.type === type)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.aliases.length > 0 ? `（${e.aliases.join("、")}）` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text"
              value={row.note}
              onChange={(e) => updateRow(index, "note", e.target.value)}
              placeholder="备注（如：通篇背景为该势力活动区域）"
              aria-label={`备注 ${index + 1}`}
            />
            <button
              type="button"
              className="btn small danger"
              onClick={() => removeRow(index)}
            >
              移除
            </button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={addRow}>
          + 添加整篇关联
        </button>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary">保存整篇关联</button>
      </div>
    </form>
  )
}
