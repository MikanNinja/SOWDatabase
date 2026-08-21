import TextForm from "@/components/admin/TextForm"
import { getStore } from "@/lib/db/store"

export const dynamic = "force-dynamic"

export default async function NewTextPage() {
  const store = await getStore()
  const categories = await store.listTextCategories()
  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 文本</p>
        <h1>新增文本条目</h1>
      </header>
      <TextForm categories={categories} />
    </div>
  )
}
