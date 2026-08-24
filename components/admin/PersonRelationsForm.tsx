"use client"

import { useState } from "react"
import type { Entity, PersonRelation } from "@/lib/db/types"
import { saveRelationAction, deleteRelationAction } from "@/app/admin/actions"

interface RelationDisplay {
  relation: PersonRelation
  otherPerson: Entity
  perspective: "from" | "to"
  label: string
  isReverseFallback: boolean
}

export default function PersonRelationsForm({
  personId,
  persons,
  relations,
}: {
  personId: string
  persons: Entity[]
  relations: RelationDisplay[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fromId, setFromId] = useState(personId)
  const [toId, setToId] = useState("")
  const [kind, setKind] = useState("")
  const [reverseKind, setReverseKind] = useState("")

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setFromId(personId)
    setToId("")
    setKind("")
    setReverseKind("")
  }

  function startEdit(r: RelationDisplay) {
    setEditingId(r.relation.id)
    setFromId(r.relation.fromId)
    setToId(r.relation.toId)
    setKind(r.relation.kind)
    setReverseKind(r.relation.reverseKind)
    setShowForm(true)
  }

  return (
    <div>
      {relations.length > 0 && (
        <ul className="item-list">
          {relations.map((r) => (
            <li key={r.relation.id}>
              <strong>{r.otherPerson.name}</strong>
              <span className="muted"> — {r.label}{r.isReverseFallback ? "（反向）" : ""}</span>
              <span className="relation-actions">
                <button
                  type="button"
                  className="btn small"
                  onClick={() => startEdit(r)}
                >
                  编辑
                </button>
                <form action={deleteRelationAction} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={r.relation.id} />
                  <input type="hidden" name="entityId" value={personId} />
                  <button type="submit" className="btn small danger">删除</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!showForm && (
        <button type="button" className="btn small" onClick={() => setShowForm(true)}>
          + 添加关系
        </button>
      )}

      {showForm && (
        <form action={saveRelationAction} className="form-grid relation-form">
          {editingId && <input type="hidden" name="id" value={editingId} />}
          <input type="hidden" name="entityId" value={personId} />
          <div className="form-field">
            <label htmlFor="fromId">关系主体（from）</label>
            <select
              id="fromId"
              name="fromId"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="toId">关系客体（to）</label>
            <select
              id="toId"
              name="toId"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              required
            >
              <option value="">— 选择人物 —</option>
              {persons.filter((p) => p.id !== fromId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="kind">正向称呼（from 对 to）*</label>
            <input
              type="text"
              id="kind"
              name="kind"
              required
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="如：师父、父亲、宿敌"
            />
          </div>
          <div className="form-field">
            <label htmlFor="reverseKind">反向称呼（to 对 from）</label>
            <input
              type="text"
              id="reverseKind"
              name="reverseKind"
              value={reverseKind}
              onChange={(e) => setReverseKind(e.target.value)}
              placeholder="如：徒弟、子女；留空时回退为正向并标注（反向）"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              {editingId ? "保存修改" : "创建关系"}
            </button>
            <button type="button" className="btn" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
