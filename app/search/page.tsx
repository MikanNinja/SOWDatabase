import Breadcrumb from "@/components/Breadcrumb"
import SearchResults from "@/components/SearchResults"

export default function SearchPage() {
  return (
    <div className="container">
      <header className="record-header">
        <Breadcrumb items={[{ label: "实体检索" }]} />
        <h1 className="page-title">实体检索</h1>
        <p className="page-subtitle">当前检索人物、地点、势力、任务的标准名称和别名。</p>
      </header>

      <form action="/search" method="get" className="search-form" role="search" autoComplete="off">
        <input
          type="search"
          name="q"
          placeholder="输入名称或别名"
          aria-label="搜索实体"
          autoFocus
        />
        <button type="submit">检索</button>
      </form>

      <SearchResults />
    </div>
  )
}
