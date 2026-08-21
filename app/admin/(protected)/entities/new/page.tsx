import EntityForm from "@/components/admin/EntityForm"
import { ENTITY_TYPES } from "@/lib/db/types"

export default async function NewEntityPage(props: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await props.searchParams
  const defaultType =
    type && ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])
      ? (type as (typeof ENTITY_TYPES)[number])
      : "person"

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 实体</p>
        <h1>新增实体</h1>
      </header>
      <EntityForm defaultType={defaultType} />
    </div>
  )
}
