import { getStore } from "@/lib/db/store"
import { QUEST_CATEGORY_LABELS } from "@/lib/db/types"

export const dynamic = "force-static"

export async function GET() {
  const store = await getStore()
  const [entities, quests] = await Promise.all([
    store.listEntities({ status: "published" }),
    store.listQuests({ status: "published" }),
  ])
  const payload = {
    entities: entities.map((entity) => ({
      name: entity.name,
      aliases: entity.aliases,
      type: entity.type,
      slug: entity.slug,
      intro: entity.intro.slice(0, 120),
    })),
    quests: quests.map((quest) => ({
      name: quest.name,
      slug: quest.slug,
      category: quest.category,
      categoryLabel: QUEST_CATEGORY_LABELS[quest.category],
      chapter: quest.chapter,
      stage: quest.stage,
    })),
  }
  return Response.json(payload)
}
