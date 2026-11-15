# @deepwhale-cn/dsh-agent-forensics

> **技能型插件 · 无面板**：安装后由 DSH 智能体按 skill 说明调用 CLI；无独立面板界面。

安装到 DSH：

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-agent-forensics
```

Agent 会话取证：解析本机 agent 会话 JSONL 日志，还原工具调用时间线——谁、何时、调了什么工具、动了哪些文件。只读本机、不联网。

## 用法

```bash
npx @deepwhale-cn/dsh-agent-forensics --file session.jsonl
npx @deepwhale-cn/dsh-agent-forensics --root ~/.zcode/sessions
npx @deepwhale-cn/dsh-agent-forensics --file x.jsonl --html timeline.html
```

## 输出

时间线（时间/工具/摘要/涉及文件）+ 会话统计（工具分布、文件数、跨度）+ JSON / HTML 两种机读与留档格式。

## 已知边界

- 内置 `claude-jsonl` 适配器（`message.content[].tool_use` 结构）；其他格式实现 `ADAPTERS` 即可
- 路径提取是启发式（file_path/path 字段优先，命令文本正则兜底）
- 不解析会话「结果」，只还原「动作」；定责请以原始日志为准
