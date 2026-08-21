# 部署指南（Vercel + Supabase）

写给非专业背景的拥有者：本指南带你把网站从"本地"搬到"互联网"。
整体思路：**代码进 GitHub → Vercel 负责运行网站 → Supabase 负责存数据**。三者各管一摊。

> 你的 Git 仓库根目录是 `web/`（`.git` 文件夹在这里）。推送到 GitHub 的只有 `web/` 里的内容，不含 `node_modules`、`.next`、`.env.local` 和本地数据（这些已被 `.gitignore` 排除）。

---

## 第 0 步：准备三个账号

1. **GitHub**（已有则跳过）：https://github.com —— 用来托管代码。
2. **Vercel**：https://vercel.com —— 用 GitHub 账号直接登录即可，负责把代码变成线上网站。
3. **Supabase**：https://supabase.com —— 用来存真实数据（免费档足够）。

不需要在本机安装 Node 或数据库，部署全程在网页上点选完成。

---

## 第 1 步：把代码推送到 GitHub

在 `web/` 目录下打开终端（Git Bash），依次执行：

```bash
# 如果还没初始化远程仓库，先在 GitHub 网页新建一个空仓库，然后：
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 提交并推送
git add .
git commit -m "首次部署"
git push -u origin main
```

> 注意：`.env.local` 不会被提交（里面是本地密钥，绝不能上传）。推上去的只是代码。

---

## 第 2 步：在 Supabase 建好数据库

1. 登录 Supabase → **New project** → 填项目名、设一个强数据库密码（记住它）→ 选地区（离你近的，如 Singapore）→ **Create**。
2. 创建完成后，左侧菜单进 **SQL Editor** → **New query**。
3. 把本仓库 `supabase/schema.sql` 文件的**全部内容**复制粘贴进去 → 点 **Run**。
   - 这一步会建好 `entities`、`text_entries`、`text_blocks`、`content_links` 等表，并开启行级安全。
4. 左侧菜单进 **Project Settings → Data API**（或 **API**），复制两样东西备用：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **service_role** 密钥（在 "Project API keys" 里，注意选 `service_role`，不是 `anon`；它是服务端密钥，绝不能公开）

---

## 第 3 步：在 Vercel 部署网站

1. 登录 Vercel → **Add New → Project** → 导入第 1 步的 GitHub 仓库。
2. 导入时配置：
   - **Framework Preset**：选 `Next.js`（一般自动识别）。
   - **Root Directory**：保持仓库根（即 `web/` 这一层）。
   - **Build Command**：`next build`（自动填好，不用改）。
3. **先不要点 Deploy**——先去设环境变量（第 4 步），设完再 Deploy。
   - 如果已经误点了 Deploy，也没关系：部署后到项目 **Settings → Environment Variables** 补上变量，再 **Redeploy** 一次即可。

---

## 第 4 步：填写环境变量（关键）

在 Vercel 项目 **Settings → Environment Variables** 里，逐个添加以下变量（建议 Environment 选 `Production`，或全选 Production/Preview/Development 都填）：

| 变量名 | 填什么 | 说明 |
| --- | --- | --- |
| `DATA_BACKEND` | `supabase` | 必须，告诉程序用 Supabase 而不是本地文件 |
| `SUPABASE_URL` | 第 2 步复制的 Project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | 第 2 步复制的 service_role 密钥 | 服务端密钥，绝不外泄 |
| `ADMIN_USERNAME` | 你定的后台用户名 | 例如 `admin` 或自己的名字 |
| `ADMIN_PASSWORD` | 一个强密码 | 生产环境必填，后台登录用 |
| `AUTH_SECRET` | 一串随机字符 | 见下方生成方法 |
| `SITE_NAME` | 你的资料库名称 | 显示在首页标题 |
| `SITE_DESCRIPTION` | 一句话简介 | 可选，留空也行 |

生成 `AUTH_SECRET`（在 Git Bash 里执行，把输出结果填进去）：

```bash
openssl rand -hex 32
```

> 没有 openssl 的话，可以用任意密码生成器生成一段至少 32 位的随机十六进制字符串。
> 变量名**不要**加 `NEXT_PUBLIC_` 前缀——带这个前缀的变量会被送到浏览器，`SUPABASE_SERVICE_ROLE_KEY` 和 `AUTH_SECRET` 必须只留在服务端。

填完后回到 Vercel 项目页，点 **Deploy**（或 **Redeploy**）。等待构建完成，Vercel 会给你一个 `https://你的项目.vercel.app` 的地址。

---

## 第 5 步：验证网站能打开

1. 浏览器打开 Vercel 给的地址（如 `https://xxx.vercel.app`）。
2. 应看到首页"资料目录"，但此时**内容为空**——因为线上数据库是刚建好的空库。
3. 访问 `/admin/login`，用第 4 步的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。
   - 能登录 = 环境变量和 Supabase 连接正常。

---

## 第 6 步：把真实数据录进线上库

你之前在本地 `data/app.db` 录入的内容**不会自动出现在线上**（本地文件不进仓库、也不上云）。因为你说数据量不大，最简单可靠的做法是：

1. 登录线上后台 `/admin/login`。
2. 在"实体管理"里逐条录入人物 / 地点 / 势力；在"文本管理"里粘贴正文（支持 `[[...]]` 内部链接）。
3. 每条内容录入后点"发布"，访客即可在前台看到。

> 如果你以后想从本地一次性迁移（而非手动重录），可以走"导出 JSON → 写导入脚本"的路子，到那时再让我帮忙即可。当前数据少，手动录入最稳。

---

## 第 7 步（可选）：绑定自己的域名

Vercel 项目 **Settings → Domains** 里填入你购买的域名，按提示去域名服务商加一条 CNAME 记录即可。Vercel 会自动配好 HTTPS。

---

## 安全与运维提醒

- **密钥只在 Vercel 里填**，不要写进 `.env.local` 后再推送（`.env.local` 已被 gitignore，但生产密钥应以 Vercel 环境变量为准）。
- **`SUPABASE_SERVICE_ROLE_KEY` 等同于数据库管理员**，只能放在服务端环境变量，绝不要出现在前端代码或 `NEXT_PUBLIC_` 变量里。
- 公开页面只会显示"已发布"内容；草稿只有登录后台能看到，访客猜 URL 也进不去。
- 建议定期在后台用"导出"功能下载一份 JSON 备份，存到本地安全位置。
- 更新内容只需登录后台操作；更新代码才需要改完 push 到 GitHub，Vercel 会自动重新部署。

---

## 常见卡点

- **部署后页面报错 / 后台登不进**：99% 是环境变量漏填或填错。重点核对 `DATA_BACKEND=supabase`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 是否齐全且无误，然后 Redeploy。
- **`SUPABASE_SERVICE_ROLE_KEY` 在哪**：Supabase 左侧 **API** 页面，"Project API keys" 下选 `service_role`（带一把钥匙图标，标注 secret）。
- **内容不显示**：检查是否点了"发布"；草稿对访客不可见。
- **想重来一遍**：Supabase 里可以删库重建再跑 `schema.sql`；Vercel 里直接 Redeploy 不影响数据（数据在 Supabase，不在 Vercel）。
