"use client"

import { useState } from "react"
import Link from "next/link"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"
import type { Entity, EntityFaction } from "@/lib/db/types"
import { saveEntityAction } from "@/app/admin/actions"

interface FactionOption {
  id: string
  name: string
  aliases: string[]
}

interface FactionRow {
  factionId: string
  role: string
}

export default function EntityForm({
  entity,
  defaultType,
  availableFactions,
  availableParents,
  currentFactions,
}: {
  entity?: Entity | null
  defaultType?: string
  availableFactions: FactionOption[]
  availableParents: Entity[]
  currentFactions?: EntityFaction[]
}) {
  const editing = Boolean(entity)
  const entityType = entity?.type ?? defaultType ?? "person"

  const [type, setType] = useState(entityType)
  const [factions, setFactions] = useState<FactionRow[]>(
    (currentFactions ?? []).map((f) => ({ factionId: f.factionId, role: f.role }))
  )

  function addFaction() {
    setFactions((prev) => [...prev, { factionId: "", role: "" }])
  }
  function removeFaction(index: number) {
    setFactions((prev) => prev.filter((_, i) => i !== index))
  }
  function updateFaction(index: number, field: "factionId" | "role", value: string) {
    setFactions((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const factionsJson = JSON.stringify(
    factions.filter((f) => f.factionId).map((f) => ({ factionId: f.factionId, role: f.role }))
  )

  return (
    <form action={saveEntityAction} className="form-grid">
      {editing && <input type="hidden" name="id" value={entity!.id} />}
      <input type="hidden" name="factions" value={factionsJson} />
      <div className="entity-form-meta">
        <div className="form-field">
          <label htmlFor="name">标准名称 *</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            defaultValue={entity?.name ?? ""}
          />
        </div>
        <div className="form-field">
          <label htmlFor="type">类型 *</label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
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
            defaultValue={entity?.slug ?? ""}
          />
          <span className="hint">留空时根据名称自动生成。改名后保持此项不变可避免链接失效。</span>
        </div>
        <div className="form-field">
          <label htmlFor="status">发布状态</label>
          <select id="status" name="status" defaultValue={entity?.status ?? "draft"}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </div>
      </div>

      {/* 人物专属字段 */}
      {type === "person" && (
        <>
          <div className="form-field">
            <label htmlFor="race">种族</label>
            <input
              type="text"
              id="race"
              name="race"
              defaultValue={entity?.race ?? ""}
              placeholder="如：人族、妖族、机关族"
            />
            <span className="hint">单值自由文字，可留空。</span>
          </div>

          <div className="form-field">
            <label>所属势力</label>
            <div className="multi-row-editor">
              {factions.length === 0 && (
                <p className="muted">暂未关联势力。</p>
              )}
              {factions.map((row, index) => (
                <div key={index} className="multi-row">
                  <select
                    value={row.factionId}
                    onChange={(e) => updateFaction(index, "factionId", e.target.value)}
                    aria-label={`所属势力 ${index + 1}`}
                  >
                    <option value="">— 选择势力 —</option>
                    {availableFactions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.aliases.length > 0 ? `（${f.aliases.join("、")}）` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.role}
                    onChange={(e) => updateFaction(index, "role", e.target.value)}
                    placeholder="角色/备注（如：长老、卧底）"
                    aria-label={`角色备注 ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => removeFaction(index)}
                  >
                    移除
                  </button>
                </div>
              ))}
              <button type="button" className="btn small" onClick={addFaction}>
                + 添加势力
              </button>
            </div>
          </div>
        </>
      )}

      {/* 地点/势力专属字段：上级 */}
      {(type === "place" || type === "faction") && (
        <div className="form-field">
          <label htmlFor="parentId">上级{ENTITY_TYPE_LABELS[type]}</label>
          <select
            id="parentId"
            name="parentId"
            defaultValue={entity?.parentId ?? ""}
          >
            <option value="">— 无（顶层） —</option>
            {availableParents
              .filter((p) => p.type === type && p.id !== entity?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.aliases.length > 0 ? `（${p.aliases.join("、")}）` : ""}
                </option>
              ))}
          </select>
          <span className="hint">上级必须是同类型实体；不能将自身或后代设为上级。</span>
        </div>
      )}

      <div className="form-field">
        <label htmlFor="aliases">别名（每行一个）</label>
        <textarea
          id="aliases"
          name="aliases"
          rows={4}
          defaultValue={entity?.aliases.join("\n") ?? ""}
        />
      </div>
      {editing && (
        <div className="form-field">
          <label>
            <input type="checkbox" name="keepOldNameAsAlias" defaultChecked />
            <span className="checkbox-label">将旧名称“{entity!.name}”自动加入别名</span>
          </label>
        </div>
      )}
      <div className="form-field">
        <label htmlFor="intro">简介（支持受限 Markdown 与内部链接）</label>
        <textarea id="intro" name="intro" rows={4} defaultValue={entity?.intro ?? ""} />
      </div>
      <div className="form-field">
        <label htmlFor="note">补充说明（支持受限 Markdown）</label>
        <textarea id="note" name="note" rows={4} defaultValue={entity?.note ?? ""} />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary">
          {editing ? "保存修改" : "创建"}
        </button>
        <Link href="/admin/entities" className="btn">
          取消
        </Link>
      </div>
    </form>
  )
}
