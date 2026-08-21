import Link from "next/link"
import type { TextEntry } from "@/lib/db/types"
import { saveTextAction } from "@/app/admin/actions"

const CATEGORY_OPTIONS = ["主线任务", "角色信息", "世界探索", "NPC 日常", "其他"]

export default function TextForm({
  entry,
  categories,
}: {
  entry?: TextEntry | null
  categories: string[]
}) {
  const editing = Boolean(entry)
  const allCategories = [...new Set([...CATEGORY_OPTIONS, ...categories])]

  return (
    <form action={saveTextAction} className="form-grid form-grid-wide">
      {editing && <input type="hidden" name="id" value={entry!.id} />}

      <div className="text-form-meta">
        <div className="form-field">
          <label htmlFor="title">标题 *</label>
          <input type="text" id="title" name="title" required defaultValue={entry?.title ?? ""} />
        </div>
        <div className="form-field">
          <label htmlFor="sourceCategory">来源类别 *</label>
          <select id="sourceCategory" name="sourceCategory" defaultValue={entry?.sourceCategory ?? "其他"}>
            {allCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="sourceName">来源名称（任务、角色、区域、NPC 等）</label>
          <input type="text" id="sourceName" name="sourceName" defaultValue={entry?.sourceName ?? ""} />
        </div>
        <div className="form-field">
          <label htmlFor="ingameLocation">游戏内定位 *</label>
          <input
            type="text"
            id="ingameLocation"
            name="ingameLocation"
            required
            defaultValue={entry?.ingameLocation ?? ""}
          />
          <span className="hint">例如：区域、NPC、菜单路径、任务阶段等，用于读者回到游戏核对。</span>
        </div>
        <div className="form-field">
          <label htmlFor="triggerCondition">触发条件</label>
          <input
            type="text"
            id="triggerCondition"
            name="triggerCondition"
            defaultValue={entry?.triggerCondition ?? ""}
          />
        </div>
        <div className="form-field">
          <label htmlFor="slug">链接地址标识（可选）</label>
          <input type="text" id="slug" name="slug" defaultValue={entry?.slug ?? ""} />
          <span className="hint">留空时根据标题自动生成。</span>
        </div>
        <div className="form-field">
          <label htmlFor="status">发布状态</label>
          <select id="status" name="status" defaultValue={entry?.status ?? "draft"}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="note">补充说明</label>
        <textarea id="note" name="note" rows={3} defaultValue={entry?.note ?? ""} />
      </div>

      <div className="form-field form-field-full">
        <label htmlFor="body">正文（受限 Markdown）</label>
        <textarea
          id="body"
          name="body"
          rows={20}
          className="mono"
          defaultValue={entry?.body ?? ""}
          placeholder={"示例：\n\n他提到了[[沈砚|那个穿黑衣服的人]]。\n\n更多信息见[[文本:某段文本|相关记录]]。"}
        />
        <span className="hint">
          支持标题、段落、列表、引用、粗斜体；空行分隔段落；单个换行会被保留。
          内部链接：[[实体名]]、[[实体名|显示文字]]、[[文本:标题]]、[[文本:标题|显示文字]]。
        </span>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn primary">
          {editing ? "保存修改" : "创建"}
        </button>
        <Link href="/admin/texts" className="btn">取消</Link>
      </div>
    </form>
  )
}
