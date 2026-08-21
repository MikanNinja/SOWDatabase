import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { logoutAction } from "../actions"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const authed = await getSession()
  if (!authed) redirect("/admin/login")

  return (
    <div className="container admin-layout">
      <aside className="admin-sidebar">
        <p className="page-kicker">维护界面</p>
        <h2>管理后台</h2>
        <nav>
          <Link href="/admin">概览</Link>
          <Link href="/admin/entities">实体</Link>
          <Link href="/admin/texts">文本</Link>
          <Link href="/admin/settings">站点设置</Link>
          <form action={logoutAction}>
            <button type="submit" className="btn small">
              退出登录
            </button>
          </form>
        </nav>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  )
}
