# DSH 团队模板插件 — 设计文档

日期：2026-11-02
状态：待评审
作者：lead（与用户共同确定）

## 1. 背景

DSH 的智能体团队是**隐式**的：`TeamId` 就等于发起会话的 `SessionId`，没有「创建团队」这一动作，成员与任务只写进 Lead 会话自己的日志（`team/member`、`team/task`）。因此：

- 官方**没有团队模板**机制，一套团队无法跨会话复用；
- 官方团队面板（`@deepseek-ai/dsh-experimental-client-ui-agent-team`）只读，明确不支持 spawn、rename、delete、interrupt。

结果是每开一个新会话，用户都得手动重新交代一遍「建哪几个成员、各自负责什么、用什么提示词」。本项目要补上这一层。

## 2. 目标与非目标

### 目标（v0.1）

1. 把一套团队成员定义保存为**模板**，可增删改查；
2. 模板支持**三级作用域**：全局 / 项目 / 会话，按确定规则合并成生效集；
3. 在会话里**一键应用**模板，把成员真正建出来（复用官方 `ctx.agentTeams.spawnTeammate`，不重造团队机制）；
4. 模板可**导出/导入 `.json`**；
5. 项目级模板落成项目目录下的文件，可提交进 git、随仓库共享。

### 后续版本

- v0.2：模板源订阅（配置 git 仓库或 URL，插件拉取模板列表）
- v0.3：内置社区市场（从 GitHub 拉公开模板清单）

### 非目标

- 不实现团队运行时本身（成员生命周期、消息、任务板全部沿用官方 `agentTeams`）；
- 不改官方团队面板的行为，也不替换它；
- 不做团队成员的实时协作编辑、不做权限体系；
- v0.1 不联网。

## 3. 关键约束（调研确认的官方事实）

下表 `docs/` 指 DSH 官方文档根（本机副本在 `dsh-plugin-guide/references/official-docs/docs/`）。这些事实决定了实现路径，实现时不得偏离：

| 约束 | 依据 |
|---|---|
| 客户端不能 `require` 任何 Harness Client 包；抛错的组件会让整个 slot 条目白屏 | `references/official-plugin-dev-skill.md` §3.4 |
| `dsh.client.inject` 必须是**静态数组**，写成函数会让整个 bundle 被自愈机制禁用 | `guide/plugin-dev-guide.md:337` |
| 绝不能用新 `type` 追加会话事件，否则会话打不开 | `guide/plugin-dev-guide.md` |
| `ctx.settings` 只投影 profile 级 Config，落盘方式是改写 `cordis.patch.yml`，**不能**用来存模板库 | `docs/subsystems/settings.zh.md:5,27-71` |
| 会话 projection 是可丢弃缓存（同步 `apply`、state 必须纯 JSON），不是权威存储 | `docs/subsystems/session-projection.zh.md:16-66` |
| 官方没有 workspace 级插件 KV；`.dsh/` 只有 skills 一个用途先例 | `docs/subsystems/workspace.zh.md`、`docs/subsystems/skills.zh.md:66-77` |
| `ctx.commands.execute(agent, line, attachments, signal)` 与 `list` 本身带 `@Remote`，客户端可直接调 | `docs/subsystems/commands.zh.md:157,195` |
| out-of-tree 包跑不了 Typert 生成管线，自己写 `@Remote` 风险高 | 子代理调研结论 + `docs/cookbook/adding-a-remote-api.zh.md:92-105` |
| `spawnTeammate` 仅 Lead 可调，返回后成员处于 `provisioning` | `docs/subsystems/agent-team.zh.md:135-226` |

## 4. 架构

单个 npm 包，双面：

```
dsh-plugin-agent-team-templates/
├── package.json          # exports["."] / exports["./client"]；dsh.bundle；dsh.client
├── cordis.patch.yml      # 插入本插件一行
├── icon.svg
├── locale/{zh-CN,en-US}.json
├── src/
│   ├── host/
│   │   ├── index.ts      # apply(ctx, config)
│   │   ├── store.ts      # 三作用域读写
│   │   ├── templates.ts  # 合并 / 校验 / 导入导出
│   │   ├── commands.ts   # /team 命令注册
│   │   ├── apply.ts      # 模板 → 真实成员
│   │   └── tools.ts      # agent 工具：team_template_list / team_template_apply
│   └── client/
│       ├── index.tsx     # __ModuleLoader__ 壳 + apply/inject
│       ├── LibraryTab.tsx    # 设置页：模板库
│       ├── TemplateEditor.tsx
│       ├── SessionButton.tsx # 会话页头：应用
│       ├── useTemplates.ts   # 命令调用封装
│       └── styles.ts         # 内联 CSS 字符串
└── lib/                  # 构建产物（index.js / client.js）
```

### 通道选择：为什么是命令

UI 需要触发 Host 侧动作（建成员、读写模板）。三条候选路径：

1. **自己写 `@Remote`** — 需要 Typert 生成器产出 `lib/typert.host.js` 与 `lib/typert.remote-client.js`，仓库外插件跑不通，排除。
2. **自建 HTTP 路由** — 可行但要自己处理鉴权与生命周期，偏离官方通路，且增加攻击面，不选。
3. **复用官方命令通道** — `ctx.commands.execute` 已是 `@Remote`，客户端 `inject: ["remote", "remote.commands"]` 后直接调用。**选它**。

代价：每次 UI 操作会在会话日志里留下 `command/run` + `command/done`。这是可接受的，甚至是有价值的审计痕迹。

同一个动作按「一个操作、两个调用方」组织：UI 经命令调用，模型经工具调用（`team_template_apply`），两者都落到同一个 `apply.ts`，不各写一份逻辑。

## 5. 数据模型

```ts
type TemplateScope = 'global' | 'project' | 'session'
type MemberContext = 'fresh' | 'fork'

interface TemplateMember {
  name: string              // 成员名，模板内唯一
  description: string       // 传给 spawnTeammate
  prompt: string | { file: string }  // 内联文本，或相对项目根的文件引用
  context: MemberContext    // 默认 'fresh'
  provider?: string         // 省略则用插件配置的默认值
}

interface TeamTemplate {
  id: string                // 稳定标识，uuid v4
  name: string              // 展示名，也是跨作用域合并键
  description: string
  version: number           // 从 1 开始；合并时用于冲突提示
  members: TemplateMember[]
  updatedAt: number         // epoch ms
  source?: { kind: 'file' | 'builtin'; ref?: string }
}
```

`prompt` 允许 `{ file }` 引用是为了「角色正文很长」的场景（例如一个 300 行的角色文档）：模板保持精简，正文由各项目自己维护，应用时才读取。

模板落成项目文件时，文件名取 `name` 的 slug（`<slug>.json`），`id` 保存在文件内：改显示名不会改 id，因此会话级选择不会因改名而失效。

## 6. 存储

| 作用域 | 介质 | 键 / 路径 |
|---|---|---|
| global | `ctx.storageDomain` 单域 `agent-team-templates`，`layout:'per-record'`，`global:true` | `global:<id>` |
| project | `<projectRoot>/.dsh/teams/<slug>.json`，经 `ctx.fs` 读写 | 文件本身 |
| session | 同一 domain | `session:<sessionId>` |

- `Domain` 的生命周期归插件所有，必须在 `ctx.effect` 的 disposer 里 `close()`；`open()` 是异步的，不在 `apply` 顶层 await。
- 项目级**以文件为权威**：这是「项目内共享」的唯一实现方式，模板必须能被 git 跟踪。
- 会话级记录只存「选中了哪个模板 + 成员级局部覆盖」，不复制整份模板。
- `projectRoot` 探测：从会话 cwd 向上找 `.git`，找不到用 cwd 本身（与官方 skills 口径一致）。
- 文件写入用原子替换（先写 `.tmp` 再 rename），避免半截文件。

### 合并规则

输入：同一 `name` 在 global / project / session 三处的模板（可能缺项）。

1. 优先级 **session > project > global**；
2. 成员按 `name` 逐项覆盖（高层同名字段覆盖低层）；
3. `version` 不同时**显式提示冲突**，不静默取大；
4. 合并结果按成员 `name` 排序输出，保证可复现。

## 7. 命令协议

注册一条命令 `/team`，子命令通过 `rawInput` 解析：

| 命令 | 作用 | 返回 text |
|---|---|---|
| `/team list [--scope=global\|project\|session]` | 列出模板（含作用域与来源） | JSON 数组 |
| `/team show <name>` | 展开一个模板（含合并后的生效成员） | JSON 对象 |
| `/team save <name> [--scope=...]` | 把当前会话成员快照存成模板**骨架** | JSON 对象 |
| `/team apply <name>` | 应用模板到当前会话 | `{ok, spawned[], skipped[], failed[]}` |
| `/team delete <name> --scope=<scope>` | 删除模板 | `{ok}` |
| `/team export <name>` | 导出 JSON（供 UI 复制/下载） | JSON 对象 |
| `/team import <json>` | 从 JSON 导入 | `{ok, id}` |

约定：

- 所有返回值都是**单行 JSON**（`CommandResult.text`），UI 侧 `JSON.parse`；命令结果不会进对话，只给 UI 渲染。
- 参数错误返回 `{kind:'error', text:'...'}`，UI 原样显示。
- 命令只在 Lead 会话可用；`apply` 在非 Lead 会话返回明确错误。
- `/team save` 只能拿到 `name` / `description` / `context` / `provider`——官方 `TeamMemberSnapshot` **不含 prompt**，所以保存出的是骨架，`prompt` 为空，需在设置页补全后才能用于 `apply`。UI 必须把这个限制显式告诉用户。

## 8. UI

### 设置页（`settings.plugins.tab`）

- 左列：模板列表，按作用域分组，每项带 `global` / `project` / `session` 徽章与来源（文件路径或内置）。
- 右侧：编辑器
  - 基本信息：name / description / scope（新建时可选；已存在则只读显示）
  - 成员表格：name / description / context / prompt（内联文本框 或 文件路径输入），支持增删、上下移动
  - 底部：保存 / 取消
- 顶部操作：新建、导入（粘贴 JSON 或选文件）、导出（下载 `.json`）、删除。

### 会话页头（`conversation.session.header.actions`）

- 一个「团队模板」按钮，点击展开浮层：
  - 列出对当前项目可见的模板（合并后的生效集）
  - 每个模板显示成员清单与当前是否已存在
  - 一个动作：「应用」（已存在的成员自动跳过并标出定义差异）
  - 提交后浮层显示逐成员结果，并提示「成员正在 provisioning，稍候刷新状态」

### 样式

只用 `--dsw-alias-*` 与 `--dsw-elevation-*` token；类名统一前缀 `att-`；CSS 以字符串常量内联注入（`<style>` + `dataset.pluginCss`）。

## 9. 应用流程

```
UI: ctx.remote.commands.execute(sessionId, "/team apply <name>", [], signal)
  → Host handler(invocation)
    1. membership = ctx.agentTeams.membership(invocation.agent)
    2. 若 membership.role !== 'lead' → 返回错误「只有主会话能创建团队成员」
    3. lead = ctx.agents.get(membership.teamId)
    4. 合并模板 → 解析 prompt 文件引用（缺失则整体失败，列出缺失文件）
    5. existing = listMembers(lead) 的名字集合
    6. 逐成员：已存在 → skipped；否则 spawnTeammate(lead, {...}) → spawned / failed
    7. 返回 {ok, spawned[], skipped[], failed[]}
  → UI 展示结果；成员状态随后由官方 agentTeam 投影刷新
```

已存在的成员一律跳过——官方拒绝同名 spawn，没有「更新成员」的 API。跳过时附带 `differs: true|false`：若模板里的 `description` / `context` 与该成员当前值不同，就标出来，提示用户改名后再应用，或手动处理。v0.1 不提供原地更新成员的能力。

## 10. 错误处理

| 场景 | 行为 |
|---|---|
| 非 Lead 会话执行 apply | 返回错误文本，UI 直接展示 |
| prompt 文件引用不存在 | apply 前统一校验，列出全部缺失路径，整体不执行 |
| 模板 name 重复（同作用域） | save 时报错，提示改用覆盖（`--force`） |
| 跨作用域 version 冲突 | 合并时返回 `conflicts[]`，UI 高亮提示，不自动消解 |
| 成员数超过 `maxMembers`（默认 8） | apply 前校验，超限报错并指出超了几个 |
| domain 打开失败 | 插件降级为「仅文件作用域」，并在设置页顶部显示警告 |
| 导入 JSON 不合法 | 校验失败时返回具体字段路径 |

## 11. 打包与构建

- TypeScript；Host 侧 ESM 输出到 `lib/index.js`。
- Client 侧：esbuild 打成 CJS，再包一层
  ```js
  window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => { /* bundle */ return module.exports } })
  ```
  `external`: `react`、`react-dom`、`react/jsx-runtime`。
- `package.json` 关键字段：`exports`、`dsh.bundle`、`dsh.client = { platform: 'web', inject: ['remote', 'remote.commands', 'sessions', 'slots', 'locale'] }`（静态数组）、`peerDependencies: @deepseek-ai/cordis`。
- `icon.svg` ≤ 256 KiB；`locale/*.json` 提供 `meta.title` / `meta.description`。

## 12. 测试

- 单测（vitest）：合并规则、导入导出往返、prompt 引用解析、命令参数解析、校验失败路径。
- 集成（手动 + 脚本）：本机装插件 → 设置页 CRUD → 会话页头 apply → 验证 `list_agents` 出现新成员。
- 回归：不装本插件时，官方团队面板行为不变。

## 13. Step 0：必须先做的技术验证

正式实现前，用一个最小验证插件确认两件事（不通则整体方案要换）：

1. **`settings.plugins.tab` 可用**：client 侧注册该 slot 后，设置页出现插件页签，且能拿到渲染所需的 props。
2. **`ctx.remote.commands.execute` 客户端可达**：client `inject: ["remote", "remote.commands"]`，在页面里成功执行一条命令并拿到 `RemoteResult`。

若 2 不通，退化为：UI 只负责展示，动作通过 `ctx.remote.session.prompt` 让 Lead 自己调 `team_template_apply` 工具。

## 14. 风险

| 风险 | 缓解 |
|---|---|
| `settings.plugins.tab` 的 cardinality/scope 文档未写死 | Step 0 实测；不通则改挂 `conversation.composer.dock` |
| 命令通道的 JSON 文本返回值被截断或转义 | 限制单次返回体积，超过阈值改为分页 |
| 项目级文件与 domain 数据不一致 | 文件为权威，domain 不存 project 作用域 |
| 官方 `agentTeams` API 在 0.2.x 变动 | 只依赖文档化签名；升级时跑集成测试 |
| 插件升级后 slot 名变化 | 在 `apply` 里对注册失败做降级并写日志，不让整个 bundle 崩 |

## 15. 发布

- 仓库 `dsh-agent-team-templates`，MIT。
- README 覆盖：它解决什么、装法、三级作用域语义、命令速查、模板 JSON 格式、与官方面板的分工。
- 版本：v0.1.0 首发（核心），v0.2.0（模板源），v0.3.0（市场）。
