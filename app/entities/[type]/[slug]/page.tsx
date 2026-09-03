import Link from "next/link"
import { notFound } from "next/navigation"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPE_LABELS } from "@/lib/db/types"
import { renderEntryBlocks, renderMarkdownContent } from "@/lib/render"
import Breadcrumb from "@/components/Breadcrumb"

export const dynamic = "force-dynamic"

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 将不全的年月日拼成展示串；约数加“约”前缀；全空返回空串 */
function formatPartialDate(d: {
  year: number | null | undefined
  month: number | null | undefined
  day: number | null | undefined
  circa: boolean | undefined
}): string {
  const parts: string[] = []
  if (d.year != null) parts.push(`${d.year}年`)
  if (d.month != null) parts.push(`${d.month}月`)
  if (d.day != null) parts.push(`${d.day}日`)
  if (parts.length === 0) return ""
  return d.circa ? `约 ${parts.join("")}` : parts.join("")
}

export default async function EntityDetailPage(props: {
  params: Promise<{ type: string; slug: string }>
}) {
  const { type, slug: rawSlug } = await props.params
  const slug = decodeSlug(rawSlug)
  const store = await getStore()

  if (!(type in ENTITY_TYPE_LABELS)) {
    notFound()
  }

  const entity = await store.getEntityBySlug(slug)
  if (!entity || entity.type !== type) {
    notFound()
  }

  // v2：整篇级关联——"长篇资料"区，需在过滤"相关文本"前获取
  const wholeEntryTexts = await store.getWholeEntryTextsForEntity(entity.id)
  const wholeEntryIds = await store.getWholeEntryIdsForEntity(entity.id)

  const related = await store.getRelatedBlocksForEntity(entity.id)
  // v2：排除有整篇级关联的文本（它们归入"长篇资料"区，不在"相关文本"中重复）
  const relatedFiltered = related.filter((item) => !wholeEntryIds.has(item.entryId))
  const entryIds = [...new Set(relatedFiltered.map((item) => item.entryId))]
  const entryBlocks = new Map<string, Map<string, string>>()
  for (const entryId of entryIds) {
    const blocksWithLinks = await store.getEntryBlocks(entryId)
    const rendered = await renderEntryBlocks(store, blocksWithLinks, { publicOnly: true })
    entryBlocks.set(entryId, new Map(rendered.map((item) => [item.blockId, item.html])))
  }

  const introHtml = await renderMarkdownContent(store, entity.intro, { publicOnly: true })
  const noteHtml = await renderMarkdownContent(store, entity.note, { publicOnly: true })

  // v2：类型专属属性
  const factions: { factionId: string; role: string; factionName: string; factionSlug: string }[] = []
  if (entity.type === "person") {
    const facs = await store.getEntityFactions(entity.id)
    for (const f of facs) {
      const facEntity = await store.getEntityById(f.factionId)
      if (facEntity && facEntity.status === "published") {
        factions.push({
          factionId: f.factionId,
          role: f.role,
          factionName: facEntity.name,
          factionSlug: facEntity.slug,
        })
      }
    }
  }

  // v2：层级（地点/势力）
  const ancestors = (entity.type === "place" || entity.type === "faction")
    ? await store.getEntityAncestors(entity.id, { publicOnly: true })
    : []
  const children = (entity.type === "place" || entity.type === "faction")
    ? await store.getEntityChildren(entity.id, { status: "published" })
    : []

  // v2：势力成员
  const members = entity.type === "faction"
    ? await store.getFactionMembers(entity.id)
        .then((list) => list.filter((m) => m.entity.status === "published"))
    : []

  // v2：人物关系（双向展示，仅已发布人物）
  const relations = entity.type === "person"
    ? (await store.getRelationsForPerson(entity.id))
        .filter((r) => r.otherPerson.status === "published")
    : []

  // 构建面包屑项（层级 + 类型 + 当前实体）
  const breadcrumbItems = [
    { label: ENTITY_TYPE_LABELS[entity.type], href: `/entities/${entity.type}` },
    ...ancestors.map((a) => ({ label: a.name, href: `/entities/${a.type}/${a.slug}` })),
    { label: entity.name },
  ]

  // v3：出生地/死亡地关联实体（已发布才显示链接，否则回退自由文本）
  const birthPlace =
    entity.birthPlaceId && entity.type === "person"
      ? await store.getEntityById(entity.birthPlaceId)
      : null
  const deathPlace =
    entity.deathPlaceId && entity.type === "person"
      ? await store.getEntityById(entity.deathPlaceId)
      : null

  // 元信息表行（按实体类型条件渲染）
  type MetaRow = { label: string; value: React.ReactNode }
  const metaRows: MetaRow[] = []

  if (entity.aliases.length > 0) {
    metaRows.push({ label: "别名", value: entity.aliases.join(" • ") })
  }

  if (entity.type === "person") {
    if (entity.race) {
      metaRows.push({ label: "种族", value: entity.race })
    }
    if (factions.length > 0) {
      metaRows.push({
        label: "所属势力",
        value: factions.map((f, i) => (
          <span key={f.factionId}>
            {i > 0 && " • "}
            <Link href={`/entities/faction/${f.factionSlug}`}>{f.factionName}</Link>
            {f.role ? <span className="muted">（{f.role}）</span> : null}
          </span>
        )),
      })
    }

    const birthDate = formatPartialDate({
      year: entity.birthYear,
      month: entity.birthMonth,
      day: entity.birthDay,
      circa: entity.birthCirca,
    })
    if (birthDate) {
      metaRows.push({ label: "出生日期", value: birthDate })
    }
    const deathDate = formatPartialDate({
      year: entity.deathYear,
      month: entity.deathMonth,
      day: entity.deathDay,
      circa: entity.deathCirca,
    })
    if (deathDate) {
      metaRows.push({ label: "死亡日期", value: deathDate })
    }
    if (entity.birthPlaceId && birthPlace && birthPlace.status === "published") {
      metaRows.push({
        label: "出生于",
        value: <Link href={`/entities/place/${birthPlace.slug}`}>{birthPlace.name}</Link>,
      })
    } else if (entity.birthPlaceFree) {
      metaRows.push({ label: "出生于", value: entity.birthPlaceFree })
    }
    if (entity.deathPlaceId && deathPlace && deathPlace.status === "published") {
      metaRows.push({
        label: "死亡于",
        value: <Link href={`/entities/place/${deathPlace.slug}`}>{deathPlace.name}</Link>,
      })
    } else if (entity.deathPlaceFree) {
      metaRows.push({ label: "死亡于", value: entity.deathPlaceFree })
    }
  }

  if (entity.type === "place" || entity.type === "faction") {
    if (ancestors.length > 0) {
      metaRows.push({
        label: "上级",
        value: ancestors.map((a, i) => (
          <span key={a.id}>
            {i > 0 && " › "}
            <Link href={`/entities/${a.type}/${a.slug}`}>{a.name}</Link>
          </span>
        )),
      })
    }
    if (children.length > 0) {
      metaRows.push({
        label: `下级${ENTITY_TYPE_LABELS[entity.type]}`,
        value: children.map((c, i) => (
          <span key={c.id}>
            {i > 0 && " • "}
            <Link href={`/entities/${c.type}/${c.slug}`}>{c.name}</Link>
          </span>
        )),
      })
    }
  }

  if (entity.type === "faction" && members.length > 0) {
    metaRows.push({
      label: `成员（${members.length}）`,
      value: members.map(({ entity: member, role }, i) => (
        <span key={member.id}>
          {i > 0 && " • "}
          <Link href={`/entities/person/${member.slug}`}>{member.name}</Link>
          {role ? <span className="muted">（{role}）</span> : null}
        </span>
      )),
    })
  }

  if (entity.type === "person" && relations.length > 0) {
    metaRows.push({
      label: `人际关系（${relations.length}）`,
      value: (
        <>
          {relations.map((r) => (
            <div key={r.relation.id} className="meta-multi-line">
              <span className="muted">{r.label}{r.isReverseFallback ? "（反向）" : ""}</span>
              {" — "}
              <Link href={`/entities/person/${r.otherPerson.slug}`}>{r.otherPerson.name}</Link>
            </div>
          ))}
        </>
      ),
    })
  }

  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={breadcrumbItems} />
        <h1 className="page-title">{entity.name}</h1>
      </header>

      {metaRows.length > 0 && (
        <dl className="record-meta">
          {metaRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {entity.intro ? (
        <section className="record-section">
          <h2>简介</h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
        </section>
      ) : null}

      {entity.note ? (
        <section className="record-section">
          <h2>补充说明</h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: noteHtml }} />
        </section>
      ) : null}

      {/* v2：长篇资料（整篇级关联），置于"相关文本"之前 */}
      {wholeEntryTexts.length > 0 && (
        <section className="record-section">
          <h2>
            长篇资料 <span className="index-note">（{wholeEntryTexts.length} 条文本）</span>
          </h2>
          <div className="table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col">文本</th>
                  <th scope="col">来源与定位</th>
                </tr>
              </thead>
              <tbody>
                {wholeEntryTexts.map((item) => (
                  <tr key={item.associationId}>
                    <td>
                      <Link href={`/texts/${item.entrySlug}`}>{item.entryTitle}</Link>
                    </td>
                    <td>
                      {item.sourceCategory}
                      {item.sourceName ? ` · ${item.sourceName}` : ""}
                      {item.ingameLocation ? <div className="item-meta">{item.ingameLocation}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="record-section">
        <h2>
          相关文本 <span className="index-note">（{entryIds.length} 条文本，{relatedFiltered.length} 个段落）</span>
        </h2>
        {relatedFiltered.length === 0 ? (
          <p className="empty">暂无相关文本。</p>
        ) : (
          <div className="table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col">文本</th>
                  <th scope="col">来源与定位</th>
                  <th scope="col">段落</th>
                  <th scope="col">相关片段</th>
                </tr>
              </thead>
              <tbody>
                {relatedFiltered.map((item) => (
                  <tr key={item.blockId} id={`related-${item.blockId}`}>
                    <td>
                      <Link href={`/texts/${item.entrySlug}`}>{item.entryTitle}</Link>
                    </td>
                    <td>
                      {item.sourceCategory}
                      {item.sourceName ? ` · ${item.sourceName}` : ""}
                      {item.ingameLocation ? <div className="item-meta">{item.ingameLocation}</div> : null}
                    </td>
                    <td>{item.blockOrdinal + 1}</td>
                    <td>
                      <div
                        className="prose related-excerpt"
                        dangerouslySetInnerHTML={{
                          __html: entryBlocks.get(item.entryId)?.get(item.blockId) ?? "",
                        }}
                      />
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
