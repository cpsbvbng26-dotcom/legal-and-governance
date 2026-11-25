#!/usr/bin/env node
/* legal-and-governance の検査（ほかのリポジトリの main と照らす分）。
 *
 *   node verification/check_remote.js                    GitHub から各リポジトリの main を読んで照らす
 *   node verification/check_remote.js --siblings <dir>   <dir>/<リポジトリ> の origin/main（git が無ければ作業木）で照らす
 *   node verification/check_remote.js --break            同じ検査を一つずつ壊し、どれも落ちることを確かめる（上の二つと組める）
 *
 * 読むのは公開のリポジトリだけで、どこにも書かない。GitHub から読むときは、ファイルの並びを git/trees の API で、
 * 中身を raw.githubusercontent.com で読む。GITHUB_TOKEN があれば API に添える。
 * 検査はどれも、頁の表（F）と、各リポジトリの main の写し（X：repo → { files: Set, text: Map }）を受け取る純粋な関数である。
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./check.js');

const { claims, norm, headings, sha, json, COPIES, SELF, OWNER, GH } = L;

/* ------------------------------------------------------------ 何を読むか */

function needs(F) {
  const S = json(F, 'verification/scope.json');
  const want = new Map();
  const add = (repo, p) => { if (repo === SELF) return; if (!want.has(repo)) want.set(repo, new Set()); if (p) want.get(repo).add(p); };
  for (const r of S['十'].concat(S['ほか'])) add(r);
  for (const c of claims(F)) if (c.kind === 'section' || c.kind === 'quote') add(c.repo, c.path);
  for (const f of COPIES) add('cpsbvbng26-dotcom', f);
  ['DISCLAIMER.md', 'DISCLAIMER.en.md', 'verification/statutes.json'].forEach((f) => add('cpsbvbng26-dotcom', f));
  for (const s of S['同じ並び']) add(s.repo, s.path);
  for (const m of (F.get('pages/index.md') || '').matchAll(/sophaxis\/blob\/main\/([^)\s]+\.ja\.md)/g)) add('sophaxis', m[1]);
  add('sophaxis', 'docs/legal-audit-2026-11-12.md');
  return want;
}

/* ------------------------------------------------------------ 読み方 */

function fromSiblings(dir, want) {
  const X = {};
  for (const [repo, paths] of want) {
    const root = path.join(dir, repo);
    const git = (...a) => execFileSync('git', ['-C', root].concat(a), { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    let files = null, read;
    try { files = new Set(git('ls-tree', '-r', '--name-only', 'origin/main').split('\n').filter(Boolean)); read = (p) => git('show', 'origin/main:' + p); } catch (e) { files = null; }
    if (!files) {
      try { const G = L.load(root); files = new Set(G.keys()); read = (p) => G.get(p); } catch (e) { X[repo] = null; continue; }
    }
    const text = new Map();
    for (const p of paths) if (files.has(p)) { try { text.set(p, read(p)); } catch (e) { /* 読めなければ無いものとして扱う */ } }
    X[repo] = { files, text };
  }
  return X;
}

async function fromGitHub(want) {
  const H = { 'User-Agent': 'legal-and-governance remote check', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) H.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const get = async (url, h) => {
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(60000) }); if (r.ok) return await r.text(); if (r.status === 404) return null; } catch (e) { /* もう一度 */ }
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
    throw new Error('no answer: ' + url);
  };
  const X = {};
  for (const [repo, paths] of want) {
    const tree = await get('https://api.github.com/repos/' + OWNER + '/' + repo + '/git/trees/main?recursive=1', H);
    if (tree === null) { X[repo] = null; continue; }
    const t = JSON.parse(tree);
    if (t.truncated) throw new Error(repo + '：ファイルの並びが切れた');
    const files = new Set(t.tree.filter((e) => e.type === 'blob').map((e) => e.path));
    const text = new Map();
    for (const p of paths) {
      if (!files.has(p)) continue;
      const body = await get('https://raw.githubusercontent.com/' + OWNER + '/' + repo + '/main/' + p.split('/').map(encodeURIComponent).join('/'), { 'User-Agent': H['User-Agent'] });
      if (body !== null) text.set(p, body);
    }
    X[repo] = { files, text };
  }
  return X;
}

/* ------------------------------------------------------------ 検査 */

const has = (X, repo, p) => !!(X[repo] && X[repo].files.has(p));
const txt = (X, repo, p) => (X[repo] && X[repo].text.get(p)) || null;
/* 見出しの下の、最初の箇条の並び。相対リンクは、そのリポジトリの main の URL にする。 */
function listUnder(t, heading, repo, file) {
  const lines = String(t || '').split('\n');
  const i = lines.findIndex((l) => l.trim() === heading);
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < lines.length && !/^#{1,6} /.test(lines[j]); j++) {
    if (/^- /.test(lines[j])) out.push(lines[j]);
    else if (out.length) break;
  }
  return out.map((l) => l.replace(/\]\((?!https?:)([^)#\s]+)\)/g, (m, rel) => '](' + GH + repo + '/blob/main/' + path.posix.normalize(path.posix.join(path.posix.dirname(file), rel)) + ')'));
}

const CHECKS = [];
const check = (name, fn) => CHECKS.push({ name, fn });

check('頁と様式が指すほかのリポジトリのファイルが、そのリポジトリの main にある', (F, X) => {
  const bad = [];
  for (const c of claims(F)) if (c.repo && c.repo !== SELF && (X[c.repo] === null || X[c.repo] === undefined || !has(X, c.repo, c.path))) bad.push(c.at + ' → ' + c.repo + ':' + c.path);
  return bad;
});

check('頁が名を挙げるほかのリポジトリの節が、その見出しとしてある', (F, X) => {
  const bad = [];
  for (const c of claims(F)) if (c.kind === 'section' && c.repo !== SELF && !headings(txt(X, c.repo, c.path)).includes(c.text)) bad.push(c.at + '：' + c.repo + ':' + c.path + ' に節「' + c.text + '」が無い');
  return bad;
});

check('頁が「」と "" で引いたほかのリポジトリの句が、そのファイルにそのまま現れる', (F, X) => {
  const bad = [];
  for (const c of claims(F)) if (c.kind === 'quote' && !norm(txt(X, c.repo, c.path) || '').includes(norm(c.text))) bad.push(c.at + '：' + c.repo + ':' + c.path + ' に無い句「' + c.text.slice(0, 24) + '」');
  return bad;
});

check('正本の写しが cpsbvbng26-dotcom の main の正本と一字一句同じで、copies.json の sha256 も正本と同じ', (F, X) => {
  const bad = [];
  const C = json(F, 'verification/copies.json');
  if (!C) return ['copies.json が読めない'];
  for (const f of COPIES) {
    const canon = txt(X, 'cpsbvbng26-dotcom', f);
    if (canon === null) { bad.push(f + '：正本が読めない'); continue; }
    if (F.get(f) !== canon) bad.push(f + '：写しが正本と違う');
    if (C['写し'][f] !== sha(canon)) bad.push(f + '：copies.json の sha256 が正本と違う');
  }
  return bad;
});

check('諮問委員の「加われる人」と「利益相反」の並びが、Sophaxis の main の募集と一字一句同じ', (F, X) => {
  const S = json(F, 'verification/scope.json');
  const bad = [];
  for (const s of S['同じ並び']) {
    const mine = listUnder(F.get(s.mine), s.heading, SELF, s.mine);
    const theirs = listUnder(txt(X, s.repo, s.path), s.theirs, s.repo, s.path);
    if (!mine || !theirs || !mine.length || JSON.stringify(mine) !== JSON.stringify(theirs)) bad.push(s.mine + ' ' + s.heading + ' と ' + s.repo + ':' + s.path + ' が違う');
  }
  return bad;
});

check('免責事項の範囲の行が scope.json の 10 のリポジトリと同じ並びで、その次の行が、頁が挙がると書いたリポジトリと節を挙げ、挙がらないと書いた節を挙げない', (F, X) => {
  const S = json(F, 'verification/scope.json');
  const bad = [];
  const D = txt(X, 'cpsbvbng26-dotcom', 'DISCLAIMER.md') || '', E = txt(X, 'cpsbvbng26-dotcom', 'DISCLAIMER.en.md') || '';
  const lines = D.split('\n'), en = E.split('\n');
  const i = lines.findIndex((l) => l.includes('次の ' + S['十'].length + ' のリポジトリと、そこから作るサイトに掛かります。'));
  const j = en.findIndex((l) => l.includes('the following ' + S['十'].length + ' repositories'));
  const names = i < 0 ? [] : lines[i + 1].replace(/\s*です。$/, '').split('、');
  if (JSON.stringify(names) !== JSON.stringify(S['十'])) bad.push('DISCLAIMER.md の範囲の行が scope.json の 十 と違う（' + names.join(',') + '）');
  const N = S['免責事項の次の行'];
  const next = i < 0 ? '' : lines[i + 2] || '', nextEn = j < 0 ? '' : en[j + 2] || '';
  for (const [line, file, repos, secs, nots, q] of [[next, 'DISCLAIMER.md', N['挙がるリポジトリ'], N['挙がる節'], N['挙がらない節'], (s) => '「' + s + '」'], [nextEn, 'DISCLAIMER.en.md', N['挙がるリポジトリ'], N['挙がる節（英語）'], N['挙がらない節（英語）'], (s) => '"' + s + '"']]) {
    if (!/(?:それぞれの節に書いた範囲で掛かります。|each to the extent that it states\.)$/.test(line)) { bad.push(file + '：範囲の行の次の行が、節の掛かり方を書く行でない'); continue; }
    for (const r of repos) if (!line.split(/、| には|, | and /).map((x) => x.replace(/^To /, '')).includes(r)) bad.push(file + '：範囲の行の次の行が ' + r + ' を挙げていない。頁の「挙げ」を直す');
    for (const s of secs) if (!line.includes(q(s))) bad.push(file + '：範囲の行の次の行が節 ' + s + ' を挙げていない');
    for (const s of nots) if (line.includes(q(s))) bad.push(file + '：範囲の行の次の行が節 ' + s + ' を挙げている。頁の「入っていません」を直す');
  }
  return bad;
});

check('頁が「無い」と書いたものが、そのリポジトリの main に無い', (F, X) => {
  const S = json(F, 'verification/scope.json');
  const bad = [];
  for (const [repo, w] of Object.entries(S['無いこと'])) {
    if (!X[repo]) { bad.push(repo + '：読めない'); continue; }
    for (const p of w.files) if (has(X, repo, p)) bad.push(repo + ':' + p + ' がある。頁の「無い」を直す');
    const re = new RegExp(w.pattern, 'i');
    for (const p of X[repo].files) if (re.test(p)) bad.push(repo + ':' + p + ' がある。頁の「無い」を直す');
  }
  return bad;
});

check('条文の写し（canonical-statutes.json）が、cpsbvbng26-dotcom の main の statutes.json と同じ', (F, X) => {
  const K = json(F, 'verification/canonical-statutes.json');
  let canon = null;
  try { canon = JSON.parse(txt(X, 'cpsbvbng26-dotcom', 'verification/statutes.json')); } catch (e) { return ['正本の statutes.json が読めない']; }
  if (!K) return ['canonical-statutes.json が読めない'];
  return require('../tools/statutes.js').copyDiff(K, canon).map((d) => d.key + '：' + d.why);
});

check('索引が訳と書いた Sophaxis の日本語の頁が、どれも頭で英語の頁の訳と書き、訳でないと書いた点検の記録は訳と書かない', (F, X) => {
  const bad = [];
  const t = F.get('pages/index.md') || '';
  const ja = [...new Set([...t.matchAll(/sophaxis\/blob\/main\/([^)\s]+\.ja\.md)/g)].map((m) => m[1]))];
  if (!t.includes('表の日本語の頁は、点検の記録のほかは、どれも英語の頁の訳です。') || ja.length < 10) bad.push('索引の文か、日本語の頁の並び');
  for (const f of ja) if (!/訳/.test(String(txt(X, 'sophaxis', f) || '').split('\n').slice(0, 8).join('\n'))) bad.push('sophaxis:' + f + ' が頭で訳と書いていない');
  if (/訳/.test(String(txt(X, 'sophaxis', 'docs/legal-audit-2026-11-12.md') || '').split('\n').slice(0, 8).join('\n'))) bad.push('点検の記録が訳と書いている');
  return bad;
});

/* ------------------------------------------------------------ 壊し方 */

const BREAKS = [];
const brk = (name, desc, mut) => BREAKS.push({ name, desc, mut });
const subF = (f, a, b) => (F) => { const t = F.get(f); if (t === undefined || !t.includes(a)) throw new Error('壊し方が当たらない：' + f + ' ' + String(a).slice(0, 30)); F.set(f, t.replace(a, b)); };
const subX = (repo, p, a, b) => (F, X) => { const t = txt(X, repo, p); if (t === null || !t.includes(a)) throw new Error('壊し方が当たらない：' + repo + ':' + p); X[repo].text.set(p, t.replace(a, b)); };
const dropX = (repo, p) => (F, X) => { if (!has(X, repo, p)) throw new Error('壊し方が当たらない：' + repo + ':' + p); X[repo].files.delete(p); X[repo].text.delete(p); };
const addX = (repo, p) => (F, X) => { X[repo].files.add(p); };
const C = (i) => CHECKS[i].name;
brk(C(0), '索引の表のリンク先を、無いファイルにする', subF('pages/index.md', 'self-correction/blob/main/SECURITY.md', 'self-correction/blob/main/SECURITY.txt'));
brk(C(0), 'main から、求めの頁が指す様式を消す', dropX('sophaxis', '.github/ISSUE_TEMPLATE/withdrawal.yml'));
brk(C(0), 'main から、索引と求めの頁が指す golden-window-resolution の受付の仕事を消す', dropX('golden-window-resolution', '.github/workflows/checked-intake.yml'));
brk(C(1), '節の名を一字変える', subF('pages/requests.md', '[免責事項](https://github.com/cpsbvbng26-dotcom/cpsbvbng26-dotcom/blob/main/DISCLAIMER.md)の「突き合わせの受付」', '[免責事項](https://github.com/cpsbvbng26-dotcom/cpsbvbng26-dotcom/blob/main/DISCLAIMER.md)の「突合せの受付」'));
brk(C(1), 'main で見出しの名が変わる', subX('cpsbvbng26-dotcom', 'DISCLAIMER.en.md', '## Statements about people', '## About people'));
brk(C(2), '引いた句を一字変える', subF('pages/requests.md', '「手数料は取りません。」', '「手数料は取りません。費用もかかりません。」'));
brk(C(2), 'main で引いた句が消える', subX('sophaxis', 'policies/takedown.md', 'A request that cannot be made in public goes by email', 'A request that cannot be made in public goes by post'));
brk(C(2), '英語の頁の引用を変える', subF('pages/privacy.en.md', '"appropriate technical and organizational security measures', '"appropriate technical security measures'));
brk(C(3), '写しを一字変える', (F) => F.set('SECURITY.md', F.get('SECURITY.md').replace('7 日以内', '8 日以内')));
brk(C(3), 'main の正本だけが変わる', subX('cpsbvbng26-dotcom', '.github/workflows/empty-issue.yml', 'waits 10 minutes', 'waits ten minutes'));
brk(C(4), '加われる人の一行を変える', subF('pages/advisory.md', '- 哲学・数学・論理学・数理哲学・科学哲学の研究者。', '- 哲学・数学・論理学・科学哲学の研究者。'));
brk(C(4), 'Sophaxis の募集の利益相反が変わる', subX('sophaxis', 'advisory.md', '- Any payment received in the last three years from one of them.', '- Any payment received in the last five years from one of them.'));
brk(C(4), 'Sophaxis の募集の場所の決まりのリンク先が変わる', subX('sophaxis', 'advisory.ja.md', '[投稿の規程](./policies/submission.ja.md)の表にある', '[投稿の規程](./policies/terms.ja.md)の表にある'));
brk(C(5), 'main の免責事項の範囲に golden-window-resolution が入る', subX('cpsbvbng26-dotcom', 'DISCLAIMER.md', '、solitary-school です。', '、solitary-school、golden-window-resolution です。'));
brk(C(5), 'main の免責事項の次の行から legal-and-governance が外れる', subX('cpsbvbng26-dotcom', 'DISCLAIMER.md', 'research-collaboration、legal-and-governance、verification-hub', 'research-collaboration、verification-hub'));
brk(C(5), 'main の英語の免責事項の次の行に人についての記載の節が入る', subX('cpsbvbng26-dotcom', 'DISCLAIMER.en.md', '"Information", "Issues and the language model"', '"Statements about people", "Information", "Issues and the language model"'));
brk(C(5), 'main の免責事項の次の行から突き合わせの受付の節が外れる', subX('cpsbvbng26-dotcom', 'DISCLAIMER.md', '「issue の中身と言語モデル」「突き合わせの受付」', '「issue の中身と言語モデル」'));
brk(C(5), 'scope.json の 十 から一つ外す', (F) => { const j = JSON.parse(F.get('verification/scope.json')); j['十'].pop(); F.set('verification/scope.json', JSON.stringify(j)); });
brk(C(6), 'golden-window-resolution に免責事項の頁が置かれる', addX('golden-window-resolution', 'DISCLAIMER.md'));
brk(C(6), 'golden-window-resolution に個人情報の頁が置かれる', addX('golden-window-resolution', 'docs/privacy.md'));
brk(C(7), '正本の条文が一字変わる', subX('cpsbvbng26-dotcom', 'verification/statutes.json', '故意又は過失によって他人の権利', '故意又は重過失によって他人の権利'));
brk(C(7), '写しから条を一つ外す', (F) => { const j = JSON.parse(F.get('verification/canonical-statutes.json')); delete j['条文']['刑法 第36条']; F.set('verification/canonical-statutes.json', JSON.stringify(j)); });
brk(C(8), 'Sophaxis の日本語の頁の頭から訳の語が消える', (F, X) => { const t = txt(X, 'sophaxis', 'disclaimer.ja.md'); if (t === null) throw new Error('壊し方が当たらない'); X.sophaxis.text.set('disclaimer.ja.md', t.split('訳').join('写')); });
brk(C(8), '点検の記録が訳と書く', subX('sophaxis', 'docs/legal-audit-2026-11-12.md', '# 法令の点検（2026-11-12）', '# 法令の点検（2026-11-12、訳）'));

/* ------------------------------------------------------------ 走らせる */

const clone = (X) => Object.fromEntries(Object.entries(X).map(([r, v]) => [r, v && { files: new Set(v.files), text: new Map(v.text) }]));

async function main() {
  const F = L.load();
  const i = process.argv.indexOf('--siblings');
  const want = needs(F);
  const X = i > 0 ? fromSiblings(path.resolve(process.argv[i + 1]), want) : await fromGitHub(want);
  if (process.argv.includes('--break')) {
    let missed = 0;
    for (const b of BREAKS) {
      const G = new Map(F), Y = clone(X);
      let caught = false, err = null;
      try { b.mut(G, Y); caught = CHECKS.find((c) => c.name === b.name).fn(G, Y).length > 0; } catch (e) { err = e.message; }
      console.log((caught ? '  落ちた  ' : '  通った  ') + b.desc + (err ? ' —— ' + err : ''));
      if (!caught) missed++;
    }
    const without = CHECKS.filter((c) => !BREAKS.some((b) => b.name === c.name));
    for (const c of without) console.log('  壊し方が無い  ' + c.name);
    console.log('\n' + BREAKS.length + ' 通りの壊し方のうち ' + (BREAKS.length - missed) + ' 通りで落ちた。壊し方の無い検査は ' + without.length + ' 本。');
    process.exit(missed || without.length ? 1 : 0);
  }
  let fail = 0;
  for (const c of CHECKS) {
    const bad = c.fn(F, X);
    console.log((bad.length ? '  落  ' : '  通  ') + c.name);
    for (const b of bad) console.log('        ' + b);
    if (bad.length) fail++;
  }
  const n = claims(F);
  console.log('\n読んだリポジトリ ' + Object.keys(X).length + '、照らしたリンク先 ' + n.filter((c) => c.kind === 'exists' && c.repo !== SELF).length + '、節の名 ' + n.filter((c) => c.kind === 'section' && c.repo !== SELF).length + '、引いた句 ' + n.filter((c) => c.kind === 'quote').length + '。');
  console.log(CHECKS.length + ' 本の検査のうち ' + (CHECKS.length - fail) + ' 本が通った。');
  process.exit(fail ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
module.exports = { CHECKS, BREAKS, needs, listUnder };
