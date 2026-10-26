// PreToolUse フック：Claude の危険な操作を実行前に止める（metabo-burst から流用。GitHub のブランチ保護を入れても、Claude 側で先に止まるほうが話が早い）
// 止めるもの：main への直接 push・force push・「チェック」が通っていない PR のマージ・MCP で main を書き換える操作
// 止めるときは終了コード2で理由を stderr に出す（Claude に理由が返る）。kazuki が GitHub の画面で押すマージは止まらない
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROTECTED = new Set(['main', 'master']);
// ci.yml の paths-ignore と同じ。これだけを変えた PR は CI が走らないので、チェック無しでもマージしてよい
const ciIgnored = f => f.endsWith('.md');
// ci.yml の中で必ず成功していてほしいジョブ（反束縛チェック＋smoke と、Firebase のエミュレータ）
const REQUIRED = ['check', 'firebase'];
const BAD = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);

// コマンド列を && || ; | 改行で区切り、git / gh で始まる部分だけを語に分ける（コミットメッセージ中の文字列で誤爆しないように）
export function segments(cmd) {
  return cmd.split(/&&|\|\||[;|\n]/).map(s => s.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .map(s => s.match(/"[^"]*"|'[^']*'|\S+/g)?.map(t => t.replace(/^["']|["']$/g, '')) || []).filter(t => t.length);
}

const branchName = ref => ref.replace(/^\+/, '').replace(/^refs\/heads\//, '');

// git push の語の並びを見て、止める理由（無ければ null）を返す。current は今いるブランチ
export function pushProblem(args, current) {
  const flags = args.filter(a => a.startsWith('-')), pos = args.filter(a => !a.startsWith('-'));
  if (flags.some(f => f === '--force' || f === '-f' || /^-[a-zA-Z]*f/.test(f) && !f.startsWith('--')))
    return 'force push は禁止です（必要なら --force-with-lease を自分のブランチにだけ使う）';
  if (flags.some(f => f === '--mirror' || f === '--all')) return '--all / --mirror の push は main も書き換えるので禁止です';
  const refspecs = pos.slice(1); // 先頭は remote 名
  if (refspecs.some(r => r.startsWith('+'))) return '+refspec（force push）は禁止です';
  for (const r of refspecs) {
    const dst = branchName(r.includes(':') ? r.split(':').pop() : r === 'HEAD' ? current || '' : r);
    if (PROTECTED.has(dst)) return `${dst} への直接 push は禁止です。claude/<内容> のブランチに push して PR にしてください`;
  }
  if (!refspecs.length && PROTECTED.has(current)) return `今のブランチが ${current} なので、この push は ${current} に直接入ります。ブランチを切ってください`;
  return null;
}

const gh = (...a) => JSON.parse(execFileSync('gh', ['api', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }));

// PR のチェックが緑かを調べ、止める理由（無ければ null）を返す。調べられないときも止める（安全側）
export function mergeProblem(owner, repo, n, api = gh) {
  let pr, files, runs;
  try {
    pr = api(`repos/${owner}/${repo}/pulls/${n}`);
    files = api('--paginate', `repos/${owner}/${repo}/pulls/${n}/files?per_page=100`).map(f => f.filename);
    runs = api(`repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`).check_runs;
  } catch (e) {
    return `PR #${n} のチェック状態を GitHub から取れませんでした（${String(e.message).split('\n')[0]}）。確かめられないのでマージしません`;
  }
  const bad = runs.filter(r => BAD.has(r.conclusion)).map(r => `${r.name}=${r.conclusion}`);
  if (bad.length) return `PR #${n} のチェックが落ちています：${bad.join(', ')}。直して緑にしてからマージしてください`;
  const running = runs.filter(r => r.status !== 'completed').map(r => r.name);
  if (running.length) return `PR #${n} のチェックがまだ終わっていません：${running.join(', ')}。終わってからマージしてください`;
  const missing = REQUIRED.filter(j => !runs.some(r => r.name === j && r.conclusion === 'success'));
  if (files.some(f => !ciIgnored(f)) && missing.length)
    return `PR #${n} はアプリに関わる変更があるのに「チェック」の ${missing.join('・')} が成功していません（まだ始まっていない可能性）。少し待ってから確かめてください`;
  return null;
}

function git(cwd, ...a) {
  try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function repoOf(cwd) {
  const m = git(cwd, 'remote', 'get-url', 'origin').match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return m ? [m[1], m[2]] : null;
}

// Bash のコマンド1つを調べる
export function checkBash(cmd, cwd, api = gh) {
  for (const t of segments(cmd)) {
    if (t[0] === 'git') {
      let i = 1, dir = cwd;
      while (i < t.length && t[i].startsWith('-')) { if (t[i] === '-C') dir = t[++i]; i++; }
      if (t[i] === 'push') { const p = pushProblem(t.slice(i + 1), git(dir, 'branch', '--show-current')); if (p) return p; }
    }
    if (t[0] === 'gh' && t[1] === 'pr' && t[2] === 'merge') {
      const ri = t.findIndex(a => a === '--repo' || a === '-R');
      const target = t.slice(3).find(a => /^\d+$/.test(a) || /\/pull\/\d+/.test(a));
      if (!target) return 'gh pr merge には PR 番号を付けてください（チェック状態を確かめるため）';
      const url = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      const [owner, repo] = url ? [url[1], url[2]] : ri >= 0 ? t[ri + 1].split('/') : repoOf(cwd) || [];
      if (!owner) return 'マージ先のリポジトリが分かりません。--repo owner/repo を付けてください';
      const p = mergeProblem(owner, repo, url ? url[3] : target, api); if (p) return p;
    }
    if (t[0] === 'gh' && t[1] === 'api') {
      const m = t.join(' ').match(/repos\/([^/\s]+)\/([^/\s]+)\/pulls\/(\d+)\/merge\b/);
      if (m) { const p = mergeProblem(m[1], m[2], m[3], api); if (p) return p; }
      if (/repos\/[^/\s]+\/[^/\s]+\/git\/refs\/heads\/(main|master)\b/.test(t.join(' ')) && /-X\s*(PATCH|POST|PUT|DELETE)|--method\s+(PATCH|POST|PUT|DELETE)/.test(t.join(' ')))
        return 'API で main のブランチを直接書き換えるのは禁止です';
    }
  }
  return null;
}

// GitHub MCP のツールを調べる
export function checkMcp(name, input, api = gh) {
  const tool = name.replace(/^mcp__github__/, '');
  if (tool === 'merge_pull_request') return mergeProblem(input.owner, input.repo, input.pullNumber, api);
  if (['push_files', 'create_or_update_file', 'delete_file'].includes(tool) && PROTECTED.has(branchName(input.branch || '')))
    return `${input.branch} を MCP で直接書き換えるのは禁止です。ブランチを切って PR にしてください`;
  return null;
}

async function main() {
  let raw = '';
  for await (const c of process.stdin) raw += c;
  let ev;
  try { ev = JSON.parse(raw); } catch { process.exit(0); } // 形の分からない入力では邪魔をしない
  const input = ev.tool_input || {}, cwd = ev.cwd || process.cwd();
  const problem = ev.tool_name === 'Bash' ? checkBash(String(input.command || ''), cwd)
    : String(ev.tool_name || '').startsWith('mcp__github__') ? checkMcp(ev.tool_name, input) : null;
  if (problem) { process.stderr.write(`[guard] ${problem}\n`); process.exit(2); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
