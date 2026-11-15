#!/usr/bin/env node
/**
 * dsh-agent-forensics —— Agent 会话取证（离线 CLI）
 * 用法：
 *   dsh-agent-forensics --file session.jsonl            # 单个会话
 *   dsh-agent-forensics --root ~/.zcode/sessions        # 扫目录下所有 *.jsonl
 *   dsh-agent-forensics --file x.jsonl --tool Bash      # 只看某工具
 *   dsh-agent-forensics --file x.jsonl --json|--html out.html
 * 只读本机日志，不联网。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile, findSessions, summarize } from '../lib/index.js';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);
const val = (k, d = '') => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const toolFilter = has('tool') ? val('tool') : null;

if (has('help') || (!has('file') && !has('root'))) {
  console.log(`dsh-agent-forensics —— Agent 会话取证

用法：
  dsh-agent-forensics --file <session.jsonl> [--tool 工具名] [--json] [--html out.html]
  dsh-agent-forensics --root <目录>          # 递归扫 *.jsonl，逐会话出时间线

只读本机日志、不联网。当前支持 claude-jsonl 适配器（Claude Code / zcode 系转写），
其他格式在 lib/index.js 的 ADAPTERS 里加适配器即可。`);
  process.exit(0);
}

const sessions = has('file')
  ? [{ file: val('file'), events: parseFile(val('file')) }]
  : findSessions(val('root', '.')).map((f) => ({ file: f, events: parseFile(f) }));

if (!sessions.length) { console.error('❌ 没有找到可解析的 .jsonl 会话文件'); process.exit(2); }

const all = [];
for (const s of sessions) {
  s.events = toolFilter ? s.events.filter((e) => e.tool === toolFilter) : s.events;
  s.summary = summarize(s.events);
  all.push(s);
}
all.sort((a, b) => a.file.localeCompare(b.file));

if (has('json')) {
  console.log(JSON.stringify({ sessions: all.map(({ file, events, summary }) => ({ file, summary, events })) }, null, 2));
} else {
  for (const s of all) {
    console.log(`\n══ ${s.file}`);
    if (!s.events.length) { console.log('   （无工具调用事件）'); continue; }
    if (s.summary.span) console.log(`   时间跨度 ${s.summary.span.from} → ${s.summary.span.to}`);
    console.log(`   事件 ${s.summary.events} · 解析失败 ${s.summary.parseErrors} · 涉及文件 ${s.summary.filesTouched}`);
    console.log('   工具分布：' + s.summary.byTool.slice(0, 8).map(([t, n]) => `${t}×${n}`).join('  '));
    for (const e of s.events.slice(0, 200)) {
      console.log(`   ${e.ts || '─────────────────────────'}  ${e.tool.padEnd(20)} ${e.detail}`);
      for (const f of e.files.slice(0, 4)) console.log(`       · ${f}`);
      if (e.files.length > 4) console.log(`       · …共 ${e.files.length} 个路径`);
    }
    if (s.events.length > 200) console.log(`   …后 ${s.events.length - 200} 条省略`);
  }
  console.log(`\n共 ${all.length} 个会话 · ${all.reduce((n, s) => n + s.summary.events, 0)} 个事件`);
}

if (has('html')) {
  const rows = [];
  for (const s of all) for (const e of s.events) {
    rows.push(`<tr><td>${e.ts || ''}</td><td>${escapeHtml(e.tool)}</td><td>${escapeHtml(e.detail)}</td><td>${escapeHtml(e.files.join('<br>'))}</td></tr>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Agent 会话取证时间线</title>
<style>body{font:14px/1.6 -apple-system,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f5f5f5}
tr:nth-child(even) td{background:#fafafa}</style>
<h1>Agent 会话取证时间线</h1><p>${all.length} 个会话 · ${all.reduce((n, s) => n + s.summary.events, 0)} 个事件</p>
<table><tr><th>时间</th><th>工具</th><th>详情</th><th>涉及文件</th></tr>${rows.join('')}</table>`;
  writeFileSync(val('html'), html, 'utf-8');
  console.log(`HTML 时间线已写入：${val('html')}`);
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
process.exit(0);
