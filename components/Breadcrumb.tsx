import Link from "next/link"

export interface Crumb {
  label: string
  /** 提供 href 则该节点为可点击链接；末节点（当前页）省略 href。 */
  href?: string
}

/**
 * 统一的面包屑导航。
 * - 根节点固定为“数据库”，指向首页（/）。
 * - 末节点为当前页面标题，不渲染为链接。
 * - 其余节点均带有指向对应页面的超链接。
 */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  const trail: Crumb[] = [{ label: "数据库", href: "/" }, ...items]
  return (
    <nav className="breadcrumb" aria-label="面包屑导航">
      <ol>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1
          const label = (
            <span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
          )
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.href && !isLast ? <Link href={crumb.href}>{crumb.label}</Link> : label}
              {!isLast && <span className="breadcrumb-sep" aria-hidden="true"> / </span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
