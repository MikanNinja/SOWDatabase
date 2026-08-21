import Link from "next/link"
import { getStore } from "@/lib/db/store"

export default async function Header() {
  const store = await getStore()
  const settings = await store.getSettings()
  const counts = await store.getEntityCounts("published")

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="masthead">
          <Link href="/" className="brand">
            {settings.siteName}
          </Link>
          <span className="masthead-note">资料索引</span>
        </div>
        <nav className="nav" aria-label="主要导航">
          <Link href="/entities/person">
            人物 <span className="nav-count">{counts.person}</span>
          </Link>
          <Link href="/entities/place">
            地点 <span className="nav-count">{counts.place}</span>
          </Link>
          <Link href="/entities/faction">
            势力 <span className="nav-count">{counts.faction}</span>
          </Link>
          <Link href="/texts">文本</Link>
          <Link href="/search">检索</Link>
        </nav>
      </div>
    </header>
  )
}
