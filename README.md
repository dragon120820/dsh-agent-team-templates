# dsh-agent-team-templates

给 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）的**智能体团队模板**插件：把团队定义存成可复用的模板，在任意会话里一键应用。

> 状态：**设计与验证阶段**，v0.1 尚未实现。当前仓库包含设计文档、实现计划，以及用于验证技术前提的 spike 插件。

## 它解决什么问题

DSH 的 Agent Team 是**隐式**的：TeamId 就等于 Lead 会话的 SessionId，成员只写在该会话自己的日志里。这带来三个后果：

1. **换会话即失忆** —— 新会话里团队是空的，得重新一个个 `spawn_teammate`；
2. **官方 UI 只读** —— `@deepseek-ai/dsh-experimental-client-ui-agent-team` 能展示 roster 和任务板，但明确不支持 spawn / rename / delete / interrupt；
3. **没有共享机制** —— 团队定义无法导出、导入、版本化，也无法在多个项目之间复用。

本插件补上这三块：模板的**存储**、**可视化编辑**、**三级作用域**（全局 / 项目 / 会话）。

## 计划中的能力

- 设置页的模板库：新建、编辑、删除、导入导出 JSON；
- 会话页头的一键应用：把模板里缺失的成员 spawn 出来，已存在的跳过并标记定义差异；
- 三级解析：会话级覆盖项目级，项目级覆盖全局；
- 项目级模板以文件形式存放在 `<projectRoot>/.dsh/agent-teams/`，可随 git 提交共享；
- 模型侧对应工具 `team_template_list` / `team_template_apply`，与 UI 共用同一套应用逻辑。

## 文档

- 设计文档：[docs/superpowers/specs/2026-11-02-agent-team-templates-design.md](docs/superpowers/specs/2026-11-02-agent-team-templates-design.md)
- 实现计划：[docs/superpowers/plans/2026-11-02-agent-team-templates.md](docs/superpowers/plans/2026-11-02-agent-team-templates.md)
- Step 0 技术验证结论：[docs/notes/step0-findings.md](docs/notes/step0-findings.md)

## 路线图

| 版本 | 内容 |
| --- | --- |
| v0.1 | 核心：模板 CRUD、三级作用域、一键应用、导入导出 |
| v0.2 | 模板源订阅（从 URL / git 仓库拉取模板集） |
| v0.3 | 内置社区市场（浏览、安装他人分享的团队） |

## 开发

```bash
git clone https://github.com/dragon120820/dsh-agent-team-templates.git
cd dsh-agent-team-templates
pnpm install
```

验证插件（spike）的装载方式见 [docs/notes/step0-findings.md](docs/notes/step0-findings.md)。

## License

MIT
