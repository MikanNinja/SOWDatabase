# 部署指南（本地编辑 + 静态站点）

写给非专业背景的拥有者：本指南带你维护一个**纯静态**的公开网站。
整体思路：**内容在你自己电脑上编辑（本地后台 + SQLite）→ 构建成纯静态文件 → 上传到 Cloudflare Pages**。
公开网站不再依赖 Vercel 或 Supabase，访客直接从 CDN 边缘节点拿到现成页面，速度是能做到的最快水平。

> 变更带来的三个核心变化：
> 1. 编辑内容从"线上后台"变回"本地后台"（你以前的本地工作流，`npm run dev` → `/admin`）。
> 2. 内容改完后需要**重新构建并上传**才会出现在公开网站上（几分钟的事）。
> 3. Supabase 不再需要；数据就存在本机 `data/app.db` 里，备份简单可靠。

---

## 日常维护流程（每次改完内容）

```bash
# 1. 编辑内容（启动本地后台，浏览器打开 http://localhost:3000/admin）
npm run dev

# 2. 改完并发布后，关掉上面的命令（Ctrl+C），构建静态站点
npm run build:static

# 3. 上传到 Cloudflare Pages（见下方"部署"一节，只需一条命令）
npx wrangler pages deploy out --project-name=sow-database
```

> 注意：执行 `npm run build:static` 前，请先确保 `npm run dev` 已经停止（Windows 下文件被占用会导致构建失败）。

---

## 第 0 步：准备账号与工具（只需一次）

1. **Node.js**：本机已装（你一直在本地开发）。
2. **Cloudflare 账号**：https://dash.cloudflare.com 注册，免费。
3. （可选）**GitHub 账号**：仅当选择"Git 仓库自动部署"路线时需要。

不需要 Supabase 账号；`supabase/` 目录仅作为历史留档，可忽略。

---

## 第 1 步：首次部署到 Cloudflare Pages（推荐，直传方式）

1. 打开终端（在项目根目录），登录 Cloudflare：
   ```bash
   npx wrangler login
   ```
   会打开浏览器授权，点 Allow 即可。
2. 创建并首次上传（`out/` 目录需已由 `npm run build:static` 生成）：
   ```bash
   npx wrangler pages project create sow-database --production-branch=main
   npx wrangler pages deploy out --project-name=sow-database
   ```
3. 完成后 Cloudflare 会给你一个地址，形如 `https://sow-database.pages.dev`，这就是公开网站。

以后每次更新内容，重复"日常维护流程"的三步即可。

### 绑定自己的域名（可选）

Cloudflare 控制台 → Workers & Pages → 你的项目 → **Custom domains** → 添加域名，按提示去域名服务商加 CNAME 记录，HTTPS 自动配好。

---

## 备选：GitHub 仓库自动部署

如果不习惯命令行上传，也可以把 `out/` 产物推到一个 Git 仓库分支，Cloudflare Pages 连接该仓库自动发布。这条路线需要 GitHub 账号且仓库建议设为私有（`out/` 里有全部公开内容）。日常流程仍是本地构建，只是把"wrangler 直传"换成"git push"。两种方式任选其一即可。

---

## 从 Supabase 迁移历史数据（一次性）

如果线上 Supabase 里已经录入了几百条真实内容，用下面的命令一次性拉回本地数据库。迁移前请**先停止在线 Supabase 编辑**（迁移后以本地为准，继续在线编辑会造成两边数据分叉）。

1. **拿到密钥**：Supabase 控制台 → Project Settings → API keys → 复制 `service_role`（secret）。它只在本地终端使用，不写进任何文件、不进仓库。
2. **试运行**（写入临时库 `data/import-preview.db`，不动真实数据）：
   ```bash
   # Git Bash
   SQLITE_PATH=data/import-preview.db SUPABASE_URL=https://你的项目.supabase.co SUPABASE_SERVICE_ROLE_KEY=你的密钥 npm run migrate:pull
   ```
   PowerShell 下的写法：
   ```powershell
   $env:SQLITE_PATH="data/import-preview.db"; $env:SUPABASE_URL="https://你的项目.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="你的密钥"; npm run migrate:pull
   ```
   核对输出的统计数字（实体/文本/文本块/链接/关系）与线上一致后，删除 `data/import-preview.db`（及其可能生成的 `.backup-*` 文件）。
3. **正式迁移**：去掉 `SQLITE_PATH` 再跑一次（PowerShell 需先 `Remove-Item Env:SQLITE_PATH`）。脚本会自动备份 `data/app.db`（生成 `data/app.db.backup-时间戳`），然后清空本地测试数据、写入真实数据。
4. **验证**：`npm run dev` 打开 `/admin` 抽查总数、回收站、一个人物页（关系/所属势力/层级）和一篇带 `[[...]]` 链接的文本；随后 `npm run build:static` 用真实数据出站。

> 说明：脚本只从 Supabase **读取**，不会改动线上任何数据。迁移成功后 `npm run verify` 会因内置的虚构测试断言而失败，这是预期现象——改用脚本自带的行数核对与孤儿外键检查作为数据校验手段。若哪天想恢复测试数据，运行 `npm run seed` 即可（它会清空本地库并写入虚构数据）。

---

## 中国大陆访问说明

- **Cloudflare Pages** 是无需备案的托管中对大陆访客比较友好的选择，通常明显快于 Vercel / GitHub Pages。
- 如果以后追求极致速度且愿意做 ICP 备案，可以把 `out/` 上传到国内对象存储 + CDN（如腾讯云 COS + CDN），静态文件直接可用。
- 无论哪种托管，页面本身是纯静态 HTML，差异只在 CDN 节点远近，不存在服务器冷启动。

---

## 数据备份

数据全部在本地 `data/app.db`（已被 .gitignore 排除，不会进仓库）。建议定期备份：

```bash
npm run export:json
```

会在项目根目录生成一份完整 JSON 导出（实体、文本、文本块、链接、关系），把它存到安全位置（网盘/移动硬盘均可）。此命令取代了原线上后台的"导出"按钮。

---

## 静态站点的工作原理（简述）

- `npm run build:static` 会临时把 `app/admin` 和 `proxy.ts` 移到 `.static-build/` 目录（它们需要服务器，静态站用不到），构建完成后自动还原。构建产物在 `out/` 文件夹。
- 公开页面在构建时就渲染成最终 HTML：200 个实体页、250 个文本页、各类列表页一次生成。
- 站内检索改为浏览器端完成：构建时会生成一份小体积索引 `search-index.json`，访客搜索时浏览器本地匹配，不再请求服务器。
- 草稿安全性更好：构建只收录"已发布"内容，草稿根本不会出现在静态文件里。
- 如果构建中途断电/报错导致 `.static-build/` 残留：先确认 `app/admin` 和 `proxy.ts` 不在原位时把它移回去，或删除空的 `.static-build/` 目录后重试。

---

## 常见卡点

- **构建时报文件占用错误**：99% 是 `npm run dev` 没关。Ctrl+C 停掉后再跑 `npm run build:static`。
- **构建后提示 `.static-build 已存在`**：见上文"工作原理"最后一条的恢复办法。
- **线上内容没更新**：确认你改完内容后执行了 `npm run build:static` 且 `wrangler pages deploy` 成功（看命令输出）。
- **某个中文页面 404**：确认浏览器地址栏链接与站内一致；Cloudflare Pages 与主流静态托管都支持中文（percent-encoded）文件名，若自建 Nginx 需配置 `try_files $uri $uri.html $uri/ =404;`。
- **迁移命令报"缺 race/parent_id 列"**：说明线上 Supabase 还没跑过 v2 迁移，先执行 `DATA_BACKEND=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:v2` 再重试。
- **想找回旧版部署方式（Vercel + Supabase）**：代码仍兼容——设置 `DATA_BACKEND=supabase` 与相应密钥即可回到服务器模式，但不再推荐。
