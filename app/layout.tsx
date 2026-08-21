import type { Metadata } from "next"
import "./globals.css"
import Header from "@/components/Header"

export const metadata: Metadata = {
  title: {
    default: "游戏资料库",
    template: "%s · 游戏资料库",
  },
  description: "单款游戏的中文人物、地点、势力资料库",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Header />
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div className="container site-footer-inner">
            内容公开可读，仅由站点拥有者维护。
          </div>
        </footer>
      </body>
    </html>
  )
}
