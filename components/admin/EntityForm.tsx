import Link from "next/link"
import { ENTITY_TYPE_LABELS, ENTITY_TYPES } from "@/lib/db/types"
import type { Entity } from "@/lib/db/types"
import { saveEntityAction } from "@/app/admin/actions"

export default function EntityForm({
  entity,
  defaultType,
}: {
  entity?: Entity | null
  defaultType?: string
}) {
  const editing = Boolean(entity)
  return (
    <form action={saveEntityAction} className="form-grid">
      {editing && <input type="hidden" name="id" value={entity!.id} />}
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
          <select id="type" name="type" defaultValue={entity?.type ?? defaultType ?? "person"}>
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
