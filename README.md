# 游戏资料库（web）

单款游戏的中文人物、地点、势力资料库。公开只读网站 + 唯一拥有者管理后台，全部内容为纯文字（受限 Markdown + 内部链接），无图片、无社区功能。

## 功能

- 三类实体：人物、地点、势力
- 灵活文本条目：来源类别 / 来源名称 / 游戏内定位 / 触发条件
- 受限 Markdown：标题、段落、列表、引用、粗斜体；禁止 HTML、图片、表格、外部链接
- 内部链接：`[[实体名]]`、`[[实体名|显示文字]]`、`[[文本:标题]]`、`[[文本:标题|显示文字]]`
- 段落级实体关联（内联解析 + 手动关联 + 批量关联）
- 草稿 / 已发布状态，公开页面只显示已发布内容
- 实体名称与别名搜索
- 单一拥有者登录（环境变量凭据 + 签名会话 Cookie）
- JSON 全量导出

## 技术栈

- Next.js 16（App Router，Turbopack）
- SQLite（better-sqlite3）本地默认后端；生产可切换 Supabase PostgreSQL
- jose 签名会话、markdown-it 受限渲染

## 本地运行

```bash
cd web
npm install
cp .env.example .env.local   # 按需修改 ADMIN_PASSWORD / AUTH_SECRET
npm run seed                 # 写入虚构测试数据（清空并重建）
npm run dev                  # http://localhost:3000
```

默认登录：用户名 `admin`，密码 `change-me`（见 `.env.local`，生产环境务必修改）。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 运行生产构建（`next start`） |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run seed` | 清空数据并写入虚构测试数据 |
| `npm run verify` | 数据与链接解析功能验证 |

## 内容格式

正文使用受限 Markdown：

```markdown
## 标题

普通段落，**粗体**、*斜体*、- 列表项、> 引用。

他提到了[[沈砚|那个穿黑衣服的人]]。

更多信息见[[文本:白潮港的测潮记录|测潮记录]]。
```

规则：

- 空行 = 新段落；单个换行保留
- 实体链接目标按标准名称或别名解析，目标是稳定记录，改名不破坏链接
- 显示文字可以是原文中的模糊指代（不要求是别名）
- 未解析 / 有歧义的链接在管理后台提示，公开页面不显示坏链接

## 数据模型

- `entities`：人物 / 地点 / 势力（slug、名称、别名、简介、说明、状态）
- `entity_aliases`：实体别名
- `text_entries`：文本条目（标题、来源、定位、正文、状态）
- `text_blocks`：按空行拆分的段落块
- `content_links`：文本块到实体 / 文本的关联（内联或手动）

## 目录结构

```
app/                     # 路由（公开 + admin）
  admin/(protected)/     # 需要登录的后台
  entities/ texts/ search/
components/              # Header 与后台表单
lib/
  db/                    # store 接口 + SQLite/Supabase 实现 + 类型
  markdown.ts            # 受限 Markdown + [[...]] 解析
  render.ts              # 带链接解析的渲染辅助
  links.ts               # 链接问题检查
  auth.ts / auth-core.ts # 会话与登录
scripts/                 # seed.ts、verify-data.ts
supabase/schema.sql      # 生产 PostgreSQL 模式
proxy.ts                 # /admin 路由保护
```

## 部署（Vercel + Supabase）

1. 在 Supabase 创建项目，在 SQL Editor 执行 `supabase/schema.sql`。
2. 在 Vercel 导入本目录部署。
3. 配置环境变量：

   ```
   DATA_BACKEND=supabase
   SUPABASE_URL=<你的项目 URL>
   SUPABASE_SERVICE_ROLE_KEY=<服务角色密钥>
   ADMIN_USERNAME=<用户名>
   ADMIN_PASSWORD=<强密码>
   AUTH_SECRET=<强随机值，如 openssl rand -hex 32>
   SITE_NAME=<站点名>
   SITE_DESCRIPTION=<站点说明>
   ```

4. 生产环境必须通过 HTTPS 访问；`SUPABASE_SERVICE_ROLE_KEY` 只允许配置在服务端（不以 `NEXT_PUBLIC_` 开头）。

> 注意：SQLite 后端用于本地开发与测试；线上建议使用 Supabase 以获得持久化数据库与备份。

## 测试数据

`TEST_DATA.md`（工作区根目录）是虚构样例的说明文档；`npm run seed` 会按其中内容写入数据库，用于开发和验收。正式使用前可重新执行 `npm run seed` 或清空数据。
