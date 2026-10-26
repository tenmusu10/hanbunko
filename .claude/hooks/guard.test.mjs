// guard.mjs のテスト：node --test .claude/hooks/guard.test.mjs（npm test と CI が回す）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushProblem, segments, checkBash, checkMcp, mergeProblem } from './guard.mjs';

const push = (s, cur = 'claude/x') => pushProblem(s.split(' ').filter(Boolean), cur);

test('main への直接 push を止める', () => {
  assert.ok(push('origin main'));
  assert.ok(push('origin HEAD:main'));
  assert.ok(push('origin HEAD:refs/heads/main'));
  assert.ok(push('-u origin master'));
  assert.ok(push('origin', 'main'));
  assert.ok(push('', 'main'));
  assert.ok(push('origin HEAD', 'main'));
  assert.ok(push('origin --delete main'));
});

test('force push を止める（--force-with-lease は通す）', () => {
  assert.ok(push('--force origin claude/x'));
  assert.ok(push('-f origin claude/x'));
  assert.ok(push('-uf origin claude/x'));
  assert.ok(push('origin +claude/x'));
  assert.ok(push('--all origin'));
  assert.equal(push('--force-with-lease origin claude/x'), null);
  assert.ok(push('--force-with-lease origin main'));
});

test('自分のブランチへの普通の push は通す', () => {
  assert.equal(push('-u origin claude/agent-guard'), null);
  assert.equal(push('origin HEAD'), null);
  assert.equal(push(''), null);
  assert.equal(push('origin claude/maintenance'), null);
});

test('コマンド列を区切って git/gh の部分だけを見る', () => {
  assert.deepEqual(segments('cd a && git push origin main'), [['cd', 'a'], ['git', 'push', 'origin', 'main']]);
  assert.ok(checkBash('cd /x && git push origin main', '/tmp'));
  assert.ok(checkBash('git -C /x push origin main', '/tmp'));
  assert.equal(checkBash('echo "git push origin main"', '/tmp'), null);
  assert.equal(checkBash('git commit -m "main に push しない"', '/tmp'), null);
  assert.ok(checkBash('gh pr merge --squash', '/tmp'));
});

// 偽の GitHub API：PR #1 は緑、#2 は落ちている、#3 は走っている、#4 は md だけでチェック無し、#5 はアプリの変更なのにチェック無し、#7 は firebase だけ緑
const fake = (...a) => {
  const p = a[a.length - 1], n = +(p.match(/pulls\/(\d+)/)?.[1] || p.match(/sha(\d)/)?.[1]);
  if (p.includes('/check-runs')) return { check_runs: {
    1: [{ name: 'check', status: 'completed', conclusion: 'success' }, { name: 'firebase', status: 'completed', conclusion: 'success' }],
    2: [{ name: 'check', status: 'completed', conclusion: 'failure' }, { name: 'firebase', status: 'completed', conclusion: 'success' }],
    3: [{ name: 'check', status: 'in_progress', conclusion: null }],
    4: [], 5: [], 7: [{ name: 'firebase', status: 'completed', conclusion: 'success' }] }[n] };
  if (p.includes('/files')) return n === 4 ? [{ filename: 'README.md' }, { filename: 'CLAUDE.md' }] : [{ filename: 'js/yotei.js' }];
  if (p.includes('/pulls/')) return { head: { sha: 'sha' + n } };
  throw new Error('unexpected ' + p);
};

test('マージは「チェック」の check と firebase が両方緑のときだけ通す', () => {
  assert.equal(mergeProblem('o', 'r', 1, fake), null);
  assert.match(mergeProblem('o', 'r', 2, fake), /落ちています/);
  assert.match(mergeProblem('o', 'r', 3, fake), /終わっていません/);
  assert.equal(mergeProblem('o', 'r', 4, fake), null);
  assert.match(mergeProblem('o', 'r', 5, fake), /成功していません/);
  assert.match(mergeProblem('o', 'r', 7, fake), /check が成功していません/);
  assert.match(mergeProblem('o', 'r', 6, () => { throw new Error('HTTP 502'); }), /取れませんでした/);
});

test('gh pr merge / gh api の merge / MCP のマージも同じに見る', () => {
  assert.equal(checkBash('gh pr merge 1 --squash --repo o/r', '/tmp', fake), null);
  assert.ok(checkBash('gh pr merge 2 --squash --repo o/r', '/tmp', fake));
  assert.ok(checkBash('gh pr merge https://github.com/o/r/pull/3 --squash', '/tmp', fake));
  assert.ok(checkBash('gh api -X PUT repos/o/r/pulls/2/merge -f merge_method=squash', '/tmp', fake));
  assert.ok(checkBash('gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc', '/tmp', fake));
  assert.equal(checkBash('gh api repos/o/r/pulls/2', '/tmp', fake), null);
  assert.equal(checkMcp('mcp__github__merge_pull_request', { owner: 'o', repo: 'r', pullNumber: 1 }, fake), null);
  assert.ok(checkMcp('mcp__github__merge_pull_request', { owner: 'o', repo: 'r', pullNumber: 2 }, fake));
  assert.ok(checkMcp('mcp__github__push_files', { branch: 'main' }, fake));
  assert.equal(checkMcp('mcp__github__push_files', { branch: 'claude/x' }, fake), null);
});
