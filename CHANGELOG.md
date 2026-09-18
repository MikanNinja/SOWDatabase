# 修改记录

## 2026-09-19：「任务」从实体系统拆分为独立数据存在（v5）

- **模型重构**：任务不再是第四种实体类型，而是独立于「实体」「文本」的第三种数据存在。动因：任务不具备实体的部分特质——无任何文本需要引用任务名称/别名（拆分前 `content_links` 与整篇关联中 quest 目标为 0 条），且任务与文本的预期关联是一对多（一个任务对应多篇完整文本），与实体↔文本的多对多关联语义不同。
- **数据层**：新表 `quests`（id/slug/name/category/category CHECK 六值枚举/chapter/stage/sort_order/note/status/created_at/updated_at/deleted），标准名部分唯一索引 `idx_quests_name_unique`；`entities.type` 收窄为 `person|place|faction`（CHECK 去 'quest'）并删除 4 个任务专属列；`quest_characters.quest_id` 外键改指 `quests(id)`（保留任务原 id，18 条出场人物关联原值平移）；`text_entries` 新增 `quest_id` 外键（`ON DELETE SET NULL`）实现严格一对多。任务不再参与 wiki 链接解析、实体层级与别名（拆分前仅 1 条任务别名，已并入该任务补充说明留档）。
- **迁移**：`SQLiteStore` 构造器按「quests 表是否存在 + entities 建表 SQL 是否含 'quest'」判定库版本，v3- 旧库先走原 v4 补列/重建路径再进入 v5 拆分；v5 迁移在事务内完成（建 quests 迁数据 → 整表重建 entities → 重建 quest_characters 改外键），immediate 事务 + 事务内二次校验抵御 `next build` 多 worker 并发打开同一库的竞态，全部 ALTER 幂等兜底。已对生产库执行（186 实体无损 → 181 实体 + 5 任务，integrity/FK 校验通过，8 进程并发演练通过）；迁移前快照保留于 `data/app.backup-pre-v5.db`。
- **文本↔任务**：文本编辑页在"整篇关联"之后单设「所属任务」section（下拉选择 + 独立保存动作，创建文本时不指定；主表单保存不触碰该字段，不会误清关联），一篇文本至多属于一个任务，`saveTextEntry` 在未显式传值时保留现有 `quest_id`；任务详情页新增「所属文本」区（仅已发布），公开文本页新增「所属任务」元信息行；任务编辑页列出其全部所属文本。整篇级关联与 wiki 链接中的任务类型随之移除。
- **后台**：新增 `/admin/quests` 列表/新建/编辑三页面与 `QuestForm` 组件（名称/分类/slug/状态/篇章/进程/展示排序/出场人物/补充说明），`saveQuestAction`/`deleteQuestAction`/`restoreQuestAction` 全新实现；`EntityForm` 削减任务区块，`saveEntityAction` 类型白名单收窄；后台概览统计表任务独立成行。
- **前台**：公开路由 `/entities/quest/*` 移除，新增 `/quests` 分类分组列表与 `/quests/[slug]` 详情页（任务分类/篇章/进程/出场人物/所属文本）；导航「任务」计数改指 `/quests`；检索结果新增独立任务分组（`search-index.json` 增 `quests` 数组）；实体列表页工具栏补「任务」入口；人物详情页「相关任务」表格链接改指 `/quests/*`。
- **脚本**：`seed.ts` 改用任务独立 API 建 fixture（4 任务 + 7 条出场人物关联 + 2 篇文本挂任务展示一对多），`clearData` 增加清理 `quests`；`verify-data.ts` 重写为 v5 断言（任务字段读写、正反向关联、一对多文本、草稿隐形、任务不再参与实体名称解析、约束拒绝、导出 schemaVersion 4）；移除已失效的 `npm run migrate:v3`（v4 迁移由构造器自动完成，脚本随 v5 路径一并退役）。`ExportData.schemaVersion` 升至 4 并新增 `quests` 数组（导出格式变化，下游注意）。
- **旧路径断链**：`/entities/quest/*` 五条旧公开页在重建后不再生成，已确认接受断链（拆分前现网文本对任务的链接为 0 条）。
- 依弃用策略仅维护 SQLite 后端：`lib/db/supabase.ts` 仅补类型占位（新方法抛错提示已弃用），`supabase/schema.sql` 不更新。

## 2026-09-14：新增「任务」实体（第四种实体类型）

- 新实体类型 `quest`（标签「任务」），与其他实体公开行为一致：拥有公开列表页/详情页、参与检索与导航计数、可被文本 `[[任务名]]` 引用；信息不全的任务保持「草稿」状态即自动隐形（无公开页、搜不到、链接降级纯文本、不上人物页），补全后逐个发布。
- 任务专属字段（其余类型强制空值）：`quest_category`（封闭六类枚举：主线/个人/重要/次要/日常/活动，存储机器键 `main/personal/major/minor/daily/event`）、`quest_chapter`（篇章，自由文本）、`quest_stage`（进程，自由文本，主要主线用）、`quest_order`（同分类内展示排序，可空，中文数字篇章名无法按拼音自然排序，故沿用 ordinal 模式）。任务不参与 `parent_id` 层级。
- 任务↔人物关联：新表 `quest_characters`（quest_id / person_id / role / ordinal），模式与 `entity_factions` 一致——后台任务编辑页以多行编辑器（人物选择＋角色/备注）维护，保存时全量替换；人物页新增独立「相关任务」表格区（任务名链接/分类/篇章/进程/角色），排序为分类固定序 → quest_order → 篇章 → 进程 → 关联序 → 名称拼音，仅显示已发布任务；任务详情页新增「任务分类/篇章/进程」元信息行与「出场人物」行（镜像势力「成员」行）。
- 迁移：`entities.type` 的 CHECK 约束无法 ALTER 修改，`SQLiteStore` 构造器检测旧约束后**整表重建**（事务内建新表 → 显式列名拷贝 → 删旧表 → 改名 → 重跑 schema 重建索引；`foreign_keys` 事务外切换）；四任务列经既有 ALTER 补齐机制自动添加；新表由 schema 幂等创建。已对生产库执行（178 实体无损，integrity/FK 校验通过），并对 v2 时代旧库（缺 `life_status`）验证全路径迁移。新增 `npm run migrate:v3`（幂等薄封装，可显式触发与校验）。
- 后台：实体类型选择/列表筛选/概览统计自动出现「任务」（`ENTITY_TYPES` 驱动）；`EntityForm` 新增任务区块（分类/篇章/进程/展示排序/出场人物）；`saveEntityAction` 解析并校验新字段（分类非法回退主线且服务端归一，出场人物必须为未删除人物类型，非法创建不落库）。人物后台编辑页新增「相关任务」只读反向视图（链接到后台任务编辑页）。
- 前台：导航新增「任务」计数；检索结果新增任务分组；文本编辑页的段落手动关联与整篇关联选择器加入任务类型（长篇资料区在任务页通用渲染）；人物详情页新增「相关任务」表格区（置于长篇资料后、相关文本前）；首页/检索页文案加入「任务」。
- 写入校验：任务同类标准名沿用全局唯一规则（同名任务抛错）；出场人物非法引用抛错且不落库（createEntity 在插入实体前预校验，避免脏行）；分类非法抛错。
- 数据配套：`seed.ts` 新增 4 个任务 fixture（主线带篇章+进程、个人带篇章、日常、草稿）与 7 条出场人物关联，`clearData` 补充清理 `quest_characters`；`verify-data.ts` 新增 v4 场景断言（字段读写、正反向关联、排序、发布/草稿链接渲染差异、约束拒绝、导出 schemaVersion 3）；`ExportData` 新增 `questCharacters`，schemaVersion 升 3。
- 依弃用策略仅维护 SQLite 后端：`lib/db/supabase.ts` 仅补类型占位（新方法抛错提示已弃用），`supabase/schema.sql` 不更新。

## 2026-09-13：列表排序改为拼音序

- 全部名称类列表由 SQLite `COLLATE NOCASE`（汉字等于 Unicode 码点序≈部首笔画序，对用户无意义）改为中文拼音序：新增 `lib/collate.ts`，基于 Node 内置 `Intl.Collator("zh-Hans-CN")`（full-ICU），零新依赖。
- `SQLiteStore` 八处排序改为拼音序：`listEntities`（类型分组内按名称拼音）、`searchEntitySuggestions`（SQL 保留 LIMIT 选取，返回后按拼音重排）、`getFactionMembers` 与 `getWholeEntryTextsForEntity`（ordinal 优先、名称/标题拼音次之）、`getEntityChildren`、`getRelatedBlocksForEntity`（标题拼音 + 段落序）、`listTextCategories`、`listTextEntries`。
- **文本列表排序语义变更**：由"最近更新优先"（`ORDER BY updated_at DESC`）改为标题拼音序，与实体目录风格统一。后台文本管理页跟随；后台首页"最近修改"自行按时间重排，不受影响。
- 影响面（全部经 store 一致跟随）：公开三类实体列表、实体详情页"下级/成员/长篇资料/相关文本"、搜索建议与搜索结果顺序、`search-index.json`、后台实体/文本管理页、表单下拉框、文本来源类别导航。
- 多音字取舍：ICU 按单字固定读音排序（如"重"固定 chóng），个别词落位可能与直觉不同，但确定可复现；如需个别钉位后续可加手工覆盖表（本次不做）。标点开头的名称排最前，拉丁字母名按字母值与拼音混排。
- 唯一性校验（`assertUniqueNameInType` 与部分唯一索引）是判等逻辑而非排序，未改动；Supabase 相关文件依弃用策略不动。
- `scripts/verify-data.ts` 新增回归断言（人物 阿澜→陆沉舟→沈砚→铜舌→闻霜；已发布文本 白潮港的测潮记录→潮汐议会测潮条例→灰烬台地的低语→旧港的黑衣旅人）；临时库 seed + verify 全绿，生产库只读抽查各类型拼音序正常。
- 依赖条件：拼音序依赖 Node 自带 full-ICU（本机 Node 24 / ICU 78.3 实测）；若未来换用 small-icu 构建的 Node 会退回码点序。

## 2026-09-13：人物新增「现状」字段

- 人物实体新增「现状」（`life_status` / `lifeStatus`）字段：单值自由文本，默认空、手动输入，用于表达"已故但时间地点不详""下落不明""生死未卜"等现有出生/死亡字段无法覆盖的生死状况。
- 数据层：`lib/db/schema.ts` 建表语句加列；`SQLiteStore` 构造函数对既有库自动 `ALTER TABLE ADD COLUMN life_status TEXT NOT NULL DEFAULT ''`（生产库启动即迁移，存量数据默认空串，无损）；`Entity` / `EntityInput` 增加可选字段 `lifeStatus`；`createEntity` / `updateEntity` 写入该列（实体查询均为 `SELECT *`，无需改动）。
- 后台表单：`EntityForm` 人物区块「死亡」之后新增「现状」单行文本输入（不加提示文字）；非人物类型不渲染该输入，保存时自动清空，与种族字段行为一致。
- 公开实体页：人物详情页元信息在「死亡于」行之后展示「现状」，留空不显示。
- 种子与验收：`seed.ts` 为沈砚填入 `lifeStatus: "下落不明"`；`verify-data.ts` 在"场景 F"新增断言，临时库 `npm run seed` + `npm run verify` 全绿。
- 依既定策略仅维护 SQLite 后端，Supabase 相关文件不改动；JSON 导出走 `exportAll` 自动携带新字段。

## 2026-09-08：命名唯一性与链接钉定消歧

- **同类实体标准名唯一**：`SQLiteStore` 的 `createEntity` / `updateEntity` / `restoreEntity` 在写入前校验同类型、未删除实体中不存在同名标准名（`COLLATE NOCASE`，与 `findEntityCandidates` 匹配口径一致），命中即抛错并指出冲突实体；`lib/db/schema.ts` 新增部分唯一索引 `idx_entities_type_name_unique (type, name COLLATE NOCASE) WHERE deleted = 0` 兜底。别名、跨类型名称不查重（现库经审计确认存在合法的“势力名=地点名”等形态）。
- **顺手修复存量隐患**：`SQLiteStore.uniqueSlug` 原先只对未删除行查 slug 冲突，而 `slug` 的 UNIQUE 是全表约束——软删实体后重建同名实体会直接撞库报 500。现改为全表查重，与约束语义一致。
- **链接钉定语法**：新增 `[[名称@slug]]` / `[[名称@slug|显示文字]]` / `[[文本:标题@slug]]`，按 slug 直接命中目标实体/文本，用于跨类型同名、名称=别名等场景下消歧；slug 查不到时回退为对名称部分做普通精确匹配。`lib/markdown.ts` 新增 `splitPinnedTarget` 纯函数，`lib/links.ts` 新增统一解析入口 `resolveWikiLink`，`computeLinkIssues`、`renderMarkdownContent` 与 `SQLiteStore.saveTextEntry`（原先三处内联的候选逻辑）统一改走它；钉定写法的显示文字 fallback 取名称部分，不显示 slug。
- **钉定显示文字与原文一致（渲染层修复）**：落库 displayText 虽已是名称部分，但 `renderEntryBlocks`（正文段落）与 markdown-it 渲染器的降级 fallback 均直接用完整 target，导致 `[[塞什卡@塞什卡-2]]` 在页面上显示为“塞什卡@塞什卡-2”。现 `linkDisplayFallback` 统一先剥 `@slug` 再剥 `文本:` 前缀，markdown-it 渲染器 fallback 改走该函数（顺带修正无 resolve 时文本链接残留“文本:”前缀的旧行为）；显式 `|显示文字` 依旧优先。`scripts/verify-data.ts` 新增回归断言（钉定链接显示名称部分、不得出现 @slug、草稿目标公开页降级为名称纯文本）。
- 后台文本编辑页的 ambiguous 提示改为列出“类型·名称（slug）”并给出钉定写法示例，按提示改正文即可消歧；实体表单的标准名输入框补充唯一性说明。
- 新增只读审计脚本 `scripts/check-name-conflicts.ts`（`npx tsx scripts/check-name-conflicts.ts`）：列出同类标准名重复与全部多候选命名。现库审计结果：同类重复 0 组、多候选 8 个（全部为跨类型合法重名）。
- Supabase 后端弃用：本次及后续改动仅维护 `lib/db/sqlite.ts`，`lib/db/supabase.ts`、`supabase/schema.sql` 与迁移脚本的 Supabase 分支不再更新（仅作历史参考），AGENTS.md 已记录。

## 2026-09-06：移除后台文本页“批量关联”

- 后台文本编辑页删除“批量关联”区（把单个实体手动关联到全部段落的表单）及其 server action `batchManualLinksAction`；`Store` 接口与 SQLite / Supabase 双后端实现 `batchAddManualLinks` 一并移除，`globals.css` 清理不再使用的 `.batch-link-form` 样式。
- 移除原因：v2 引入“整篇级关联”后，“批量关联到所有段落”的语义与之重复，功能不再使用；单段“编辑手动关联的实体”与“整篇关联”均保留。
- 存量数据不清理：既有批量关联产生的 `content_links`（source='manual'）行保留原样，仍驱动实体页“相关文本”，需要时可在后台逐段取消勾选移除；数据库结构无变更，无需迁移脚本。

## 2026-09-06：修复别名 Wiki 链接被改写为标准名显示

- 修复内链显示文字逻辑：作者写 `[[别名]]` 而未指定 `|显示文字` 时，页面原先把别名展示为实体的标准名（带链接），与“显示文字可以是原文中的模糊指代”的产品语义相悖；现改为按作者手写的 target 原文展示（别名显示别名，文本链接去掉“文本:”前缀），显式 `|显示文字` 依旧优先。
- `lib/markdown.ts` 新增 `linkDisplayFallback` 统一推导；`lib/render.ts` 内联渲染（`renderEntryBlocks`）不再优先读取落库的 `display_text`，实体简介/补充说明的即时渲染（`renderMarkdownContent`）不再回退标准名。
- `saveTextEntry`（SQLite / Supabase 双后端）落库 `display_text` 同步改为保存原文，保证导出数据一致。
- 存量文本的正文从未被改写，渲染层修复后旧数据立即显示正确，无需数据迁移；`scripts/verify-data.ts` 新增回归断言（`[[夜渡者]]` 按原文渲染并链接到沈砚、落库 displayText 为原文、不得出现标准名改写）。

## 2026-09-04：后台易用性改进

- 新增实体与文本条目时，发布状态默认值由"草稿"改为"已发布"（编辑既有记录仍显示其当前状态）。
- 新增共享组件 `SubmitButton`：基于 React 19 `useFormStatus`，表单 server action 在途期间禁用提交按钮并显示"提交中/删除中/登录中…"等提示，防止 Supabase 高延迟下的重复提交。
- 覆盖全部后台数据变更提交：实体/文本保存、人物关系保存与删除、整篇关联、登录、站点设置、实体与文本列表的删除/恢复、段落关联（批量与单段）；登出与 GET 检索不涉及。
- `globals.css` 新增 `.btn[disabled]` 禁用态样式。

## 2026-09-04：修复祖先链遍历跳级与展示顺序

- 修复 `getEntityAncestors`（SQLite / Supabase 双后端同构）的遍历缺陷：原实现推入父级后直接把游标跳到再上级，导致层级深度 ≥3 时祖先链隔级丢失（三级链只返回直接父级，四级链丢失中间节点）。现改为推进到父节点本身，完整收集祖先链。
- 草稿父级跳过行为同步修正：公开链跳过草稿父级后不再丢失其上方已发布的祖先节点。
- `getEntityAncestors` 返回顺序由"直接父级 → 顶级"改为"顶级 → 直接父级"，与面包屑及上级展示的方向一致。
- 公开详情页面包屑由"数据库 / 地点 / 直接父 / … / 当前实体"修正为"数据库 / 地点 / 顶级 / … / 直接父 / 当前实体"；"上级"元信息行与后台"上级链"同步自顶向下展示。
- 数据模型与成环检测未改动；`scripts/verify-data.ts` 既有断言（深度 ≤2 的种子层级）全部保持通过。

## 2026-08-26：精简冗余字段

- 移除文本条目的"触发条件"字段（`text_entries.trigger_condition`）：与"游戏内定位"重叠，删除后台表单输入、文本详情页展示及相关类型与双后端实现。
- 移除整篇级关联的"备注"字段（`text_entity_associations.note`）：删除后台表单输入与实体页"长篇资料"区备注列，关联仅保留目标实体与排序。
- 同步更新 SQLite / Supabase 建表语句与种子数据；部署端为空库可重建，无需迁移脚本。

## 2026-08-24：第二阶段（v2）数据模型扩展

在 v1 单人维护、公开只读、三类实体、灵活文本条目、受限 Markdown、自定义显示文字 Wiki 链接的基础上，引入实体类型专属属性与整篇级关联。所有变更为非破坏性增量，保护既有数据。

### 数据模型迁移

- `entities` 表新增可空列 `race`（人物种族）与 `parent_id`（地点/势力上级引用）。
- 新建表 `entity_factions`（人物所属势力关联，带角色/备注与序号）。
- 新建表 `person_relations`（人物↔人物有向关系，含正向与反向称呼、备注）。
- 新建表 `text_entity_associations`（整篇级关联，文本↔实体）。
- 新增幂等迁移脚本 `scripts/migrate-v2.ts`，覆盖 SQLite 与 Supabase 两种后端。
- `SQLiteStore` 构造函数自动补齐既有库缺失列，支持启动即迁移。
- 导出结构 `schemaVersion` 升至 2，新增 `factions`、`relations`、`textEntityAssociations` 数组。

### 实体字段与层级（阶段 9）

- 人物新增种族字段（单值自由文字，可留空）与所属势力（多值，每条带角色/备注）。
- 地点/势力新增上级引用，构成单父树，保存时校验同类型与无环。
- 势力详情页反向列出成员（来自人物的所属势力）。
- 地点/势力详情页显示父级面包屑路径与直接下级列表。
- 草稿或已删除父级不出现在公开面包屑。
- `EntityForm` 转为 client component，按类型动态渲染专属字段。

### 人际关系（阶段 10）

- 人物↔人物有向关系，一条记录承载双向称呼（正向 `kind` + 反向 `reverse_kind`）。
- 人物详情页双向展示：`to` 方显示 `from` + 正向称呼；`from` 方显示 `to` + 反向称呼。
- 反向称呼为空时回退为正向称呼并标注"（反向）"。
- 关系双方必须均为人物实体，校验不通过时报错。
- 删除人物时同步清理其相关关系记录。

### 整篇级关联（阶段 11）

- 文本编辑后台新增"整篇关联"区，可选择目标实体并填写备注。
- 实体详情页在"相关文本"前新增"长篇资料"区，仅列标题、来源与定位，不展开段落片段。
- 同一文本同时拥有整篇级与段落级关联时，归入"长篇资料"，从"相关文本"中排除。
- 文本详情页元信息区展示整篇关联的目标实体名称与类型。
- 草稿或已删除目标实体不公开显示。

### 测试数据与验收（阶段 12）

- `seed.ts` 扩展：新增铜舌（机关族人物）与测潮塔小组（潮汐议会子势力），补充种族、所属势力、地点/势力层级、人物关系与整篇关联数据。
- `verify-data.ts` 扩展：新增种族、势力成员反向、层级面包屑、成环检测、关系双向展示、整篇关联折叠与导出结构断言。
- 全量验证通过：v1 回归 + v2 新特性。

## 2026-08-21：资料库视觉改版

本次改版以高信息密度、目录式阅读和复古资料库风格为目标，参考 ISFDB 所体现的内容优先和稳定索引理念。

### 全局界面

- 将全局视觉从白底、蓝色强调、圆角卡片改为米白纸张色、深色文字、细规则线和矩形控件。
- 移除 `Geist` 字体依赖，改用系统字体和中文衬线字体组合。
- 扩大公共内容容器，减少首页、列表和后台的垂直留白。
- 保留普通文字链接和下划线，减少胶囊标签、阴影、动画和粘性导航。
- 增加键盘焦点、移动端布局和打印样式。

### 公共页面

- 首页改为资料目录表，显示人物、地点、势力和文本条目的数量与入口。
- 实体列表改为名称、别名、简介组成的目录表，并保留名称/别名检索。
- 文本列表改为标题、来源和游戏内定位组成的目录表，增加标题和来源名称筛选。
- 实体详情页改用元信息区和相关文本表，显示来源、段落编号和关联片段。
- 文本详情页改用元信息表和独立正文区，为文本块增加稳定锚点。
- 搜索页明确为实体名称检索，并以分类表格显示结果。

### 管理后台

- 后台概览由入口卡片改为实体和文本的状态统计表。
- 实体、文本管理页改为筛选工具栏和高密度管理表格，增加修改日期。
- 实体和文本表单分别整理为元数据区与正文/说明区。
- 文本编辑页保留链接问题、批量关联和段落关联功能，改为紧凑段落行和独立预览区。
- 实体编辑页将关联文本改为表格，显示来源、段落和正文片段。
- 登录页和设置页统一为简洁的资料库后台样式。

### 技术边界

- 未更换 Next.js、React、TypeScript 或 Markdown 渲染方案。
- 未引入客户端状态管理、UI 组件库或新的运行时依赖。
- 未改变路由、数据库模型、认证逻辑、Server Actions、Markdown 安全过滤或数据导出接口。
- 删除未被使用的 `app/page.module.css` 默认模板样式。
