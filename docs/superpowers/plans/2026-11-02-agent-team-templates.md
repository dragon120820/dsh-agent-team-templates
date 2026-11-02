# 团队模板插件（v0.1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个 DSH 插件：把一套智能体团队成员定义存成模板，支持全局/项目/会话三级作用域，在会话里一键把成员建出来，并可导出导入 `.json`。

**Architecture:** 单包双面——Host 侧（ESM）负责模板存储、合并、命令与建成员；Client 侧（`__ModuleLoader__` 懒 CJS bundle）负责设置页模板库与会话页头应用入口。两侧唯一的通道是官方现成的 `ctx.commands.execute`（已带 `@Remote`）。团队运行时完全复用官方 `ctx.agentTeams`，不自建。

**Tech Stack:** TypeScript、esbuild（client bundle）、tsdown 或 tsc（host ESM）、vitest、zod（模板校验）、Schemastery（插件 Config）、Node 22+。

**Spec:** `docs/superpowers/specs/2026-11-02-agent-team-templates-design.md`

## Global Constraints

- 包名 `dsh-plugin-agent-team-templates`；仓库 `dsh-agent-team-templates`；MIT。
- Client 侧**禁止** `require` 任何 `@deepseek-ai/dsh-client-*` 包；只允许 `react`、`react-dom`、`react/jsx-runtime`。
- `package.json` 的 `dsh.client.inject` 必须是**静态数组字面量**，不能是函数或变量。
- **禁止**用新 `type` 追加会话事件；插件状态只走 `ctx.storageDomain` 与文件。
- 样式只用 `--dsw-alias-*` / `--dsw-elevation-*` token；类名统一 `att-` 前缀。
- 所有命令的 `CommandResult.text` 必须是**单行 JSON**。
- 三级作用域优先级：session > project > global；成员按 `name` 逐项覆盖。
- 项目级模板以 `<projectRoot>/.dsh/teams/<slug>.json` 文件为唯一权威，不写 domain。
- `projectRoot` 探测：从 cwd 向上找 `.closest .git`，找不到用 cwd（与官方 skills 口径一致）。
- 官方 `TeamMemberSnapshot` **不含 prompt**，`/team save` 只能生成骨架。
- 已存在的成员一律跳过（官方拒绝同名 spawn），v0.1 不提供更新成员能力。
- 每个 Task 结束都必须 `pnpm test` 通过并提交。

---

## 文件结构

```
dsh-agent-team-templates/
├── package.json
├── tsconfig.json
├── tsconfig.client.json
├── cordis.patch.yml
├── icon.svg
├── README.md
├── LICENSE
├── locale/{zh-CN.json,en-US.json}
├── scripts/build-client.mjs
├── src/
│   ├── host/
│   │   ├── index.ts          # apply(ctx, config)：装配 store / 命令 / 工具
│   │   ├── types.ts          # 模板类型 + zod schema
│   │   ├── merge.ts          # 三级合并（纯函数）
│   │   ├── store.ts          # domain + 文件读写
│   │   ├── prompt.ts         # prompt 解析（内联 / 文件引用）
│   │   ├── apply.ts          # 模板 → spawnTeammate
│   │   ├── commands.ts       # /team 命令
│   │   └── tools.ts          # team_template_list / team_template_apply
│   └── client/
│       ├── index.tsx         # __ModuleLoader__ 入口 + apply/inject
│       ├── api.ts            # 命令调用封装
│       ├── LibraryTab.tsx    # 设置页模板库
│       ├── TemplateEditor.tsx
│       ├── SessionButton.tsx # 会话页头
│       └── styles.ts
└── tests/
    ├── merge.test.ts
    ├── types.test.ts
    ├── prompt.test.ts
    └── commands-parse.test.ts
```

---

### Task 0: Step 0 技术验证（先做，不通则改方案）

**Files:**
- Create: `spike/package.json`
- Create: `spike/index.js`
- Create: `spike/client.js`
- Create: `spike/cordis.patch.yml`
- Create: `docs/notes/step0-findings.md`

**Interfaces:**
- Consumes: 无
- Produces: `docs/notes/step0-findings.md` 中的两项结论（slot 是否可用、`ctx.remote.commands` 是否可达），后续所有 Task 以该文件为准。

- [ ] **Step 1: 写验证用 Host 半**

`spike/index.js`：

```js
export const name = 'att-spike'
export const inject = ['commands']

export function apply(ctx) {
  ctx.commands.register({
    name: 'att-spike',
    description: 'ATT spike echo',
    handler: () => ({ kind: 'success', text: JSON.stringify({ ok: true, pid: process.pid }) }),
  })
  ctx.logger?.info?.('[att-spike] host applied')
}
```

- [ ] **Step 2: 写验证用 Client 半**

`spike/client.js`：

```js
window.__ModuleLoader__.load({
  id: 'att-spike',
  factory: (require) => {
    const React = require('react')
    const { jsx } = require('react/jsx-runtime')

    function Probe({ sessionId }) {
      const [out, setOut] = React.useState('idle')
      const run = async () => {
        try {
          const r = await window.__attCtx.remote.commands.execute(sessionId, '/att-spike', [], new AbortController().signal)
          setOut(JSON.stringify(r))
        } catch (e) {
          setOut('ERR ' + String(e))
        }
      }
      return jsx('div', { style: { padding: 8 }, children: [
        jsx('button', { key: 'b', onClick: run, children: 'probe command' }),
        jsx('pre', { key: 'p', children: out }),
      ] })
    }

    function apply(ctx) {
      window.__attCtx = ctx
      ctx.effect(() => ctx.slots.register(
        { name: 'conversation.session.header.actions', id: 'att-spike', order: -50 },
        Probe,
      ), 'att-spike:slot')
      try {
        ctx.slots.register(
          { name: 'settings.plugins.tab', id: 'att-spike', order: 10, title: 'ATT Spike' },
          () => jsx('div', { children: 'settings tab alive' }),
        )
        console.log('[att-spike] settings.plugins.tab registered')
      } catch (e) {
        console.log('[att-spike] settings.plugins.tab FAILED', String(e))
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'remote', 'remote.commands']
    return module.exports
  },
})
```

- [ ] **Step 3: 写验证包清单**

`spike/package.json`：

```json
{
  "name": "dsh-plugin-att-spike",
  "version": "0.0.1",
  "type": "module",
  "main": "index.js",
  "exports": { ".": "./index.js", "./client": "./client.js" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["sessions", "slots"] }
  }
}
```

`spike/cordis.patch.yml`：

```yaml
- insert:
    - id: att-spike
      name: dsh-plugin-att-spike
```

- [ ] **Step 4: 装进 profile 并重启**

```bash
cd "D:/codex/dsh-agent-team-templates/spike"
dsh plugin --profile desktop add ./ 
```

重启 DSH Desktop，打开任意会话，观察：

1. 会话页头是否出现 `probe command` 按钮；
2. 点击后是否打印 `{"ok":true,...}`；
3. 设置页是否出现 `ATT Spike` 页签；
4. 控制台是否有 `[att-spike] settings.plugins.tab registered` 或 `FAILED`。

- [ ] **Step 5: 记录结论**

新建 `docs/notes/step0-findings.md`，逐条记录：

```markdown
# Step 0 结论

## 1. settings.plugins.tab
- 是否可注册：是 / 否
- 若否，报错原文：
- 可用的替代 slot：

## 2. ctx.remote.commands.execute 客户端可达
- inject 是否被接受：是 / 否
- 调用返回形态（贴实际 JSON）：
- 命令结果 text 是否原样返回：

## 3. 后续任务的调整
- （列出因上述结论需要改动的 Task）
```

- [ ] **Step 6: 提交**

```bash
git add spike docs/notes/step0-findings.md
git commit -m "chore: step0 技术验证（slot + remote.commands）"
```

---

### Task 1: 项目脚手架与构建

**Files:**
- Create: `package.json`、`tsconfig.json`、`tsconfig.client.json`、`.gitignore`、`LICENSE`
- Create: `scripts/build-client.mjs`
- Create: `cordis.patch.yml`、`icon.svg`、`locale/zh-CN.json`、`locale/en-US.json`

**Interfaces:**
- Consumes: Task 0 的 `docs/notes/step0-findings.md`
- Produces: `pnpm build` 能产出 `lib/index.js`（Host ESM）与 `lib/client.js`（`__ModuleLoader__` 壳），后续 Task 直接往里加文件。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "dsh-plugin-agent-team-templates",
  "version": "0.1.0",
  "description": "Team templates for DSH agent teams: save, share and apply a team roster across global / project / session scopes.",
  "type": "module",
  "license": "MIT",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["lib", "locale", "icon.svg", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["remote", "remote.commands", "sessions", "slots", "locale"]
    }
  },
  "scripts": {
    "build:host": "tsc -p tsconfig.json",
    "build:client": "node scripts/build-client.mjs",
    "build": "pnpm build:host && pnpm build:client",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "~4.0.5"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.12",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 写 tsconfig**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "lib",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src/host/**/*.ts"],
  "exclude": ["src/client"]
}
```

`tsconfig.client.json`（只用于类型检查，不产出）：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "declaration": false, "jsx": "react-jsx" },
  "include": ["src/client/**/*.ts", "src/client/**/*.tsx"]
}
```

- [ ] **Step 3: 写 client 构建脚本**

`scripts/build-client.mjs`：

```js
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const result = await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  sourcemap: false,
})

const body = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(pkg.name)},\n  factory: (require) => {\n${body}\n    return module.exports\n  }\n})\n`

await mkdir('lib', { recursive: true })
await writeFile('lib/client.js', wrapped, 'utf8')
console.log('lib/client.js', wrapped.length, 'bytes')
```

- [ ] **Step 4: 写包组合与元数据**

`cordis.patch.yml`：

```yaml
- insert:
    - id: agent-team-templates
      name: dsh-plugin-agent-team-templates
```

`locale/zh-CN.json`：

```json
{
  "meta.title": "团队模板",
  "meta.description": "把一套团队成员存成模板，按全局 / 项目 / 会话三级复用，一键装进当前会话。"
}
```

`locale/en-US.json`：

```json
{
  "meta.title": "Team Templates",
  "meta.description": "Save an agent team roster as a template, reuse it across global / project / session scopes, apply it to a session in one click."
}
```

`icon.svg`：一个 24×24 的简单图标（三个圆点 + 外框），≤ 4 KiB。

`.gitignore`：

```
node_modules/
lib/
*.tsbuildinfo
.tmp/
```

- [ ] **Step 5: 验证构建产物**

```bash
pnpm install
pnpm build
node -e "const s=require('fs').readFileSync('lib/client.js','utf8'); if(!s.startsWith('window.__ModuleLoader__.load(')) throw new Error('bad wrapper'); console.log('ok', s.length)"
```

Expected: 打印 `ok <bytes>`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: 脚手架与双面构建（host ESM + client bundle）"
```

---

### Task 2: 模板类型与校验

**Files:**
- Create: `src/host/types.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `type TemplateScope = 'global' | 'project' | 'session'`
  - `type MemberContext = 'fresh' | 'fork'`
  - `interface TemplateMember { name: string; description: string; prompt: string | { file: string }; context: MemberContext; provider?: string }`
  - `interface TeamTemplate { id: string; name: string; description: string; version: number; members: TemplateMember[]; updatedAt: number; source?: { kind: 'file' | 'builtin'; ref?: string } }`
  - `const templateSchema: z.ZodType<TeamTemplate>`
  - `function parseTemplate(input: unknown): { ok: true; value: TeamTemplate } | { ok: false; error: string }`
  - `function slugify(name: string): string`

- [ ] **Step 1: 写失败测试**

`tests/types.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseTemplate, slugify } from '../src/host/types'

const valid = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'vaha-ops',
  description: '运维团队',
  version: 1,
  updatedAt: 1730000000000,
  members: [
    { name: 'prod-triage', description: '生产只读诊断', prompt: { file: '.team/roles/prod-triage.md' }, context: 'fresh' },
  ],
}

describe('parseTemplate', () => {
  it('接受合法模板', () => {
    const r = parseTemplate(valid)
    expect(r.ok).toBe(true)
  })

  it('拒绝缺少 members 的输入', () => {
    const r = parseTemplate({ ...valid, members: undefined })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('members')
  })

  it('拒绝空成员名', () => {
    const r = parseTemplate({ ...valid, members: [{ ...valid.members[0], name: '' }] })
    expect(r.ok).toBe(false)
  })

  it('拒绝重复成员名', () => {
    const r = parseTemplate({ ...valid, members: [valid.members[0], valid.members[0]] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('duplicate')
  })

  it('拒绝非法 context', () => {
    const r = parseTemplate({ ...valid, members: [{ ...valid.members[0], context: 'resume' }] })
    expect(r.ok).toBe(false)
  })

  it('prompt 允许纯文本', () => {
    const r = parseTemplate({ ...valid, members: [{ ...valid.members[0], prompt: '你是诊断专家' }] })
    expect(r.ok).toBe(true)
  })
})

describe('slugify', () => {
  it('转小写并用连字符', () => {
    expect(slugify('Vaha Ops Team')).toBe('vaha-ops-team')
  })
  it('保留中文以外的可读性，非 ASCII 退回 id 片段', () => {
    expect(slugify('运维团队')).toMatch(/^[a-z0-9-]+$/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/types.test.ts`
Expected: FAIL，`Cannot find module '../src/host/types'`

- [ ] **Step 3: 实现**

`src/host/types.ts`：

```ts
import { z } from 'zod'

export type TemplateScope = 'global' | 'project' | 'session'
export type MemberContext = 'fresh' | 'fork'

export interface TemplateMember {
  name: string
  description: string
  prompt: string | { file: string }
  context: MemberContext
  provider?: string
}

export interface TeamTemplate {
  id: string
  name: string
  description: string
  version: number
  members: TemplateMember[]
  updatedAt: number
  source?: { kind: 'file' | 'builtin'; ref?: string }
}

const memberSchema = z.object({
  name: z.string().min(1, 'member name is required'),
  description: z.string().default(''),
  prompt: z.union([z.string(), z.object({ file: z.string().min(1) })]),
  context: z.enum(['fresh', 'fork']).default('fresh'),
  provider: z.string().optional(),
})

const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.number().int().positive().default(1),
  members: z.array(memberSchema).min(1, 'members must not be empty'),
  updatedAt: z.number().int().nonnegative().default(() => Date.now()),
  source: z.object({ kind: z.enum(['file', 'builtin']), ref: z.string().optional() }).optional(),
})

export function parseTemplate(input: unknown): { ok: true; value: TeamTemplate } | { ok: false; error: string } {
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: `${first.path.join('.') || '<root>'}: ${first.message}` }
  }
  const names = new Set<string>()
  for (const m of parsed.data.members) {
    if (names.has(m.name)) return { ok: false, error: `duplicate member name: ${m.name}` }
    names.add(m.name)
  }
  return { ok: true, value: parsed.data as TeamTemplate }
}

export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length > 0) return ascii.slice(0, 64)
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `tpl-${h.toString(36)}`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/types.test.ts`
Expected: PASS（9 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/types.ts tests/types.test.ts
git commit -m "feat(host): 模板类型与 zod 校验"
```

---

### Task 3: 三级合并

**Files:**
- Create: `src/host/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: `TeamTemplate`、`TemplateMember`（Task 2）
- Produces:
  - `interface MergeInput { global?: TeamTemplate; project?: TeamTemplate; session?: TeamTemplate }`
  - `interface MergeResult { effective: TeamTemplate; conflicts: string[] }`
  - `function mergeTemplates(input: MergeInput): MergeResult`

- [ ] **Step 1: 写失败测试**

`tests/merge.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mergeTemplates } from '../src/host/merge'
import type { TeamTemplate } from '../src/host/types'

const tpl = (over: Partial<TeamTemplate>): TeamTemplate => ({
  id: 'id-' + Math.random().toString(36).slice(2),
  name: 'ops',
  description: '',
  version: 1,
  members: [],
  updatedAt: 1,
  ...over,
})

describe('mergeTemplates', () => {
  it('只有 global 时原样返回', () => {
    const g = tpl({ members: [{ name: 'a', description: 'A', prompt: 'pa', context: 'fresh' }] })
    const r = mergeTemplates({ global: g })
    expect(r.effective.members.map((m) => m.name)).toEqual(['a'])
    expect(r.conflicts).toEqual([])
  })

  it('高层成员覆盖低层同名字段', () => {
    const g = tpl({ members: [{ name: 'a', description: 'old', prompt: 'p1', context: 'fresh' }] })
    const p = tpl({ members: [{ name: 'a', description: 'new', prompt: 'p2', context: 'fork' }] })
    const r = mergeTemplates({ global: g, project: p })
    expect(r.effective.members).toHaveLength(1)
    expect(r.effective.members[0].description).toBe('new')
    expect(r.effective.members[0].context).toBe('fork')
  })

  it('合并不同名成员', () => {
    const g = tpl({ members: [{ name: 'a', description: '', prompt: 'p', context: 'fresh' }] })
    const s = tpl({ members: [{ name: 'b', description: '', prompt: 'p', context: 'fresh' }] })
    const r = mergeTemplates({ global: g, session: s })
    expect(r.effective.members.map((m) => m.name).sort()).toEqual(['a', 'b'])
  })

  it('version 不同时报告冲突', () => {
    const g = tpl({ version: 1, members: [{ name: 'a', description: '', prompt: 'p', context: 'fresh' }] })
    const p = tpl({ version: 3, members: [] })
    const r = mergeTemplates({ global: g, project: p })
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toContain('version')
  })

  it('session 优先级最高', () => {
    const g = tpl({ members: [{ name: 'a', description: 'g', prompt: 'p', context: 'fresh' }] })
    const p = tpl({ members: [{ name: 'a', description: 'p', prompt: 'p', context: 'fresh' }] })
    const s = tpl({ members: [{ name: 'a', description: 's', prompt: 'p', context: 'fresh' }] })
    const r = mergeTemplates({ global: g, project: p, session: s })
    expect(r.effective.members[0].description).toBe('s')
  })

  it('全部为空时抛错', () => {
    expect(() => mergeTemplates({})).toThrow(/at least one/)
  })

  it('成员按 name 排序，保证可复现', () => {
    const g = tpl({ members: [
      { name: 'zeta', description: '', prompt: 'p', context: 'fresh' },
      { name: 'alpha', description: '', prompt: 'p', context: 'fresh' },
    ] })
    const r = mergeTemplates({ global: g })
    expect(r.effective.members.map((m) => m.name)).toEqual(['alpha', 'zeta'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/merge.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/host/merge.ts`：

```ts
import type { TeamTemplate, TemplateMember } from './types'

export interface MergeInput {
  global?: TeamTemplate
  project?: TeamTemplate
  session?: TeamTemplate
}

export interface MergeResult {
  effective: TeamTemplate
  conflicts: string[]
}

const ORDER = ['global', 'project', 'session'] as const

export function mergeTemplates(input: MergeInput): MergeResult {
  const layers = ORDER.map((k) => input[k]).filter((t): t is TeamTemplate => Boolean(t))
  if (layers.length === 0) throw new Error('mergeTemplates: at least one template layer is required')

  const byName = new Map<string, TemplateMember>()
  const conflicts: string[] = []
  const versions = new Map<string, number>()

  for (const layer of layers) {
    if (layer.version !== 1) {
      const prev = versions.get(layer.name)
      if (prev !== undefined && prev !== layer.version) {
        conflicts.push(`version conflict for "${layer.name}": ${prev} vs ${layer.version}`)
      }
      versions.set(layer.name, layer.version)
    }
    for (const m of layer.members) {
      const prev = byName.get(m.name)
      byName.set(m.name, prev ? { ...prev, ...m } : { ...m })
    }
  }

  const top = layers[layers.length - 1]
  const members = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    effective: { ...top, members },
    conflicts,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/merge.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/merge.ts tests/merge.test.ts
git commit -m "feat(host): 三级模板合并（session > project > global）"
```

---

### Task 4: prompt 解析

**Files:**
- Create: `src/host/prompt.ts`
- Test: `tests/prompt.test.ts`

**Interfaces:**
- Consumes: `TemplateMember`（Task 2）
- Produces:
  - `function resolvePrompt(member: TemplateMember, projectRoot: string, read: (abs: string) => Promise<string | undefined>): Promise<{ ok: true; text: string } | { ok: false; missing: string }>`
  - `async function resolveAll(members: TemplateMember[], projectRoot: string, read: (abs: string) => Promise<string | undefined>): Promise<{ ok: true; resolved: { member: TemplateMember; text: string }[] } | { ok: false; missing: string[] }>`

- [ ] **Step 1: 写失败测试**

`tests/prompt.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { resolvePrompt, resolveAll } from '../src/host/prompt'
import type { TemplateMember } from '../src/host/types'
import path from 'node:path'

const root = '/proj'
const fs = (files: Record<string, string>) => async (abs: string) => files[abs]

const m = (prompt: TemplateMember['prompt']): TemplateMember => ({ name: 'a', description: '', prompt, context: 'fresh' })

describe('resolvePrompt', () => {
  it('内联文本原样返回', async () => {
    const r = await resolvePrompt(m('hello'), root, fs({}))
    expect(r).toEqual({ ok: true, text: 'hello' })
  })

  it('文件引用按项目根解析并读取', async () => {
    const abs = path.resolve(root, '.team/roles/a.md')
    const r = await resolvePrompt(m({ file: '.team/roles/a.md' }), root, fs({ [abs]: 'ROLE' }))
    expect(r).toEqual({ ok: true, text: 'ROLE' })
  })

  it('文件缺失时报告路径', async () => {
    const r = await resolvePrompt(m({ file: '.team/roles/missing.md' }), root, fs({}))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('missing.md')
  })

  it('绝对路径引用直接使用', async () => {
    const abs = '/abs/role.md'
    const r = await resolvePrompt(m({ file: abs }), root, fs({ [abs]: 'X' }))
    expect(r).toEqual({ ok: true, text: 'X' })
  })
})

describe('resolveAll', () => {
  it('全部命中时返回解析结果', async () => {
    const r = await resolveAll([m('a'), m('b')], root, fs({}))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.resolved).toHaveLength(2)
  })

  it('有缺失时一次性列出全部缺失路径', async () => {
    const r = await resolveAll([m({ file: 'x.md' }), m({ file: 'y.md' })], root, fs({}))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/prompt.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/host/prompt.ts`：

```ts
import path from 'node:path'
import type { TemplateMember } from './types'

export type ReadFile = (abs: string) => Promise<string | undefined>

export async function resolvePrompt(
  member: TemplateMember,
  projectRoot: string,
  read: ReadFile,
): Promise<{ ok: true; text: string } | { ok: false; missing: string }> {
  if (typeof member.prompt === 'string') return { ok: true, text: member.prompt }
  const abs = path.isAbsolute(member.prompt.file)
    ? member.prompt.file
    : path.resolve(projectRoot, member.prompt.file)
  const text = await read(abs)
  if (text === undefined) return { ok: false, missing: abs }
  return { ok: true, text }
}

export async function resolveAll(
  members: TemplateMember[],
  projectRoot: string,
  read: ReadFile,
): Promise<
  | { ok: true; resolved: { member: TemplateMember; text: string }[] }
  | { ok: false; missing: string[] }
> {
  const missing: string[] = []
  const resolved: { member: TemplateMember; text: string }[] = []
  for (const member of members) {
    const r = await resolvePrompt(member, projectRoot, read)
    if (r.ok) resolved.push({ member, text: r.text })
    else missing.push(r.missing)
  }
  if (missing.length > 0) return { ok: false, missing }
  return { ok: true, resolved }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/prompt.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/prompt.ts tests/prompt.test.ts
git commit -m "feat(host): prompt 内联/文件引用解析"
```

---

### Task 5: 存储层（domain + 项目文件）

**Files:**
- Create: `src/host/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `TeamTemplate`、`parseTemplate`、`slugify`（Task 2）
- Produces:
  - `interface StoreDeps { domain: DomainLike; fs: FsLike; projectRoot: string }`
  - `interface DomainLike { get(key: string): unknown; set(key: string, v: unknown): Promise<void>; delete(key: string): Promise<void>; entries(): [string, unknown][] }`
  - `interface FsLike { readText(abs: string): Promise<string | undefined>; writeText(abs: string, text: string): Promise<void>; listDir(abs: string): Promise<string[]>; resolve(...parts: string[]): string }`
  - `class TemplateStore { constructor(deps); list(scope, sessionId): Promise<TeamTemplate[]>; get(name, scope, sessionId): Promise<TeamTemplate | undefined>; save(t, scope, sessionId, opts?): Promise<void>; remove(name, scope, sessionId): Promise<void> }`

- [ ] **Step 1: 写失败测试**

`tests/store.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { TemplateStore } from '../src/host/store'
import type { TeamTemplate } from '../src/host/types'
import path from 'node:path'

function memDomain() {
  const map = new Map<string, unknown>()
  return {
    get: (k: string) => map.get(k),
    set: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
    entries: () => [...map.entries()] as [string, unknown][],
  }
}

function memFs() {
  const files = new Map<string, string>()
  return {
    files,
    readText: async (p: string) => files.get(p),
    writeText: async (p: string, t: string) => void files.set(p, t),
    listDir: async (p: string) => [...files.keys()].filter((f) => path.dirname(f) === p).map((f) => path.basename(f)),
    resolve: (...parts: string[]) => path.resolve(...parts),
  }
}

const tpl = (name: string, over: Partial<TeamTemplate> = {}): TeamTemplate => ({
  id: 'id-' + name,
  name,
  description: '',
  version: 1,
  members: [{ name: 'm1', description: '', prompt: 'p', context: 'fresh' }],
  updatedAt: 1,
  ...over,
})

describe('TemplateStore', () => {
  let domain: ReturnType<typeof memDomain>
  let fs: ReturnType<typeof memFs>
  let store: TemplateStore
  const root = '/proj'

  beforeEach(() => {
    domain = memDomain()
    fs = memFs()
    store = new TemplateStore({ domain, fs, projectRoot: root })
  })

  it('global 模板存进 domain 并能读回', async () => {
    await store.save(tpl('ops'), 'global', 's1')
    const list = await store.list('global', 's1')
    expect(list.map((t) => t.name)).toEqual(['ops'])
  })

  it('project 模板写成项目目录文件', async () => {
    await store.save(tpl('ops'), 'project', 's1')
    const expected = path.resolve(root, '.dsh/teams/ops.json')
    expect(fs.files.has(expected)).toBe(true)
    const list = await store.list('project', 's1')
    expect(list.map((t) => t.name)).toEqual(['ops'])
  })

  it('session 模板按 sessionId 隔离', async () => {
    await store.save(tpl('ops'), 'session', 's1')
    expect((await store.list('session', 's1')).map((t) => t.name)).toEqual(['ops'])
    expect(await store.list('session', 's2')).toEqual([])
  })

  it('同名保存默认报错，force 时覆盖', async () => {
    await store.save(tpl('ops'), 'global', 's1')
    await expect(store.save(tpl('ops', { description: 'x' }), 'global', 's1')).rejects.toThrow(/already exists/)
    await store.save(tpl('ops', { description: 'x' }), 'global', 's1', { force: true })
    const got = await store.get('ops', 'global', 's1')
    expect(got?.description).toBe('x')
  })

  it('remove 删除对应作用域', async () => {
    await store.save(tpl('ops'), 'project', 's1')
    await store.remove('ops', 'project', 's1')
    expect(await store.list('project', 's1')).toEqual([])
  })

  it('项目文件损坏时跳过并记警告，不影响其它模板', async () => {
    await store.save(tpl('good'), 'project', 's1')
    fs.files.set(path.resolve(root, '.dsh/teams/bad.json'), '{not json')
    const list = await store.list('project', 's1')
    expect(list.map((t) => t.name)).toEqual(['good'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/store.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/host/store.ts`：

```ts
import path from 'node:path'
import { parseTemplate, slugify, type TeamTemplate, type TemplateScope } from './types'

export interface DomainLike {
  get(key: string): unknown
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  entries(): [string, unknown][]
}

export interface FsLike {
  readText(abs: string): Promise<string | undefined>
  writeText(abs: string, text: string): Promise<void>
  listDir(abs: string): Promise<string[]>
  resolve(...parts: string[]): string
}

export interface StoreDeps {
  domain: DomainLike
  fs: FsLike
  projectRoot: string
  warn?: (msg: string) => void
}

const TEAMS_DIR = '.dsh/teams'

export class TemplateStore {
  private readonly domain: DomainLike
  private readonly fs: FsLike
  private readonly projectRoot: string
  private readonly warn: (msg: string) => void

  constructor(deps: StoreDeps) {
    this.domain = deps.domain
    this.fs = deps.fs
    this.projectRoot = deps.projectRoot
    this.warn = deps.warn ?? (() => {})
  }

  private dir(): string {
    return this.fs.resolve(this.projectRoot, TEAMS_DIR)
  }

  private key(scope: TemplateScope, sessionId: string, name: string): string {
    if (scope === 'global') return `global:${name}`
    if (scope === 'session') return `session:${sessionId}:${name}`
    throw new Error('project scope is file-backed')
  }

  async list(scope: TemplateScope, sessionId: string): Promise<TeamTemplate[]> {
    if (scope === 'project') return this.listProject()
    const prefix = scope === 'global' ? 'global:' : `session:${sessionId}:`
    const out: TeamTemplate[] = []
    for (const [k, v] of this.domain.entries()) {
      if (!k.startsWith(prefix)) continue
      const parsed = parseTemplate(v)
      if (parsed.ok) out.push(parsed.value)
      else this.warn(`[team-templates] skip bad record ${k}: ${parsed.error}`)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(name: string, scope: TemplateScope, sessionId: string): Promise<TeamTemplate | undefined> {
    if (scope === 'project') {
      const file = this.fs.resolve(this.dir(), `${slugify(name)}.json`)
      const text = await this.fs.readText(file)
      if (text === undefined) return undefined
      const parsed = parseTemplate(safeJson(text))
      return parsed.ok ? parsed.value : undefined
    }
    const parsed = parseTemplate(this.domain.get(this.key(scope, sessionId, name)))
    return parsed.ok ? parsed.value : undefined
  }

  async save(
    template: TeamTemplate,
    scope: TemplateScope,
    sessionId: string,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    const existing = await this.get(template.name, scope, sessionId)
    if (existing && !opts.force) {
      throw new Error(`template "${template.name}" already exists in ${scope} scope (use --force to overwrite)`)
    }
    const value: TeamTemplate = { ...template, updatedAt: Date.now() }
    if (scope === 'project') {
      await this.fs.writeText(
        this.fs.resolve(this.dir(), `${slugify(template.name)}.json`),
        JSON.stringify(value, null, 2) + '\n',
      )
      return
    }
    await this.domain.set(this.key(scope, sessionId, template.name), value)
  }

  async remove(name: string, scope: TemplateScope, sessionId: string): Promise<void> {
    if (scope === 'project') {
      await this.fs.writeText(this.fs.resolve(this.dir(), `${slugify(name)}.json`), '')
      return
    }
    await this.domain.delete(this.key(scope, sessionId, name))
  }

  private async listProject(): Promise<TeamTemplate[]> {
    let names: string[]
    try {
      names = await this.fs.listDir(this.dir())
    } catch {
      return []
    }
    const out: TeamTemplate[] = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      const abs = this.fs.resolve(this.dir(), n)
      const text = await this.fs.readText(abs)
      if (!text) continue
      const parsed = parseTemplate(safeJson(text))
      if (parsed.ok) out.push({ ...parsed.value, source: { kind: 'file', ref: abs } })
      else this.warn(`[team-templates] skip bad file ${abs}: ${parsed.error}`)
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/store.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/store.ts tests/store.test.ts
git commit -m "feat(host): 三级模板存储（domain + 项目文件）"
```

---

### Task 6: 应用模板（spawn 成员）

**Files:**
- Create: `src/host/apply.ts`
- Test: `tests/apply.test.ts`

**Interfaces:**
- Consumes: `TeamTemplate`（Task 2）、`resolveAll`（Task 4）
- Produces:
  - `interface ApplyResult { ok: boolean; spawned: string[]; skipped: { name: string; differs: boolean }[]; failed: { name: string; error: string }[] }`
  - `interface TeamApi { membership(agent: unknown): { role: string; teamId: string }; listMembers(agent: unknown): { name: string; description?: string; context?: string }[]; spawnTeammate(caller: unknown, req: { name: string; description: string; prompt: string; context: string }): Promise<unknown> }`
  - `async function applyTemplate(api: TeamApi, agents: { get(id: string): unknown }, agent: unknown, tpl: TeamTemplate, projectRoot: string, read: ReadFile, maxMembers: number): Promise<ApplyResult>`

- [ ] **Step 1: 写失败测试**

`tests/apply.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { applyTemplate } from '../src/host/apply'
import type { TeamTemplate } from '../src/host/types'

const tpl: TeamTemplate = {
  id: 'i', name: 'ops', description: '', version: 1, updatedAt: 1,
  members: [
    { name: 'a', description: 'A', prompt: 'pa', context: 'fresh' },
    { name: 'b', description: 'B', prompt: 'pb', context: 'fork' },
  ],
}

function fakeApi(existing: string[] = [], role = 'lead') {
  const spawned: string[] = []
  const api = {
    membership: vi.fn(() => ({ role, teamId: 'sess-1' })),
    listMembers: vi.fn(() => existing.map((n) => ({ name: n, description: 'old' }))),
    spawnTeammate: vi.fn(async (_c: unknown, r: { name: string }) => {
      spawned.push(r.name)
      return { ok: true }
    }),
  }
  return { api, spawned }
}

const agents = { get: vi.fn(() => ({ id: 'lead' })) }
const read = async () => 'x'

describe('applyTemplate', () => {
  it('全部新建', async () => {
    const { api, spawned } = fakeApi()
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 8)
    expect(r.ok).toBe(true)
    expect(spawned).toEqual(['a', 'b'])
  })

  it('非 Lead 会话直接失败', async () => {
    const { api } = fakeApi([], 'teammate')
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 8)
    expect(r.ok).toBe(false)
    expect(r.failed[0].error).toContain('lead')
  })

  it('已存在成员跳过并标记 differs', async () => {
    const { api, spawned } = fakeApi(['a'])
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 8)
    expect(spawned).toEqual(['b'])
    expect(r.skipped).toEqual([{ name: 'a', differs: true }])
  })

  it('已存在且定义一致时 differs=false', async () => {
    const { api } = fakeApi(['a'])
    api.listMembers = vi.fn(() => [{ name: 'a', description: 'A', context: 'fresh' }])
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 8)
    expect(r.skipped).toEqual([{ name: 'a', differs: false }])
  })

  it('成员数超限时报错且不 spawn', async () => {
    const { api, spawned } = fakeApi()
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 1)
    expect(r.ok).toBe(false)
    expect(spawned).toEqual([])
    expect(r.failed[0].error).toContain('maxMembers')
  })

  it('prompt 文件缺失时整体失败且不 spawn', async () => {
    const { api, spawned } = fakeApi()
    const t: TeamTemplate = { ...tpl, members: [{ name: 'a', description: '', prompt: { file: 'x.md' }, context: 'fresh' }] }
    const r = await applyTemplate(api, agents, {}, t, '/p', async () => undefined, 8)
    expect(r.ok).toBe(false)
    expect(spawned).toEqual([])
  })

  it('单个成员失败不影响其它成员', async () => {
    const { api } = fakeApi()
    let n = 0
    api.spawnTeammate = vi.fn(async () => {
      n++
      if (n === 1) throw new Error('boom')
      return {}
    })
    const r = await applyTemplate(api, agents, {}, tpl, '/p', read, 8)
    expect(r.ok).toBe(false)
    expect(r.failed.map((f) => f.name)).toEqual(['a'])
    expect(r.spawned).toEqual(['b'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/apply.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/host/apply.ts`：

```ts
import type { TeamTemplate } from './types'
import { resolveAll, type ReadFile } from './prompt'

export interface ApplyResult {
  ok: boolean
  spawned: string[]
  skipped: { name: string; differs: boolean }[]
  failed: { name: string; error: string }[]
}

export interface TeamApi {
  membership(agent: unknown): { role: string; teamId: string }
  listMembers(agent: unknown): { name: string; description?: string; context?: string }[]
  spawnTeammate(
    caller: unknown,
    request: { name: string; description: string; prompt: string; context: string },
  ): Promise<unknown>
}

export interface AgentsApi {
  get(id: string): unknown
}

export async function applyTemplate(
  api: TeamApi,
  agents: AgentsApi,
  agent: unknown,
  tpl: TeamTemplate,
  projectRoot: string,
  read: ReadFile,
  maxMembers: number,
): Promise<ApplyResult> {
  const result: ApplyResult = { ok: true, spawned: [], skipped: [], failed: [] }

  const membership = api.membership(agent)
  if (membership.role !== 'lead') {
    result.ok = false
    result.failed.push({ name: '<team>', error: 'only the lead session can spawn team members' })
    return result
  }

  if (tpl.members.length > maxMembers) {
    result.ok = false
    result.failed.push({
      name: '<team>',
      error: `template has ${tpl.members.length} members, exceeds maxMembers=${maxMembers}`,
    })
    return result
  }

  const resolved = await resolveAll(tpl.members, projectRoot, read)
  if (!resolved.ok) {
    result.ok = false
    result.failed.push({ name: '<prompt>', error: `missing prompt files: ${resolved.missing.join(', ')}` })
    return result
  }

  const lead = agents.get(membership.teamId)
  const existing = new Map(api.listMembers(lead).map((m) => [m.name, m]))

  for (const { member, text } of resolved.resolved) {
    const cur = existing.get(member.name)
    if (cur) {
      const differs = (cur.description ?? '') !== member.description || (cur.context ?? 'fresh') !== member.context
      result.skipped.push({ name: member.name, differs })
      continue
    }
    try {
      await api.spawnTeammate(lead, {
        name: member.name,
        description: member.description,
        prompt: text,
        context: member.context,
      })
      result.spawned.push(member.name)
    } catch (e) {
      result.ok = false
      result.failed.push({ name: member.name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (result.failed.length > 0) result.ok = false
  return result
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/apply.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/apply.ts tests/apply.test.ts
git commit -m "feat(host): 模板应用（spawn 成员、跳过已存在、逐项报错）"
```

---

### Task 7: 命令解析与注册

**Files:**
- Create: `src/host/commands.ts`
- Test: `tests/commands-parse.test.ts`

**Interfaces:**
- Consumes: `TemplateStore`（Task 5）、`applyTemplate`（Task 6）、`mergeTemplates`（Task 3）
- Produces:
  - `type Parsed = { sub: 'list'; scope?: TemplateScope } | { sub: 'show' | 'apply' | 'delete' | 'export'; name: string; scope?: TemplateScope } | { sub: 'save'; name: string; scope: TemplateScope } | { sub: 'import'; json: string }`
  - `function parseTeamInput(raw: string): Parsed | { error: string }`
  - `function registerTeamCommand(ctx: CommandCtx, deps: CommandDeps): void`

- [ ] **Step 1: 写失败测试**

`tests/commands-parse.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseTeamInput } from '../src/host/commands'

describe('parseTeamInput', () => {
  it('list 默认无 scope', () => {
    expect(parseTeamInput('list')).toEqual({ sub: 'list' })
  })
  it('list 带 scope', () => {
    expect(parseTeamInput('list --scope=project')).toEqual({ sub: 'list', scope: 'project' })
  })
  it('show 带名字', () => {
    expect(parseTeamInput('show ops')).toEqual({ sub: 'show', name: 'ops' })
  })
  it('apply 带名字与 scope', () => {
    expect(parseTeamInput('apply ops --scope=session')).toEqual({ sub: 'apply', name: 'ops', scope: 'session' })
  })
  it('save 默认 project 作用域', () => {
    expect(parseTeamInput('save my-team')).toEqual({ sub: 'save', name: 'my-team', scope: 'project' })
  })
  it('import 接受 JSON 串', () => {
    const r = parseTeamInput('import {"id":"x","name":"n","members":[]}')
    expect(r).toMatchObject({ sub: 'import' })
  })
  it('空输入报错', () => {
    expect(parseTeamInput('')).toHaveProperty('error')
  })
  it('未知子命令报错', () => {
    expect(parseTeamInput('frobnicate')).toHaveProperty('error')
  })
  it('非法 scope 报错', () => {
    expect(parseTeamInput('list --scope=universe')).toHaveProperty('error')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run tests/commands-parse.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现**

`src/host/commands.ts`：

```ts
import type { TemplateScope, TeamTemplate } from './types'
import { parseTemplate } from './types'
import { mergeTemplates } from './merge'
import type { TemplateStore } from './store'
import { applyTemplate, type ApplyResult } from './apply'
import type { ReadFile } from './prompt'

export type Parsed =
  | { sub: 'list'; scope?: TemplateScope }
  | { sub: 'show'; name: string; scope?: TemplateScope }
  | { sub: 'apply'; name: string; scope?: TemplateScope }
  | { sub: 'delete'; name: string; scope: TemplateScope }
  | { sub: 'export'; name: string; scope?: TemplateScope }
  | { sub: 'save'; name: string; scope: TemplateScope }
  | { sub: 'import'; json: string }

const SCOPES: TemplateScope[] = ['global', 'project', 'session']

export function parseTeamInput(raw: string): Parsed | { error: string } {
  const text = raw.trim()
  if (!text) return { error: 'usage: /team <list|show|save|apply|delete|export|import> [name] [--scope=...]' }
  if (text.startsWith('import')) {
    const json = text.slice('import'.length).trim()
    if (!json) return { error: 'import requires a JSON payload' }
    return { sub: 'import', json }
  }
  const tokens = text.split(/\s+/)
  const sub = tokens[0]
  const scopeArg = tokens.find((t) => t.startsWith('--scope='))
  let scope: TemplateScope | undefined
  if (scopeArg) {
    const v = scopeArg.slice('--scope='.length) as TemplateScope
    if (!SCOPES.includes(v)) return { error: `invalid scope "${v}"; expected global|project|session` }
    scope = v
  }
  const name = tokens[1] && !tokens[1].startsWith('--') ? tokens[1] : undefined

  switch (sub) {
    case 'list':
      return { sub: 'list', scope }
    case 'show':
    case 'apply':
    case 'export':
      if (!name) return { error: `${sub} requires a template name` }
      return { sub, name, scope }
    case 'delete':
      if (!name) return { error: 'delete requires a template name' }
      if (!scope) return { error: 'delete requires --scope=global|project|session' }
      return { sub: 'delete', name, scope }
    case 'save':
      if (!name) return { error: 'save requires a template name' }
      return { sub: 'save', name, scope: scope ?? 'project' }
    default:
      return { error: `unknown subcommand "${sub}"` }
  }
}

export interface CommandCtx {
  commands: { register(def: unknown): () => void }
  agentTeams: {
    membership(agent: unknown): { role: string; teamId: string }
    listMembers(agent: unknown): { name: string; description?: string; context?: string; provider?: string }[]
    spawnTeammate(caller: unknown, req: unknown): Promise<unknown>
  }
  agents: { get(id: string): unknown }
}

export interface CommandDeps {
  store: TemplateStore
  read: ReadFile
  projectRootOf(agent: unknown): string
  maxMembers: number
}

export function registerTeamCommand(ctx: CommandCtx, deps: CommandDeps): void {
  ctx.commands.register({
    name: 'team',
    description: 'Manage and apply agent-team templates',
    handler: async (invocation: { agent: unknown; rawInput: string }) => {
      const parsed = parseTeamInput(invocation.rawInput)
      if ('error' in parsed) return { kind: 'error', text: parsed.error }

      const sessionId = ctx.agentTeams.membership(invocation.agent).teamId
      const projectRoot = deps.projectRootOf(invocation.agent)

      try {
        switch (parsed.sub) {
          case 'list': {
            const scopes = parsed.scope ? [parsed.scope] : SCOPES
            const out: Record<string, unknown> = {}
            for (const s of scopes) out[s] = await deps.store.list(s, sessionId)
            return ok(out)
          }
          case 'show': {
            const t = await loadMerged(deps, parsed.name, sessionId)
            return t ? ok(t) : err(`template "${parsed.name}" not found`)
          }
          case 'export': {
            const t = await loadMerged(deps, parsed.name, sessionId)
            return t ? ok(t) : err(`template "${parsed.name}" not found`)
          }
          case 'apply': {
            const t = await loadMerged(deps, parsed.name, sessionId)
            if (!t) return err(`template "${parsed.name}" not found`)
            const result: ApplyResult = await applyTemplate(
              ctx.agentTeams,
              ctx.agents,
              invocation.agent,
              t,
              projectRoot,
              deps.read,
              deps.maxMembers,
            )
            return ok(result)
          }
          case 'save': {
            const lead = ctx.agents.get(sessionId)
            const members = ctx.agentTeams.listMembers(lead).map((m) => ({
              name: m.name,
              description: m.description ?? '',
              prompt: '',
              context: (m.context as 'fresh' | 'fork') ?? 'fresh',
              provider: m.provider,
            }))
            if (members.length === 0) return err('current session has no team members to save')
            const tpl: TeamTemplate = {
              id: crypto.randomUUID(),
              name: parsed.name,
              description: 'saved from session',
              version: 1,
              members,
              updatedAt: Date.now(),
            }
            await deps.store.save(tpl, parsed.scope, sessionId)
            return ok({ ...tpl, note: 'prompt is empty because the official member snapshot has no prompt; fill it in the settings page' })
          }
          case 'delete': {
            await deps.store.remove(parsed.name, parsed.scope, sessionId)
            return ok({ deleted: parsed.name, scope: parsed.scope })
          }
          case 'import': {
            let raw: unknown
            try {
              raw = JSON.parse(parsed.json)
            } catch {
              return err('import payload is not valid JSON')
            }
            const v = parseTemplate(raw)
            if (!v.ok) return err(`invalid template: ${v.error}`)
            await deps.store.save(v.value, 'project', sessionId, { force: true })
            return ok({ imported: v.value.name })
          }
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    },
  })
}

async function loadMerged(deps: CommandDeps, name: string, sessionId: string): Promise<TeamTemplate | undefined> {
  const [g, p, s] = await Promise.all([
    deps.store.get(name, 'global', sessionId),
    deps.store.get(name, 'project', sessionId),
    deps.store.get(name, 'session', sessionId),
  ])
  if (!g && !p && !s) return undefined
  return mergeTemplates({ global: g, project: p, session: s }).effective
}

const ok = (value: unknown) => ({ kind: 'success' as const, text: JSON.stringify({ ok: true, value }) })
const err = (text: string) => ({ kind: 'error' as const, text })
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run tests/commands-parse.test.ts`
Expected: PASS（9 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/host/commands.ts tests/commands-parse.test.ts
git commit -m "feat(host): /team 命令解析与注册"
```

---

### Task 8: Host 入口装配

**Files:**
- Create: `src/host/index.ts`
- Create: `src/host/tools.ts`

**Interfaces:**
- Consumes: Task 2–7 全部
- Produces: `export const name`、`export const inject`、`export function apply(ctx, config)`；配置项 `maxMembers`（默认 8）。

- [ ] **Step 1: 写 tools.ts**

```ts
import type { CommandDeps } from './commands'
import type { TeamTemplate } from './types'
import { applyTemplate, type TeamApi, type AgentsApi } from './apply'

export interface ToolDeps extends CommandDeps {
  agentTeams: TeamApi
  agents: AgentsApi
}

export function registerTeamTools(
  ctx: { tools?: { register(def: unknown): () => void } },
  deps: ToolDeps,
): void {
  if (!ctx.tools) return
  const sessionIdOf = (agent: unknown) => deps.agentTeams.membership(agent).teamId

  ctx.tools.register({
    name: 'team_template_list',
    description: 'List agent-team templates visible to the current session.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args: unknown, agent: unknown) => {
      const sid = sessionIdOf(agent)
      const out: Record<string, TeamTemplate[]> = {}
      for (const s of ['global', 'project', 'session'] as const) out[s] = await deps.store.list(s, sid)
      return { content: [{ type: 'text', text: JSON.stringify(out) }] }
    },
  })

  ctx.tools.register({
    name: 'team_template_apply',
    description: 'Apply a saved team template to the current session, spawning missing members.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Template name' } },
      required: ['name'],
      additionalProperties: false,
    },
    handler: async (args: { name: string }, agent: unknown) => {
      const sid = sessionIdOf(agent)
      const [g, p, s] = await Promise.all([
        deps.store.get(args.name, 'global', sid),
        deps.store.get(args.name, 'project', sid),
        deps.store.get(args.name, 'session', sid),
      ])
      if (!g && !p && !s) {
        return { content: [{ type: 'text', text: `template "${args.name}" not found` }], isError: true }
      }
      const tpl = (await import('./merge')).mergeTemplates({ global: g, project: p, session: s }).effective
      const r = await applyTemplate(
        deps.agentTeams,
        deps.agents,
        agent,
        tpl,
        deps.projectRootOf(agent),
        deps.read,
        deps.maxMembers,
      )
      return { content: [{ type: 'text', text: JSON.stringify(r) }] }
    },
  })
}
```

> 注：工具 handler 的第二个参数是否为 `agent`，以及 `ctx.tools.register` 的确切定义形状，需在 Task 0 一并确认；若不同，按官方 `adding-a-tool` cookbook 调整，语义不变。

- [ ] **Step 2: 写 index.ts**

```ts
import { Schema } from 'schemastery'
import { TemplateStore } from './store'
import { registerTeamCommand } from './commands'
import { registerTeamTools } from './tools'
import path from 'node:path'

export const name = 'agent-team-templates'
export const inject = ['commands', 'agentTeams', 'agents', 'fs', 'storageDomain', 'tools']

export interface Config {
  maxMembers: number
}

export const Config: Schema<Config> = Schema.object({
  maxMembers: Schema.number().min(1).max(32).default(8).description('应用模板时允许的最大成员数'),
})

export function apply(ctx: any, config: Config) {
  ctx.effect(() => {
    let closed = false
    let cleanup: (() => Promise<void>) | undefined

    ;(async () => {
      const domain = await ctx.storageDomain.open({
        name: 'agent-team-templates',
        version: 1,
        layout: 'per-record',
        global: true,
      })
      if (closed) {
        await domain.close()
        return
      }
      cleanup = () => domain.close()

      const read = async (abs: string) => {
        try {
          return await ctx.fs.readText(abs)
        } catch {
          return undefined
        }
      }

      const store = new TemplateStore({
        domain: {
          get: (k) => domain.get(k),
          set: (k, v) => domain.set(k, v),
          delete: (k) => domain.delete(k),
          entries: () => domain.entries(),
        },
        fs: {
          readText: read,
          writeText: (abs, text) => ctx.fs.writeText(abs, text),
          listDir: (abs) => ctx.fs.listDir(abs),
          resolve: (...p) => ctx.fs.resolve(...p),
        },
        projectRoot: process.cwd(),
        warn: (m) => ctx.logger?.warn?.(m),
      })

      const deps = {
        store,
        read,
        projectRootOf: () => process.cwd(),
        maxMembers: config.maxMembers,
      }

      registerTeamCommand(ctx, deps)
      registerTeamTools(ctx, { ...deps, agentTeams: ctx.agentTeams, agents: ctx.agents })
    })().catch((e) => ctx.logger?.error?.('[agent-team-templates] init failed', e))

    return () => {
      closed = true
      void cleanup?.()
    }
  }, 'agent-team-templates:main')
}

export default { name, inject, Config, apply }
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误（`any` 处允许，后续按 Step 0 结论收窄）

- [ ] **Step 4: 构建**

Run: `pnpm build:host`
Expected: `lib/index.js` 生成

- [ ] **Step 5: 提交**

```bash
git add src/host/index.ts src/host/tools.ts
git commit -m "feat(host): 插件入口装配（store/命令/工具）"
```

---

### Task 9: Client 骨架与命令调用封装

**Files:**
- Create: `src/client/index.tsx`
- Create: `src/client/api.ts`
- Create: `src/client/styles.ts`

**Interfaces:**
- Consumes: Task 0 结论（`ctx.remote.commands.execute` 是否可用）
- Produces: `export function apply(ctx)`、`export const inject`；`async function runTeam(ctx, sessionId, line): Promise<{ok:true; value:any}|{ok:false; error:string}>`

- [ ] **Step 1: 写 api.ts**

```ts
export type TeamReply = { ok: true; value: any } | { ok: false; error: string }

export async function runTeam(ctx: any, sessionId: string, line: string): Promise<TeamReply> {
  try {
    const res = await ctx.remote.commands.execute(sessionId, `/team ${line}`, [], new AbortController().signal)
    if (!res || res.ok === false) {
      return { ok: false, error: res?.error?.message ?? 'command failed' }
    }
    const exec = res.value
    if (!exec) return { ok: false, error: 'command not resolved' }
    const text = exec.result?.text ?? ''
    if (exec.result?.kind === 'error') return { ok: false, error: text }
    try {
      const parsed = JSON.parse(text)
      return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, error: parsed.error ?? text }
    } catch {
      return { ok: false, error: text || 'empty reply' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 2: 写 styles.ts**

```ts
export const CSS = `
.att-root{display:flex;flex-direction:column;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px}
.att-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:0.5px solid var(--dsw-alias-border-l1)}
.att-badge{font-size:11px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-l2);color:var(--dsw-alias-label-secondary)}
.att-btn{border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-l1);color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer}
.att-btn:hover{background:var(--dsw-alias-bg-l2)}
.att-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.att-pop{position:fixed;z-index:60;min-width:320px;max-width:420px;background:var(--dsw-elevation-panel);border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
`

export function injectStyle(): void {
  const id = 'att-styles'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.dataset.pluginCss = 'agent-team-templates'
  el.textContent = CSS
  document.head.appendChild(el)
}
```

- [ ] **Step 3: 写 index.tsx 骨架**

```tsx
import React from 'react'
import { injectStyle } from './styles'
import { SessionButton } from './SessionButton'
import { LibraryTab } from './LibraryTab'

const NS = 'agent-team-templates'

export function apply(ctx: any): void {
  ctx.effect(() => {
    injectStyle()
    return () => document.getElementById('att-styles')?.remove()
  }, 'att:style')

  ctx.effect(() => ctx.locale.register(NS, {
    zh: { title: '团队模板', apply: '应用', empty: '还没有模板' },
    en: { title: 'Team Templates', apply: 'Apply', empty: 'No templates yet' },
  }), 'att:locale')

  ctx.effect(() => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'att-session', order: -30, locale: NS },
    SessionButton,
  ), 'att:header')

  ctx.effect(() => ctx.slots.register(
    { name: 'settings.plugins.tab', id: 'att-settings', order: 20, title: 'Team Templates', locale: NS },
    LibraryTab,
  ), 'att:settings')
}

export const inject = ['sessions', 'slots', 'locale', 'remote', 'remote.commands']
```

- [ ] **Step 4: 写两个占位组件**

`src/client/SessionButton.tsx`：

```tsx
import React from 'react'

export function SessionButton(_props: any) {
  return React.createElement('button', { className: 'att-btn' }, 'Team')
}
```

`src/client/LibraryTab.tsx`：

```tsx
import React from 'react'

export function LibraryTab(_props: any) {
  return React.createElement('div', { className: 'att-root' }, 'Team Templates')
}
```

- [ ] **Step 5: 构建并装进本机验证**

```bash
pnpm build
cd "D:/codex/dsh-agent-team-templates" && dsh plugin --profile desktop add ./
```

重启后确认：会话页头出现 `Team` 按钮、设置页出现 `Team Templates` 页签、控制台无 slot 崩溃。

- [ ] **Step 6: 提交**

```bash
git add src/client scripts
git commit -m "feat(client): 骨架、样式与命令调用封装"
```

---

### Task 10: 设置页模板库

**Files:**
- Modify: `src/client/LibraryTab.tsx`
- Create: `src/client/TemplateEditor.tsx`

**Interfaces:**
- Consumes: `runTeam`（Task 9）
- Produces: 无（终端 UI）

- [ ] **Step 1: 实现列表与导入导出**

`LibraryTab.tsx` 要求：

- 挂载时 `runTeam(ctx, sessionId, 'list')`，把结果按 `global/project/session` 分组渲染；
- 每项显示 `name`、`description`、成员数、作用域徽章；
- 顶部按钮：新建（打开编辑器）、导入（`<textarea>` 粘贴 JSON → `runTeam(..., 'import <json>')`）、刷新；
- 每项右侧：编辑、导出（`runTeam(..., 'export <name>')` 后 `Blob` 下载 `<name>.json`）、删除（`runTeam(..., 'delete <name> --scope=<scope>')`）；
- 所有调用失败时在顶部红条显示 `error`，成功时 3 秒后自动消失。

关键代码（列表渲染）：

```tsx
const [data, setData] = React.useState<Record<string, any[]>>({})
const reload = React.useCallback(async () => {
  const r = await runTeam(ctx, sessionId, 'list')
  if (r.ok) setData(r.value)
  else setError(r.error)
}, [sessionId])
```

- [ ] **Step 2: 实现编辑器**

`TemplateEditor.tsx` 要求：

- 字段：`name`、`description`、成员表格（`name` / `description` / `context` 下拉 / `prompt` 文本域 + 「改用文件引用」切换）；
- 保存时组装 `TeamTemplate` 对象，序列化为单行 JSON，调用 `runTeam(ctx, sessionId, `import ${JSON.stringify(tpl)}`)`；
- 校验：`name` 非空、至少一个成员、成员名不重复——不满足时禁用保存按钮并提示；
- 成员可增删、可上下移动。

保存逻辑：

```tsx
const save = async () => {
  const tpl = {
    id: draft.id ?? crypto.randomUUID(),
    name: draft.name.trim(),
    description: draft.description,
    version: 1,
    members: draft.members.map((m) => ({
      name: m.name.trim(),
      description: m.description,
      prompt: m.useFile ? { file: m.prompt } : m.prompt,
      context: m.context,
    })),
    updatedAt: Date.now(),
  }
  const r = await runTeam(ctx, sessionId, `import ${JSON.stringify(tpl)}`)
  if (r.ok) {
    setError('')
    onSaved()
  } else {
    setError(r.error)
  }
}
```

保存按钮的禁用条件：

```tsx
const invalid =
  !draft.name.trim() ||
  draft.members.length === 0 ||
  draft.members.some((m) => !m.name.trim()) ||
  new Set(draft.members.map((m) => m.name.trim())).size !== draft.members.length
```

- [ ] **Step 3: 手动验证**

装插件后打开设置页 → 团队模板：

1. 新建一个含 2 个成员的模板，保存；
2. 刷新页面，模板仍在（落盘成功）；
3. 导出，得到 `.json` 文件，内容与保存的一致；
4. 导入该文件，模板出现（覆盖同名）；
5. 删除，列表里消失。

- [ ] **Step 4: 提交**

```bash
git add src/client/LibraryTab.tsx src/client/TemplateEditor.tsx
git commit -m "feat(client): 设置页模板库（增删改查 + 导入导出）"
```

---

### Task 11: 会话页头应用入口

**Files:**
- Modify: `src/client/SessionButton.tsx`

**Interfaces:**
- Consumes: `runTeam`（Task 9）、官方 `agentTeam` 投影（读成员状态）
- Produces: 无

- [ ] **Step 1: 实现浮层**

`SessionButton.tsx` 要求：

- 按钮点击后打开浮层（`ReactDOM.createPortal` 到 `document.body`，按按钮 `getBoundingClientRect` 定位，点击外部关闭）；
- 浮层内容：`runTeam(ctx, sessionId, 'list')` 的结果（合并后视角），每项显示模板名、成员数、成员名列表；
- 「应用」按钮 → `runTeam(ctx, sessionId, `apply ${name}`)`；
- 结果显示：`spawned` 绿、`skipped` 灰（带 `differs` 时黄字提示「定义已变化」）、`failed` 红；
- 应用后 2 秒自动 `reload` 一次，让投影刷新出新成员。

完整骨架（可直接抄）：

```tsx
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { runTeam } from './api'

export function SessionButton(props: any) {
  const { ctx, sessionId, useSessions } = props
  const t = (k: string, fb: string) => (props.t ? props.t(k) : fb)

  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState({ top: 0, left: 0 })
  const [tpls, setTpls] = React.useState<any[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)

  const team = useSessions((s: any) => s.projectionsBySession[sessionId]?.values?.agentTeam)
  const count = team?.members?.length ?? 0

  const load = async () => {
    const r = await runTeam(ctx, sessionId, 'list')
    if (r.ok) setTpls(r.value?.templates ?? [])
    else setError(r.error)
  }

  const toggle = async () => {
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect()
      setPos({ top: (rect?.bottom ?? 0) + 6, left: Math.max(8, (rect?.left ?? 0) - 220) })
      setError('')
      await load()
    }
    setOpen(!open)
  }

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = e.target as Node
      if (boxRef.current?.contains(el) || btnRef.current?.contains(el)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const applyTpl = async (name: string) => {
    setBusy(name)
    setError('')
    const r = await runTeam(ctx, sessionId, `apply ${name}`)
    setBusy(null)
    if (r.ok) {
      setResult(r.value)
      setTimeout(() => void load(), 2000)
    } else {
      setError(r.error)
    }
  }

  const panel = open
    ? ReactDOM.createPortal(
        <div ref={boxRef} className="att-pop" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          <div className="att-pop-h">{t('panel.title', 'Team templates')}</div>
          {error ? <div className="att-err">{error}</div> : null}
          {tpls.length === 0 ? <div className="att-empty">{t('panel.empty', 'No templates')}</div> : null}
          {tpls.map((tp) => (
            <div key={tp.name} className="att-row">
              <div className="att-row-main">
                <div className="att-name">{tp.name}</div>
                <div className="att-sub">
                  {tp.members?.length ?? 0} · {(tp.members ?? []).map((m: any) => m.name).join(', ')}
                </div>
              </div>
              <button type="button" disabled={busy === tp.name} onClick={() => void applyTpl(tp.name)}>
                {busy === tp.name ? t('panel.applying', 'Applying…') : t('panel.apply', 'Apply')}
              </button>
            </div>
          ))}
          {result ? (
            <div className="att-result">
              <div className="att-ok">spawned: {JSON.stringify(result.spawned)}</div>
              <div className="att-skip">skipped: {JSON.stringify(result.skipped)}</div>
              {result.failed?.length ? <div className="att-bad">failed: {JSON.stringify(result.failed)}</div> : null}
            </div>
          ) : null}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button ref={btnRef} type="button" className="att-btn" onClick={toggle}>
        {t('button.label', 'Team')} ({count})
      </button>
      {panel}
    </>
  )
}
```

> 若 slot props 未提供 `t`，改从 `ctx.locale` 取（`ctx.locale.t(NS, key)`），或把文案直接内联中文；不要为了国际化引入新依赖。

- [ ] **Step 2: 读投影显示当前成员数**

```tsx
const lead = sessionId
const team = props.useSessions((s: any) => s.projectionsBySession[lead]?.values?.agentTeam)
const count = team?.members?.length ?? 0
```

按钮上显示 `Team (${count})`。

- [ ] **Step 3: 手动验证（端到端）**

在一个新会话里：

1. 设置页建模板 `e2e-test`，含 1 个成员 `probe-one`；
2. 回到会话，点页头 `Team (0)`，选 `e2e-test`，点应用；
3. 结果出现 `spawned: ["probe-one"]`；
4. 调 `list_agents`，确认 `probe-one` 存在；
5. 再次应用，结果应为 `skipped: [{name:"probe-one", differs:false}]`，不重复建。

- [ ] **Step 4: 提交**

```bash
git add src/client/SessionButton.tsx
git commit -m "feat(client): 会话页头一键应用模板"
```

---

### Task 12: 文档与发布

**Files:**
- Create: `README.md`
- Create: `LICENSE`

**Interfaces:**
- Consumes: 全部
- Produces: 可发布仓库

- [ ] **Step 1: 写 README**

必须包含：它解决什么问题（官方团队无模板、官方面板只读）、安装（`dsh plugin --profile <name> add dsh-plugin-agent-team-templates`）、三级作用域语义表、`/team` 命令速查、模板 JSON 格式示例、与官方面板的分工、已知限制（`save` 无 prompt、不能更新已存在成员、v0.1 不联网）。

- [ ] **Step 2: 写 LICENSE**

MIT，作者 James。

- [ ] **Step 3: 全量验证**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: 全部通过；`lib/index.js` 与 `lib/client.js` 均生成。

- [ ] **Step 4: 提交并打 tag**

```bash
git add -A
git commit -m "docs: README 与 LICENSE，v0.1.0"
git tag v0.1.0
```

---

## 自审记录

**Spec 覆盖检查：**

| Spec 章节 | 对应 Task |
|---|---|
| §5 数据模型 | Task 2 |
| §6 存储 + 合并规则 | Task 3、Task 5 |
| §7 命令协议 | Task 7 |
| §8 UI（设置页 / 页头） | Task 10、Task 11 |
| §9 应用流程 | Task 6 |
| §10 错误处理 | 分散在 Task 5/6/7 的测试用例 |
| §11 打包构建 | Task 1、Task 9 |
| §12 测试 | 各 Task 的测试步骤 + Task 12 |
| §13 Step 0 验证 | Task 0 |
| §14 风险 | Task 0 结论驱动后续调整 |

**已知待收窄处（实现时按 Task 0 结论调整）：** `src/host/index.ts` 里 `ctx.fs` / `ctx.storageDomain` / `ctx.tools` 的确切方法签名；`src/client/index.tsx` 里 `ctx.slots.register` 的 `title` 字段是否被 `settings.plugins.tab` 接受。
