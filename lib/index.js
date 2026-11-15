/**
 * dsh-agent-forensics —— Agent 会话取证 · 解析内核
 *
 * 输入：Claude Code / zcode 系 agent 的会话转写 JSONL（claude-jsonl 适配器）：
 *   {"type":"assistant","timestamp":"2026-11-13T09:00:00Z","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"..."}}]}}
 *   {"type":"user","timestamp":"...","message":{"content":[{"type":"tool_result","tool_use_id":"..."}]}}
 * 其他格式：实现 parseLine 的适配器后在 ADAPTERS 里注册（保持时间线事件结构不变）。
 *
 * 时间线事件：{ ts, tool, detail, files }
 * files 从 input 的 file_path/path/notebook_path 字段与命令字符串里提取。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const PATH_KEYS = ['file_path', 'path', 'notebook_path', 'filePath', 'notebookPath'];
const PATH_RE = /(?:\/[\w.\-]+){2,}|\b[\w.\-]+\.(?:ts|tsx|js|mjs|cjs|jsx|py|json|md|txt|yml|yaml|sh|sql|html|css|docx|xlsx|pptx|pdf|png|jpg)\b/gi;

/** 从任意 input 对象里提取涉及到的文件路径（去重、绝对/相对都收） */
export function extractFiles(input) {
  const out = new Set();
  if (!input || typeof input !== 'object') return [];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      if (PATH_KEYS.includes(k) && v.trim()) out.add(v.trim());
      else if (k === 'command' || k === 'cmd') {
        for (const m of v.matchAll(PATH_RE)) out.add(m[0]);
      } else if (k === 'edits' && Array.isArray(v)) {
        for (const e of v) { if (e && e.path) out.add(String(e.path)); }
      }
    }
  }
  return [...out];
}

/** claude-jsonl 适配器：一行 -> 0~n 个事件 */
export function parseClaudeJsonlLine(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return []; }
  const events = [];
  const ts = obj.timestamp || obj.ts || obj.time || '';
  // 形态一：message.content[].tool_use
  const content = obj.message?.content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && (c.type === 'tool_use' || c.type === 'function_call')) {
        const input = c.input || c.arguments || {};
        events.push({
          ts,
          tool: c.name || '(unknown)',
          detail: summarizeInput(input),
          files: extractFiles(input),
        });
      }
    }
  }
  // 形态二：扁平 function_call
  if (obj.type === 'function_call' && obj.name) {
    let input = obj.arguments;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = { raw: input }; } }
    events.push({ ts, tool: obj.name, detail: summarizeInput(input), files: extractFiles(input) });
  }
  return events;
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return '';
  for (const k of ['command', 'cmd', 'file_path', 'path', 'url', 'query', 'pattern', 'prompt']) {
    if (typeof input[k] === 'string' && input[k].trim()) return input[k].trim().slice(0, 100);
  }
  const keys = Object.keys(input);
  return keys.length ? keys.join(',').slice(0, 80) : '';
}

export const ADAPTERS = { 'claude-jsonl': { ext: '.jsonl', parseLine: parseClaudeJsonlLine } };

/** 解析一个 JSONL 文件 */
export function parseFile(file, adapter = 'claude-jsonl') {
  const a = ADAPTERS[adapter];
  if (!a) throw new Error(`未知适配器 ${adapter}（可用：${Object.keys(ADAPTERS).join('、')}）`);
  const events = [];
  const lines = readFileSync(file, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    try { events.push(...a.parseLine(t)); }
    catch (e) { events.push({ ts: '', tool: '(解析失败)', detail: `第 ${i + 1} 行：${String(e.message || e).slice(0, 80)}`, files: [] }); }
  });
  return events;
}

/** 扫描目录下所有 *.jsonl */
export function findSessions(root) {
  const out = [];
  (function rec(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) rec(full); }
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
    }
  })(root);
  return out;
}

/** 汇总统计 */
export function summarize(events) {
  const byTool = {};
  const fileSet = new Set();
  let parsed = 0;
  for (const e of events) {
    if (e.tool === '(解析失败)') continue;
    parsed++;
    byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    for (const f of e.files) fileSet.add(f);
  }
  return {
    events: parsed,
    parseErrors: events.length - parsed,
    byTool: Object.entries(byTool).sort((a, b) => b[1] - a[1]),
    filesTouched: fileSet.size,
    files: [...fileSet].sort(),
    span: spanOf(events),
  };
}

function spanOf(events) {
  const ts = events.map((e) => e.ts).filter(Boolean).sort();
  return ts.length ? { from: ts[0], to: ts[ts.length - 1] } : null;
}

export { statSync, relative, basename, join };

// ── DSH 插件接入（方案 A 薄壳：注册 skill 与 CLI 入口；业务逻辑仍在 lib/bin，不在此处）──
import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';

export const { name, inject, apply } = createPlugin({
  name: 'agent-forensics',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/agent-forensics.md',
  binFile: 'bin/cli.mjs',
  description: "解析本机 agent 会话 JSONL 日志，还原工具调用时间线：谁、何时、调了什么工具、动了哪些文件",
  whenToUse: "需要还原 agent 操作历史时：谁在何时调了什么工具、动了哪些文件。用户会说：把会话操作记录导出来、查它动过什么文件。",
});
