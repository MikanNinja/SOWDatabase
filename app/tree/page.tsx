import type { Metadata } from "next"
import Link from "next/link"
import { getStore } from "@/lib/db/store"
import type { EntityTreeNode } from "@/lib/db/types"
import { FACTION_KINDS, FACTION_KIND_LABELS } from "@/lib/db/types"
import { compareZh } from "@/lib/collate"
import Breadcrumb from "@/components/Breadcrumb"

export const metadata: Metadata = {
  title: "结构总览",
}

function countNodes(nodes: EntityTreeNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + 1 + countNodes(node.children) + (node.chain?.length ?? 0),
    0
  )
}

function TreeNode({ node, type }: { node: EntityTreeNode; type: "place" | "faction" }) {
  if (node.children.length > 0) {
    return (
      <li>
        <details open>
          <summary>
            <Link href={`/entities/${type}/${node.slug}`}>{node.name}</Link>{" "}
            <span className="tree-count">（{node.children.length}）</span>
          </summary>
          <TreeView nodes={node.children} type={type} />
        </details>
      </li>
    )
  }
  if (node.chain && node.chain.length > 0) {
    return (
      <li className="tree-leaf">
        <Link href={`/entities/${type}/${node.slug}`}>{node.name}</Link>
        {node.chain.map((c) => (
          <span key={c.id}>
            {" "}
            <span className="tree-chain">—</span>{" "}
            <Link href={`/entities/${type}/${c.slug}`}>{c.name}</Link>
          </span>
        ))}
      </li>
    )
  }
  return (
    <li className="tree-leaf">
      <Link href={`/entities/${type}/${node.slug}`}>{node.name}</Link>
    </li>
  )
}

function TreeView({ nodes, type }: { nodes: EntityTreeNode[]; type: "place" | "faction" }) {
  // v10：地点层递归分区——同层存在有效辖区标注时按辖区分组（势力名拼音序，未标注末位）；全层未标注维持平铺
  if (type === "place" && nodes.some((n) => n.territory)) {
    const groups: { id: string; name: string; items: EntityTreeNode[] }[] = []
    const byFactionId = new Map<string, { id: string; name: string; items: EntityTreeNode[] }>()
    for (const n of nodes) {
      if (!n.territory) continue
      let g = byFactionId.get(n.territory.id)
      if (!g) {
        g = { id: n.territory.id, name: n.territory.name, items: [] }
        byFactionId.set(n.territory.id, g)
        groups.push(g)
      }
      g.items.push(n)
    }
    groups.sort((a, b) => compareZh(a.name, b.name))
    const untagged = nodes.filter((n) => !n.territory)
    return (
      <div className="entity-tree-group">
        {groups.map((g) => (
          <div key={g.id}>
            <h4>{g.name}</h4>
            <ul className="entity-tree">
              {g.items.map((node) => (
                <TreeNode key={node.id} node={node} type={type} />
              ))}
            </ul>
          </div>
        ))}
        {untagged.length > 0 && (
          <div>
            <h4>未标注</h4>
            <ul className="entity-tree">
              {untagged.map((node) => (
                <TreeNode key={node.id} node={node} type={type} />
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }
  return (
    <ul className="entity-tree">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} type={type} />
      ))}
    </ul>
  )
}

export default async function TreePage() {
  const store = await getStore()
  const trees = await store.getEntityTrees({ publicOnly: true })
  const placeCount = countNodes(trees.place)
  const factionCount = countNodes(trees.faction)

  // v9：势力区拆分——主流程为有结构的树；顶层无子级者（叶根/链行根）收进"独立势力"分区，按类型分组
  const factionTrees = trees.faction.filter((n) => n.children.length > 0)
  const independentRoots = trees.faction.filter((n) => n.children.length === 0)
  const kindGroups = [
    ...FACTION_KINDS.map((kind) => ({
      key: kind,
      label: FACTION_KIND_LABELS[kind],
      items: independentRoots.filter((n) => n.factionKind === kind),
    })),
    {
      key: "unclassified",
      label: "未分类",
      items: independentRoots.filter((n) => !n.factionKind),
    },
  ]
  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "结构" }]} />
        <h1 className="page-title">结构总览</h1>
        <p className="page-subtitle">
          地点与势力分级结构
        </p>
      </header>

      <section className="record-section">
        <h2>
          地点 <span className="index-note">（{placeCount}）</span>
        </h2>
        {trees.place.length === 0 ? (
          <p className="empty">暂无已发布地点。</p>
        ) : (
          <TreeView nodes={trees.place} type="place" />
        )}
      </section>

      <section className="record-section">
        <h2>
          势力 <span className="index-note">（{factionCount}）</span>
        </h2>
        {factionTrees.length > 0 && <TreeView nodes={factionTrees} type="faction" />}
        {independentRoots.length > 0 && (
          <div className="entity-tree-group">
            <h3>
              独立势力 <span className="index-note">（{independentRoots.length}）</span>
            </h3>
            {kindGroups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key}>
                  <h4>{g.label}</h4>
                  <ul className="entity-tree">
                    {g.items.map((node) => (
                      <TreeNode key={node.id} node={node} type="faction" />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
