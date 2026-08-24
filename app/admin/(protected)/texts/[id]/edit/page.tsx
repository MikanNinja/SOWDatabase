import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import TextForm from "@/components/admin/TextForm"
import TextAssociationsForm from "@/components/admin/TextAssociationsForm"
import { renderEntryBlocks } from "@/lib/render"
import { computeLinkIssues } from "@/lib/links"
import { ENTITY_TYPE_LABELS } from "@/lib/db/types"
import { setManualLinksAction, batchManualLinksAction } from "@/app/admin/actions"

export const dynamic = "force-dynamic"

const ISSUE_LABEL = {
  invalid: "格式错误",
  not_found: "未找到目标",
  ambiguous: "目标不唯一，需要指定",
} as const

export default async function EditTextPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const store = await getStore()
  const entry = await store.getTextEntryById(id)
  if (!entry) notFound()

  const categories = await store.listTextCategories()
  const blocksWithLinks = await store.getEntryBlocks(entry.id)
  const rendered = await renderEntryBlocks(store, blocksWithLinks)
  const issues = await computeLinkIssues(store, entry.body)
  const entities = await store.listEntities({})
  const entitiesByType = {
    person: entities.filter((entity) => entity.type === "person"),
    place: entities.filter((entity) => entity.type === "place"),
    faction: entities.filter((entity) => entity.type === "faction"),
  }
  const manualLinksByBlock = new Map<string, Set<string>>()
  for (const { block, links } of blocksWithLinks) {
    manualLinksByBlock.set(
      block.id,
      new Set(links.filter((link) => link.source === "manual").map((link) => link.targetId))
    )
  }

  // v2：加载整篇级关联
  const currentAssociations = await store.getTextEntityAssociations(entry.id)
  const entityOptions = entities.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    aliases: e.aliases,
  }))

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 文本编辑</p>
        <h1>编辑文本：{entry.title}</h1>
        <div className="toolbar-links">
          <Link href={`/texts/${entry.slug}`} target="_blank">查看公开页面</Link>
        </div>
      </header>

      <TextForm entry={entry} categories={categories} />

      {issues.length > 0 && (
        <div className="alert warn">
          <strong>内部链接待处理（{issues.length}）：</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>
                <code>{issue.raw}</code>：{ISSUE_LABEL[issue.reason]}
                {issue.reason === "ambiguous" && issue.candidates.length > 0 && (
                  <span className="muted">
                    （候选：{issue.candidates.map((candidate) => candidate.label).join("、")}）
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">发布前请修正这些链接，公开页面不会显示指向不存在页面的链接。</p>
        </div>
      )}

      {/* v2：整篇级关联 */}
      <section className="record-section">
        <h2>整篇关联</h2>
        <p className="hint">标记整篇文本都与某实体相关。标记后，该文本在实体页面的“长篇资料”区仅显示标题与定位，不展开段落片段。</p>
        <TextAssociationsForm
          entryId={entry.id}
          entities={entityOptions}
          currentAssociations={currentAssociations}
        />
      </section>

      <section className="record-section">
        <h2>批量关联</h2>
        <form action={batchManualLinksAction} className="form-grid batch-link-form">
          <input type="hidden" name="entryId" value={entry.id} />
          <div className="form-field">
            <label htmlFor="batchEntity">选择实体</label>
            <select id="batchEntity" name="entityIds">
              {(["person", "place", "faction"] as const).map((type) => (
                <optgroup key={type} label={ENTITY_TYPE_LABELS[type]}>
                  {entitiesByType[type].map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                      {entity.aliases.length > 0 ? `（${entity.aliases.join("、")}）` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn">添加到所有段落</button>
          </div>
        </form>
      </section>

      <section className="record-section">
        <h2>段落与关联</h2>
        {blocksWithLinks.length === 0 ? (
          <p className="empty">正文尚未保存，或没有可拆分的段落。</p>
        ) : (
          blocksWithLinks.map(({ block, links }) => {
            const linked = manualLinksByBlock.get(block.id) ?? new Set<string>()
            const inlineLinked = links.filter((link) => link.source === "inline")
            const renderedBlock = rendered.find((item) => item.blockId === block.id)
            return (
              <article key={block.id} className="block-card" id={`edit-block-${block.id}`}>
                <div className="block-head">
                  <span>段落 {block.ordinal + 1} · {block.kind}</span>
                  <span>内联链接 {inlineLinked.length} · 手动关联 {linked.size}</span>
                </div>
                <div
                  className="prose block-body"
                  dangerouslySetInnerHTML={{ __html: renderedBlock?.html ?? "" }}
                />
                <form action={setManualLinksAction} className="block-entities">
                  <input type="hidden" name="blockId" value={block.id} />
                  <input type="hidden" name="entryId" value={entry.id} />
                  <details>
                    <summary>编辑手动关联的实体</summary>
                    <div className="manual-link-list">
                      {(["person", "place", "faction"] as const).map((type) => (
                        <fieldset key={type} className="manual-link-group">
                          <legend className="manual-link-title">{ENTITY_TYPE_LABELS[type]}</legend>
                          {entitiesByType[type].length === 0 ? (
                            <span className="muted">无</span>
                          ) : (
                            <div className="manual-link-options">
                              {entitiesByType[type].map((entity) => (
                                <label key={entity.id} className="manual-link-option">
                                  <input
                                    type="checkbox"
                                    name="entityIds"
                                    value={entity.id}
                                    defaultChecked={linked.has(entity.id)}
                                  />{" "}
                                  {entity.name}
                                </label>
                              ))}
                            </div>
                          )}
                        </fieldset>
                      ))}
                    </div>
                    <button type="submit" className="btn small">保存本段关联</button>
                  </details>
                </form>
              </article>
            )
          })
        )}
      </section>

      <section className="record-section">
        <h2>正文预览</h2>
        <div className="preview-box prose">
          {rendered.length === 0 ? (
            <p className="empty">暂无预览。</p>
          ) : (
            rendered.map((block) => (
              <div key={block.blockId} id={`preview-block-${block.blockId}`}>
                <div dangerouslySetInnerHTML={{ __html: block.html }} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
