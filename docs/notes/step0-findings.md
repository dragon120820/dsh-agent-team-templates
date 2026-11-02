# Step 0 技术验证结论

状态：**进行中** —— 验证插件已装进 desktop profile，等待重启 DSH Desktop 后观察。

## 0. 已验证的事实（静态确认，不依赖运行）

### 0.1 官方 client bundle 的真实形态
`node_modules/@deepseek-ai/dsh-experimental-client-ui-agent-team/lib/client.js:1-5`

```js
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-experimental-client-ui-agent-team",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ...
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
```

要点：factory 内必须自己造 `module`/`exports`，结尾 `return module.exports`。
官方 `inject = ["sessions","uiWorkspace","slots","locale"]`（client.js:457-462），
slot 注册包在 `ctx.effect(...)` 里（client.js:491-497）。

### 0.2 命令 API 签名（docs/subsystems/commands.zh.md:143-195）
- `register(definition: CommandDefinition): () => void`
- `@Remote list(agent: Agent): readonly CommandDescriptor[]`
- `@Remote find(agent: Agent, name: string): CommandDefinition | undefined` —— name **不带斜杠**
- `@Remote async execute(agent: Agent, line: string, submittedAttachments, signal): Promise<CommandExecution | undefined>`

**两个待验证风险点**：
1. 第一个参数类型是 `Agent`，客户端只有 `sessionId` 字符串 —— remote 编解码层是否自动 brand 转换，未确认。
2. 返回 `CommandExecution`（含 result + lifecycle pairing id），**不是**裸 `CommandResult`，`runTeam` 需按实际形态取值。

### 0.3 `dsh plugin` 是 pnpm 的透传封装
`dsh plugin --profile desktop <args>` = 在 profile 目录跑 pnpm。
因此 `add ./` 会把 **profile 目录**当作源，必须写绝对路径或 `link:`。

### 0.4 CLI 无法对本 profile 做 `--dump-config`
报错：
```
Error: dsh: cannot resolve profile bundle "@agents-anywhere/dsh-bridge-next" from the dsh installation or C:\Users\ASUS\.dsh-beta\profiles\desktop
```
该包由 Desktop 应用注入，不在 profile 的 dependencies 里（改动前就是这样，非本次引入）。
→ **静态校验这条路不通，只能靠实际重启观察。**

## 1. `settings.plugins.tab`
- 是否可注册：待验证
- 若否，报错原文：待验证
- 可用的替代 slot：待验证

## 2. `ctx.remote.commands.execute` 客户端可达
- inject 是否被接受：待验证（spike 声明 `["slots","sessions","remote"]`）
- 调用返回形态：待验证
- 命令结果 text 是否原样返回：待验证

## 3. 相对计划的偏差（已按实际调整 spike）
1. 计划里的 `spike/client.js` 缺 `var module = { exports: {} }` 与 `return module.exports`，已按官方形态补全。
2. 安装命令从 `add ./` 改为 `add link:D:/codex/dsh-agent-team-templates/spike`（符号链接，改源码即时生效，免去每次重装）。
3. `spike/index.js` 的 `inject` 从 `['commands']` 改为 `[]` —— commands 属 core 服务，直接 `ctx.commands.register` 即可；声明不存在的服务名会让插件卡在等待依赖。
4. 计划里 `dsh.client.inject` 写的是 `["sessions","slots"]`，实际补成 `["sessions","slots","remote"]`，因为要调 `ctx.remote.commands`。

## 4. 回滚方式
```bash
cd "C:/Users/ASUS/.dsh-beta/profiles/desktop"
dsh plugin --profile desktop remove dsh-plugin-att-spike
# 或直接还原备份：
cp package.json.bak-att-spike package.json
```
备份文件：`C:/Users/ASUS/.dsh-beta/profiles/desktop/package.json.bak-att-spike`
