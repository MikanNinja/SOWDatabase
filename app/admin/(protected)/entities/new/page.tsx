import EntityForm from "@/components/admin/EntityForm"
import { getStore } from "@/lib/db/store"
import { ENTITY_TYPES } from "@/lib/db/types"

export default async function NewEntityPage(props: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await props.searchParams
  const defaultType =
    type && ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])
      ? (type as (typeof ENTITY_TYPES)[number])
      : "person"

  const store = await getStore()
  const allEntities = await store.listEntities({})
  const availableFactions = allEntities
    .filter((e) => e.type === "faction")
    .map((e) => ({ id: e.id, name: e.name, aliases: e.aliases }))
  const availableParents = allEntities.filter((e) => e.type === "place" || e.type === "faction")
  const availablePlaces = allEntities.filter((e) => e.type === "place")

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 实体</p>
        <h1>新增实体</h1>
      </header>
      <EntityForm
        defaultType={defaultType}
        availableFactions={availableFactions}
        availableParents={availableParents}
        availablePlaces={availablePlaces}
      />
    </div>
  )
}
