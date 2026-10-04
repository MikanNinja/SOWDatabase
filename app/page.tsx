import type { Metadata } from "next"
import { getStore } from "@/lib/db/store"

export const metadata: Metadata = {
  title: {
    absolute: "首页 - S.O.W.资料库",
  },
}

export default async function HomePage() {
  const store = await getStore()
  const settings = await store.getSettings()

  return (
    <div className="container">
      <section className="home-hero">
        <h1>{settings.siteName}</h1>
        {settings.siteDescription ? <p>{settings.siteDescription}</p> : <p>AK:EF 人物、地点、势力、任务索引。</p>}
        <form action="/search" method="get" className="search-form" role="search" autoComplete="off">
          <input
            type="search"
            name="q"
            placeholder="搜索人物、地点、势力、任务名称或别名"
            aria-label="搜索实体"
          />
          <button type="submit">搜索</button>
        </form>
      </section>
    </div>
  )
}
