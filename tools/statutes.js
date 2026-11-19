#!/usr/bin/env node
/* The statutes and terms that the research side relies on, fetched again and compared with the record.
 *
 * Three parts:
 * 1. This repository's own statutes (verification/statutes.json, texts in verification/statutes-texts.json), each fetched
 *    from https://laws.e-gov.go.jp/api/1/articles;lawId=<id>;article=<n>, and the GitHub Terms of Service that its pages
 *    quote (github/site-policy).
 * 2. A held copy of the statutes and terms of cpsbvbng26-dotcom (verification/canonical-statutes.json). The copy is compared
 *    with the canonical file on cpsbvbng26-dotcom's main, read only from raw.githubusercontent.com; each article is fetched
 *    again from the e-Gov law API (an article by the articles endpoint, a supplementary provision from the whole law by the
 *    lawdata endpoint); each term held on GitHub is read at the latest commit that touched its file, and every recorded
 *    phrase must still occur in it.
 * 3. Known differences recorded in the held copy keep their place in the weekly issue until the canonical record is
 *    updated, and do not fail a pull request while the file stays at the commit recorded.
 *
 * Texts are reduced to plain characters (ruby readings and tags dropped, white space collapsed), the same reduction that
 * Sophaxis, research-collaboration and cpsbvbng26-dotcom use, and compared by SHA-256.
 *
 *   node tools/statutes.js            compare only; exit 1 on a difference that is not a known one
 *   node tools/statutes.js --record   write this repository's fetched texts, hashes, commits and the date (JST), and copy
 *                                     the canonical statutes.json of cpsbvbng26-dotcom's main into the held copy
 *
 * On the schedule (statutes.yml, Wednesday) a difference opens one issue in this repository with fixed words, or updates
 * it; when everything matches again, it closes. Nothing is written to any repository by the workflow. A workflow token
 * cannot write to another repository, and this tool does not try. Recording is done by a commit in a pull request.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'verification', 'statutes.json');
const TEXTS = path.join(ROOT, 'verification', 'statutes-texts.json');
const HELD = path.join(ROOT, 'verification', 'canonical-statutes.json');
const CANON = 'https://raw.githubusercontent.com/cpsbvbng26-dotcom/cpsbvbng26-dotcom/main/verification/statutes.json';
const UA = 'legal-and-governance statutes watch (+https://github.com/cpsbvbng26-dotcom/legal-and-governance)';
const MARK = '<!-- statutes-watch -->';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const plain = (x) => x.replace(/<Rt>[^<]*<\/Rt>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sha = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const flat = (s) => String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/* Pure: the plain text of an article answer, or of some of its items. */
function articleText(xml, num, items) {
  const m = new RegExp('<Article[^>]*\\sNum="' + num + '"[^>]*>[\\s\\S]*?</Article>').exec(xml);
  if (!m) return null;
  if (!items) return plain(m[0]);
  const parts = items.map((n) => (new RegExp('<Item[^>]*\\sNum="' + n + '"[^>]*>[\\s\\S]*?</Item>').exec(m[0]) || [null])[0]);
  return parts.every(Boolean) ? parts.map(plain).join('\n') : null;
}
/* Pure: the supplementary provisions of a whole law, in order. */
const supplProvisions = (xml) => [...String(xml).matchAll(/<SupplProvision(?:\s[^>]*)?>[\s\S]*?<\/SupplProvision>/g)].map((m) => m[0]);

/* Pure: how the held copy differs from the canonical file. Returns a list of keys with a short reason. */
function copyDiff(held, canon) {
  const out = [];
  const H = held['条文'] || {}, C = (canon && canon['条文']) || {};
  for (const k of Object.keys(C)) if (!H[k]) out.push({ key: k, why: 'not in the held copy' });
  for (const [k, e] of Object.entries(H)) {
    if (!C[k]) { out.push({ key: k, why: 'not in the canonical file' }); continue; }
    if (C[k]['文'] !== e['文'] || C[k].sha256 !== e.sha256 || C[k]['e-Gov'] !== e['e-Gov']) out.push({ key: k, why: 'text differs' });
  }
  const HT = held['規約'] || {}, CT = (canon && canon['規約']) || {};
  for (const k of Object.keys(CT)) if (!HT[k]) out.push({ key: k, why: 'term not in the held copy' });
  for (const [k, e] of Object.entries(HT)) {
    if (!CT[k]) { out.push({ key: k, why: 'term not in the canonical file' }); continue; }
    const ph = Object.keys(CT[k]).filter((x) => x.startsWith('引いた句')).map((x) => CT[k][x]);
    if (JSON.stringify(ph) !== JSON.stringify(e.phrases)) out.push({ key: k, why: 'phrases differ' });
  }
  return out;
}

async function get(url, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers), signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.text();
      if (r.status < 500 && r.status !== 429) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === 2) throw e; }
    await sleep(4000 * (i + 1));
  }
  throw new Error('no answer');
}

/* The latest commit that touched a file on GitHub, and the file at that commit. */
async function githubFile(repo, branch, file) {
  const auth = process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};
  const list = JSON.parse(await get('https://api.github.com/repos/' + repo + '/commits?per_page=1&sha=' + encodeURIComponent(branch) + '&path=' + encodeURIComponent(file), auth));
  const c = list[0] && list[0].sha;
  if (!c) throw new Error('no commit');
  const body = await get('https://raw.githubusercontent.com/' + repo + '/' + c + '/' + file.split('/').map(encodeURIComponent).join('/'));
  return { commit: c, body };
}

async function main() {
  const record = process.argv.includes('--record');
  const conf = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const texts = fs.existsSync(TEXTS) ? JSON.parse(fs.readFileSync(TEXTS, 'utf8')) : {};
  const held = JSON.parse(fs.readFileSync(HELD, 'utf8'));
  const results = [];
  const egov = async (url) => { const x = await get(url); await sleep(1200); return x; };

  /* 1. Own statutes and terms. */
  for (const e of conf.statutes) {
    const key = e.law + ' ' + e.label;
    try {
      const xml = await egov('https://laws.e-gov.go.jp/api/1/articles;lawId=' + e.law_id + ';article=' + e.article);
      const code = (/<Code>(\d+)<\/Code>/.exec(xml) || [])[1];
      const text = code === '0' ? articleText(xml, e.article, e.items) : null;
      if (text === null) { results.push({ part: 'own', key, state: 'missing' }); continue; }
      const h = sha(text);
      if (record) { e.sha256 = h; texts[key] = text; }
      results.push({ part: 'own', key, state: h === e.sha256 ? 'same' : 'changed' });
    } catch (err) { results.push({ part: 'own', key, state: 'failed', note: String(err.message || err) }); }
  }
  for (const p of conf.policies) {
    try {
      const { commit, body } = await githubFile(p.repo, 'main', p.path);
      const lost = p.phrases.filter((x) => flat(body).indexOf(flat(x)) < 0);
      if (record && lost.length === 0) p.commit = commit;
      results.push({ part: 'own', key: p.name, state: lost.length ? 'missing' : commit === p.commit ? 'same' : 'changed', note: lost.length ? lost.join(' / ') : commit });
    } catch (err) { results.push({ part: 'own', key: p.name, state: 'failed', note: String(err.message || err) }); }
  }

  /* 2a. The held copy against the canonical file on cpsbvbng26-dotcom's main (read only). */
  let canon = null;
  try { canon = JSON.parse(await get(CANON)); } catch (err) { results.push({ part: 'canonical', key: 'cpsbvbng26-dotcom verification/statutes.json', state: 'failed', note: String(err.message || err) }); }
  if (canon) {
    const d = copyDiff(held, canon);
    if (record && d.length) {
      const next = { '条文': {}, '規約': held['規約'] };
      for (const [k, v] of Object.entries(canon['条文'])) next['条文'][k] = Object.assign({}, held['条文'][k] || {}, { '法令': v['法令'], 'e-Gov': v['e-Gov'], '文': v['文'], sha256: v.sha256 });
      for (const [k, v] of Object.entries(canon['規約'])) if (next['規約'][k]) next['規約'][k].phrases = Object.keys(v).filter((x) => x.startsWith('引いた句')).map((x) => v[x]);
      Object.assign(held, next);
    }
    results.push({ part: 'canonical', key: 'held copy = cpsbvbng26-dotcom main', state: d.length ? 'changed' : 'same', note: d.slice(0, 6).map((x) => x.key + ' (' + x.why + ')').join(' / ') });
  }

  /* 2b. Each held article against the e-Gov law API. */
  const whole = {};
  for (const [key, e] of Object.entries(held['条文'])) {
    try {
      let text = null;
      if (e['取り寄せ方'] === 'suppl') {
        if (!whole[e['e-Gov']]) whole[e['e-Gov']] = supplProvisions(await egov('https://laws.e-gov.go.jp/api/1/lawdata/' + e['e-Gov']));
        const sp = whole[e['e-Gov']][e['附則']];
        text = sp ? articleText(sp, e['条'], null) : null;
      } else if (e['取り寄せ方'] === 'articles') {
        const xml = await egov('https://laws.e-gov.go.jp/api/1/articles;lawId=' + e['e-Gov'] + ';article=' + e['条']);
        text = (/<Code>(\d+)<\/Code>/.exec(xml) || [])[1] === '0' ? articleText(xml, e['条'], null) : null;
      }
      if (text === null) { results.push({ part: 'canonical', key, state: 'missing' }); continue; }
      results.push({ part: 'canonical', key, state: sha(text) === e.sha256 ? 'same' : 'changed' });
    } catch (err) { results.push({ part: 'canonical', key, state: 'failed', note: String(err.message || err) }); }
  }

  /* 2c. Each held term on GitHub. */
  for (const [key, e] of Object.entries(held['規約'])) {
    if (e['見張り'] !== 'github') continue;
    try {
      const { commit, body } = await githubFile(e.repo, e.branch, e.path);
      const lost = e.phrases.filter((x) => flat(body).indexOf(flat(x)) < 0);
      let state = lost.length ? 'missing' : commit === e.commit ? 'same' : 'changed';
      const known = (held['既知の違い'] || {})[key];
      if (state !== 'same' && known && known.commit === commit) state = 'known';
      results.push({ part: 'canonical', key, state, note: commit + (lost.length ? '; phrase not found: ' + lost.map((x) => x.slice(0, 40)).join(' / ') : '') });
    } catch (err) { results.push({ part: 'canonical', key, state: 'failed', note: String(err.message || err) }); }
  }

  if (record) {
    conf.fetched = today();
    fs.writeFileSync(FILE, JSON.stringify(conf, null, 2) + '\n');
    fs.writeFileSync(TEXTS, JSON.stringify(texts, null, 2) + '\n');
    fs.writeFileSync(HELD, JSON.stringify(held, null, 2) + '\n');
  }
  for (const r of results) console.log(r.state.padEnd(8) + ' ' + r.part.padEnd(10) + ' ' + r.key + (r.note && r.state !== 'same' ? '  (' + r.note + ')' : ''));
  const odd = results.filter((r) => !['same', 'known'].includes(r.state));
  const known = results.filter((r) => r.state === 'known');
  console.log('\n' + results.length + ' checked, ' + odd.length + ' differ from the record, ' + known.length + ' known differences.');
  if (['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME) && process.env.GITHUB_TOKEN && !record) await report(odd, known);
  if (odd.length && !record) process.exit(1);
}

/* One issue in this repository with fixed words. It lists the keys only, never a fetched text. */
async function report(odd, known) {
  const repo = process.env.GITHUB_REPOSITORY;
  const H = { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': UA };
  const call = async (method, url, body) => {
    const r = await fetch('https://api.github.com' + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(method + ' ' + url + ' ' + r.status);
    return r.json();
  };
  const open = (await call('GET', '/repos/' + repo + '/issues?state=open&labels=' + encodeURIComponent('法令') + '&per_page=50'))
    .find((i) => !i.pull_request && String(i.body || '').includes(MARK));
  if (!odd.length && !known.length) {
    if (open) {
      await call('POST', '/repos/' + repo + '/issues/' + open.number + '/comments', { body: today() + ' の確認で、すべて記した値と同じでした。閉じます。' });
      await call('PATCH', '/repos/' + repo + '/issues/' + open.number, { state: 'closed', state_reason: 'completed' });
    }
    return;
  }
  const line = (r) => '- ' + (r.part === 'own' ? 'このリポジトリ' : 'cpsbvbng26-dotcom の写し') + '：' + r.key + '（' + r.state + '）';
  const body = MARK + '\n' + today() + ' の確認で、次のものが記した値と違いました。\n\n'
    + (odd.length ? odd.map(line).join('\n') : '- （新しい違いはありません）')
    + (known.length ? '\n\n記した違い（`verification/canonical-statutes.json` の既知の違い）：\n\n' + known.map(line).join('\n') : '')
    + '\n\n頁と正本が引く文は、記し直すまで、記した日の文のままです。cpsbvbng26-dotcom の写しの違いは、正本の側で記し直します。';
  if (open) await call('PATCH', '/repos/' + repo + '/issues/' + open.number, { body });
  else await call('POST', '/repos/' + repo + '/issues', { title: '頁と正本が引く条文か規約が変わったかもしれない', body, labels: ['法令'] });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
module.exports = { plain, sha, articleText, supplProvisions, copyDiff, flat };
