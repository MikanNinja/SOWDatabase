import type { Metadata } from "next"
import "./globals.css"
import Header from "@/components/Header"
import { getStore } from "@/lib/db/store"

// 避免 schema 缓存未刷新导致构建失败（PGRST205）
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: {
    default: "游戏资料库",
    template: "%s · 游戏资料库",
  },
  description: "单款游戏的中文人物、地点、势力资料库",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const store = await getStore()
  const settings = await store.getSettings()

  return (
    <html lang="zh-CN">
      <body>
        <Header />
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div className="container site-footer-inner">
            {settings.footerText}
          </div>
        </footer>
      </body>
    </html>
  )
}
