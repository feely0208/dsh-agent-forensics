# Agent 会话取证（dsh-agent-forensics）

**什么时候用**：事后复盘/安全审计——「agent 昨天到底动了哪些文件」「它什么时候跑了那条命令」「给客户出证据链」。
用户会说：把 agent 的操作记录导出来、这个会话它调了哪些工具、谁批准它删的东西。

## 怎么用

```bash
<cli 路径> --file <session.jsonl>              # 单个会话
<cli 路径> --root <目录>                        # 递归扫 *.jsonl，逐会话出时间线
<cli 路径> --file x.jsonl --tool Bash           # 只看某工具
<cli 路径> --file x.jsonl --json                # 机器可读
<cli 路径> --file x.jsonl --html timeline.html  # 可打印时间线
```

## 它输出什么

- **时间线**：每条工具调用 = 时间 + 工具名 + 摘要 + 涉及文件（从 file_path/path 字段与命令文本提取）
- **会话统计**：工具分布、涉及文件数、时间跨度、解析失败行数（坏行计入不吞掉）
- **HTML**：可打印表格，适合作为交付/审计附件

## 边界（重要）

- 只读本机日志，不联网
- 当前内置 **claude-jsonl** 适配器（Claude Code / zcode 系转写：`message.content[].tool_use`）；其他 agent 格式在 `lib/index.js` 的 `ADAPTERS` 加适配器，时间线事件结构不变
- 命令字符串里的路径是启发式提取，可能漏/多提 —— 取证结论以原始日志为准，本工具负责「让人不用肉眼翻日志」
