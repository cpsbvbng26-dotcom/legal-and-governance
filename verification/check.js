#!/usr/bin/env node
/* legal-and-governance の検査（網に出ない分）。
 *
 *   node verification/check.js           どの検査も通るか
 *   node verification/check.js --break   どの検査も、壊せば落ちるか（壊し方の無い検査があっても落ちる）
 *
 * 検査はどれも、ファイルの中身の表（パス → 文字列）を受け取り、見つけた問題の一覧を返す純粋な関数である。
 * --break は、表の写しを壊して同じ関数に渡し、問題が一つ以上返ることを確かめる。網には出ない。
 * ほかのリポジトリの main と照らす分は verification/check_remote.js にある。どちらも、頁から「何を照らすか」を
 * 取り出す関数（claims）をここで共有する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules']);
function load(root) {
  const F = new Map();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else F.set(r, fs.readFileSync(path.join(dir, e.name), 'utf8'));
    }
  };
  walk(root || ROOT, '');
  return F;
}
const sha = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
const json = (F, p) => { try { return JSON.parse(F.get(p)); } catch (e) { return null; } };
const OWNER = 'cpsbvbng26-dotcom';
const SELF = 'legal-and-governance';
const GH = 'https://github.com/' + OWNER + '/';
const REPO = GH + SELF;

/* ------------------------------------------------------------ 何を散文と見るか */

const PAGES = (F) => [...F.keys()].filter((p) => /^README(\.en)?\.md$/.test(p) || /^pages\/[a-z-]+(\.en)?\.md$/.test(p)).sort();
const PROSE = (F) => PAGES(F).concat([...F.keys()].filter((p) => /^docs\/.+\.md$/.test(p)).sort());
const FORMS = ['.github/ISSUE_TEMPLATE/request.yml', '.github/ISSUE_TEMPLATE/advisory.yml'];
const ALL_FORMS = FORMS.concat(['.github/ISSUE_TEMPLATE/error-report.yml']);
const isEn = (p) => /\.en\.md$/.test(p);
const LAW_PAGES = ['pages/law.md', 'pages/law.en.md'];

/* 様式の、人が読む文だけ。鍵と型の行を落とす。 */
function formText(t) {
  const lines = String(t || '').split('\n');
  return lines.map((l) => l.replace(/^\s*(?:-\s+)?(?:label|description|name|title|about|value):\s*\|?\s*/, '').replace(/^\s*-\s+/, ''))
    .filter((l, i) => !/^\s*(?:type|id|required|validations|attributes|options|body|labels|blank_issues_enabled|contact_links|url):/.test(lines[i]))
    .join('\n');
}

/* 「」の中を、入れ子ごと取り出す。[{ at, text }] */
function quotes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '「') continue;
    let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '「') d++; else if (s[j] === '」' && --d === 0) break; }
    if (j >= s.length) { out.push({ at: i, text: null }); break; }
    out.push({ at: i, text: s.slice(i + 1, j) });
    i = j;
  }
  return out;
}
/* 英語の頁の "" の引用。 */
const dquotes = (s) => [...String(s).matchAll(/"([^"\n]+)"/g)].map((m) => ({ at: m.index, text: m[1] }));
const stripQuotes = (s) => { let o = '', last = 0; for (const q of quotes(s)) { if (q.text === null) break; o += s.slice(last, q.at) + '「」'; last = q.at + q.text.length + 2; } return o + s.slice(last); };
/* 囲み・コード・URL・リンクの行き先・引用を落とした文。 */
function bare(s) {
  return stripQuotes(String(s).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '``').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, '').replace(/"[^"\n]*"/g, '""'));
}
/* 照らすための形：リンクの記法を落とし、空白を一つにまとめる。 */
const norm = (s) => String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const headings = (t) => String(t || '').split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#{1,6} /, '').trim());

/* ------------------------------------------------------------ 頁が何を言い、どこを指すか */

/* GitHub の URL を、リポジトリとパスにする。 */
function ghTarget(url) {
  const u = String(url).replace(/#.*$/, '');
  let m = new RegExp('^' + GH.replace(/[.]/g, '\\.') + '([^/\\s)]+)/blob/main/([^\\s)"?]+)$').exec(u);
  if (m) return { repo: m[1], path: decodeURIComponent(m[2]) };
  m = new RegExp('^' + GH.replace(/[.]/g, '\\.') + '([^/\\s)]+)/issues/new\\?template=([^\\s)"&]+)$').exec(u);
  if (m) return { repo: m[1], path: '.github/ISSUE_TEMPLATE/' + m[2] };
  return null;
}

/* 頁・様式・CLAUDE.md から、照らすべきことを取り出す。
 * kind: exists（そのファイルがある）、section（その節の名が見出しにある）、quote（その句がそのまま現れる）、
 *       local-bad（どれにも当たらない「」）。repo が SELF なら、ここで照らす。 */
function claims(F) {
  const out = [];
  const files = PROSE(F).concat(ALL_FORMS, ['.github/ISSUE_TEMPLATE/config.yml', 'CLAUDE.md']).filter((f) => F.has(f));
  const localForms = new Set();
  for (const f of ALL_FORMS) for (const m of (F.get(f) || '').matchAll(/^\s*(?:name|label|-)\s*:?\s*(.+)$/gm)) for (const part of m[1].split(' / ')) localForms.add(part.trim().replace(/^- /, ''));
  for (const f of files) {
    const t = F.get(f) || '';
    const prose = PROSE(F).includes(f);
    t.split('\n').forEach((line, n) => {
      const at = f + ' ' + (n + 1);
      /* どこを指すか */
      for (const m of line.matchAll(/https:\/\/github\.com\/[^\s)"]+/g)) {
        const g = ghTarget(m[0]);
        if (g) out.push({ at, kind: 'exists', repo: g.repo, path: g.path });
        else if (new RegExp('^' + GH.replace(/[.]/g, '\\.') + '[^/]+/(blob|tree)/').test(m[0])) out.push({ at, kind: 'bad-url', text: m[0] });
      }
      for (const m of line.matchAll(/\]\((?!https?:|#)([^)#\s]+)(?:#[^)]*)?\)/g)) {
        out.push({ at, kind: 'exists', repo: SELF, path: path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])) });
      }
      if (!prose) return;
      /* 節の名：リンクの直後の の「X」（と「Y」）、英語は , section "X"（and "Y"） */
      const used = new Set();
      const target = (url) => (/^https?:/.test(url) ? ghTarget(url) : { repo: SELF, path: path.posix.normalize(path.posix.join(path.posix.dirname(f), url.replace(/#.*$/, ''))) });
      for (const m of line.matchAll(/\]\(([^)\s]+)\)の((?:「[^「」]+」と?)+)/g)) {
        const g = target(m[1]);
        let off = m.index + m[0].indexOf(m[2]);
        for (const q of m[2].matchAll(/「([^「」]+)」/g)) {
          used.add(off + q.index);
          if (g) out.push({ at, kind: 'section', repo: g.repo, path: g.path, text: q[1] });
        }
      }
      for (const m of line.matchAll(/\]\(([^)\s]+)\),? sections? ((?:"[^"]+"(?: and )?)+)/g)) {
        const g = target(m[1]);
        let off = m.index + m[0].indexOf(m[2]);
        for (const q of m[2].matchAll(/"([^"]+)"/g)) {
          used.add(off + q.index);
          if (g) out.push({ at, kind: 'section', repo: g.repo, path: g.path, text: q[1] });
        }
      }
      if (LAW_PAGES.includes(f)) return;
      /* 引いた句 */
      const ext = [...line.matchAll(/\]\((https:\/\/github\.com\/[^)\s]+)\)/g)].map((m) => ghTarget(m[1])).filter((g) => g && g.repo !== SELF);
      const uniq = [...new Set(ext.map((g) => g.repo + ':' + g.path))];
      const qs = quotes(line).filter((q) => q.text !== null).concat(isEn(f) ? dquotes(line) : []);
      for (const q of qs) {
        if (used.has(q.at)) continue;
        const text = q.text;
        if (text === CONSENT_EN) continue;
        if (headings(t).includes(text) || localForms.has(text)) continue;
        if (uniq.length === 1) { const [repo, p] = uniq[0].split(':'); out.push({ at, kind: 'quote', repo, path: p, text }); continue; }
        out.push({ at, kind: 'local-bad', text });
      }
    });
  }
  return out;
}

/* ------------------------------------------------------------ 条の参照 */

const JA_LAWS = ['個人情報保護法', '著作権法', '民法', '労働基準法', '労働契約法'];
const EN_LAWS = { 'Act on the Protection of Personal Information': '個人情報保護法', 'Copyright Act': '著作権法', 'Civil Code': '民法', 'Labour Standards Act': '労働基準法', 'Labour Contracts Act': '労働契約法' };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const JA_REF = new RegExp('(' + JA_LAWS.join('|') + ')?第(\\d+)条(?:第(\\d+)項)?(?:第(\\d+)号)?', 'g');
const EN_REF = new RegExp('Article (\\d+)(?:\\((\\d+)\\))?(?:\\(([ivx]+)\\))?(?: of (?:the |Japan\'s )?(' + Object.keys(EN_LAWS).join('|') + '))?', 'g');
const SEC_REF = /(?:利用規約 |Section )([A-Z]\.\d+)/g;

/* 一つの頁の、行ごとの参照。見出しが法令を決め、行の中の名がそれに勝つ。 */
function refs(text, en) {
  const out = [];
  let law = null;
  text.split('\n').forEach((line, n) => {
    if (/^#/.test(line)) {
      const h = en ? Object.keys(EN_LAWS).find((k) => line.includes(k)) : JA_LAWS.find((k) => line.includes(k));
      law = h ? (en ? EN_LAWS[h] : h) : (/GitHub/.test(line) ? null : law);
      if (/^## /.test(line) && !h) law = null;
      return;
    }
    const re = new RegExp(en ? EN_REF.source : JA_REF.source, 'g');
    let m;
    const lineLaw = law;
    while ((m = re.exec(line))) {
      const named = en ? (m[4] ? EN_LAWS[m[4]] : null) : m[1];
      const item = en ? (m[3] ? ROMAN[m[3]] : null) : (m[4] ? Number(m[4]) : null);
      out.push({ line: n, at: m.index, end: m.index + m[0].length, kind: 'article', law: named || lineLaw, article: Number(en ? m[1] : m[2]), item });
    }
    let s; const sr = new RegExp(SEC_REF.source, 'g');
    while ((s = sr.exec(line))) out.push({ line: n, at: s.index, end: s.index + s[0].length, kind: 'section', section: s[1] });
  });
  return out;
}
function statuteKey(S, r) {
  if (!r.law) return null;
  const k = r.law + ' 第' + r.article + '条';
  return S.statutes.some((e) => e.law + ' ' + e.label === k) ? k : null;
}

/* ------------------------------------------------------------ 使わない語（符号にして置く） */

const dec = (b) => Buffer.from(b, 'base64').toString('utf8');
/* 運営者のほかの創作の場の名。書けば、この検査自身が掛かるので符号にしてある。 */
const OTHER_PLACE = ['TnVzcXVhbWE=', '44OM44K544Kv44Kh44Oe', '54Sh5L2V5pyJ6aiO5aOr546L5Zu9'].map(dec);
/* 大学の名。 */
const SCHOOL = [new RegExp(dec('WkVO') + '\\s*(?:' + dec('5aSn5a2m') + '|University)', 'i'), new RegExp(dec('WkVO') + dec('5aSn'))];
/* 自称の肩書き（cpsbvbng26-dotcom の check_text.js と同じ語）。 */
const TITLES = ['独立研究者', 'Independent Researcher'];

/* ------------------------------------------------------------ 検査 */

const CONSENT_JA = 'この issue の題と本文を、運営者が Claude（Anthropic、米国）に渡すことに同意します。';
const CONSENT_EN = 'I consent to the operator giving the title and text of this issue to Claude (Anthropic, United States).';
const RULE17 = 'I consent to the operator giving the title and text of this issue to Claude';
const COPIES = ['SECURITY.md', '.github/ISSUE_TEMPLATE/error-report.yml', '.github/checked-intake/verify.js', '.github/workflows/checked-intake.yml', '.github/workflows/empty-issue.yml'];

const CHECKS = [];
const check = (name, fn) => CHECKS.push({ name, fn });

check('正本の写しが、記した sha256 と同じ', (F) => {
  const C = json(F, 'verification/copies.json');
  if (!C) return ['copies.json が読めない'];
  const bad = [];
  for (const [f, h] of Object.entries(C['写し'])) if (!F.has(f) || sha(F.get(f)) !== h) bad.push(f);
  if (JSON.stringify(Object.keys(C['写し'])) !== JSON.stringify(COPIES)) bad.push('写しの並び');
  if (!/^[0-9a-f]{40}$/.test(C['写した正本のコミット'] || '')) bad.push('写した正本のコミット');
  return bad;
});

check('どの様式も、決まりの文の同意の欄を持つ（このリポジトリの様式は任意、誤りの知らせは正本のとおり必須）', (F) => {
  const bad = [];
  for (const f of ALL_FORMS) {
    const t = F.get(f) || '';
    const mine = !f.endsWith('error-report.yml');
    const want = mine ? 'false' : 'true';
    const i = t.indexOf('- label: ' + CONSENT_JA + ' / ' + CONSENT_EN);
    if (i < 0) { bad.push(f + '：同意の欄の文'); continue; }
    const after = /^\s*required: (true|false)/.exec(t.slice(t.indexOf('\n', i) + 1));
    if (!after || after[1] !== want) bad.push(f + '：required');
    if (!t.includes('個人情報保護法第') || !/第 ?28 ?条/.test(t) || !t.includes('Article 28')) bad.push(f + '：第28条');
    if (!CONSENT_EN.startsWith(RULE17)) bad.push('決めごとの文');
    if (mine) {
      if (!t.includes(REPO + '/blob/main/pages/privacy.md') || !t.includes(REPO + '/blob/main/pages/privacy.en.md')) bad.push(f + '：個人情報の取り扱いへのリンク');
      if (!t.includes('「外国にある第三者について知らせること」') || !t.includes('"Information on the third party in a foreign country"')) bad.push(f + '：節の名');
      if (!t.includes('印は任意です。') || !t.includes('The box is optional.')) bad.push(f + '：任意であること');
    }
  }
  const P = F.get('pages/privacy.md') || '', E = F.get('pages/privacy.en.md') || '';
  if (!P.includes('「' + CONSENT_EN + '」')) bad.push('privacy.md が同意の文を引いていない');
  if (!E.includes('"' + CONSENT_EN + '"')) bad.push('privacy.en.md が同意の文を引いていない');
  if (!headings(P).includes('外国にある第三者について知らせること') || !headings(E).includes('Information on the third party in a foreign country')) bad.push('第28条第2項の情報の節が無い');
  if (!(F.get('CLAUDE.md') || '').includes('（"' + RULE17 + '"）')) bad.push('CLAUDE.md が決めごと 17 の文を持たない');
  return bad;
});

check('このリポジトリの様式は、書く欄より前に利用目的・公開されること・メールの道・規程へのリンクを置き、白紙の issue を開けない', (F) => {
  const bad = [];
  for (const f of FORMS) {
    const t = F.get(f) || '';
    const first = t.indexOf('  - type: markdown');
    const field = t.search(/\n  - type: (?!markdown)/);
    const head = first >= 0 && field > first ? t.slice(first, field) : '';
    if (!head) { bad.push(f + '：最初が説明の欄でない'); continue; }
    if (!head.includes(REPO + '/blob/main/pages/privacy.md') || !head.includes(REPO + '/blob/main/pages/privacy.en.md')) bad.push(f + '：個人情報の取り扱いへのリンク');
    if (!/にだけ使います。/.test(head) || !/used only/.test(head)) bad.push(f + '：利用目的');
    if (!head.includes('この issue は公開されます。') || !head.includes('This issue is public.')) bad.push(f + '：公開されること');
    if (!head.includes('ORCID の記録にあるメールアドレス') || !head.includes("address on the operator's ORCID record") || !head.includes('https://orcid.org/0009-0000-1406-0547')) bad.push(f + '：メールの道');
    if (/プロフィール|profile/i.test(head)) bad.push(f + '：連絡先をプロフィールに公開させる道');
  }
  const r = F.get(FORMS[0]) || '';
  for (const t of ['removal.yml', 'withdrawal.yml', 'correction.yml', 'rights-ja.yml', 'rights.yml']) if (!r.includes(GH + 'sophaxis/issues/new?template=' + t)) bad.push('求めの様式：Sophaxis の ' + t);
  if (!/blank_issues_enabled: false/.test(F.get('.github/ISSUE_TEMPLATE/config.yml') || '')) bad.push('白紙の issue が開ける');
  return bad;
});

check('様式とワークフローが使うラベルを、labels.yml が作る', (F) => {
  const L = F.get('.github/workflows/labels.yml') || '';
  const made = new Set([...L.matchAll(/gh label create "([^"]+)"/g)].map((m) => m[1]));
  const want = new Set();
  for (const f of ALL_FORMS) for (const m of (F.get(f) || '').matchAll(/^labels: \[([^\]]*)\]/gm)) m[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean).forEach((x) => want.add(x));
  ['法令', 'quote verified', 'not verified', 'not checked', 'needs a person'].forEach((x) => want.add(x));
  if (!(F.get('tools/statutes.js') || '').includes("encodeURIComponent('法令')")) want.add('（見張りのラベルが法令でない）');
  return [...want].filter((x) => !made.has(x));
});

check('どのファイルにも、メールアドレスが無い', (F) => {
  const bad = [];
  for (const [f, t] of F) if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.test(t) || new RegExp('mail' + 'to:', 'i').test(t)) bad.push(f);
  return bad;
});

check('どのファイルにも、大学の名と自称の肩書きが無い', (F) => {
  const bad = [];
  for (const [f, t] of F) {
    if (f === 'verification/check.js') continue;
    if (SCHOOL.some((re) => re.test(t))) bad.push(f + '：大学の名');
    if (TITLES.some((w) => t.includes(w))) bad.push(f + '：肩書き');
  }
  return bad;
});

check('どのファイルにも、運営者のほかの創作の場の名が無く、そのリポジトリを指さない', (F) => {
  const bad = [];
  for (const [f, t] of F) {
    const low = t.toLowerCase();
    if (OTHER_PLACE.some((w) => low.includes(w.toLowerCase()))) bad.push(f);
  }
  const S = json(F, 'verification/scope.json');
  if (!S) return bad.concat(['scope.json が読めない']);
  const allowed = new Set(S['十'].concat(S['ほか']));
  for (const c of claims(F)) if (c.repo && !allowed.has(c.repo)) bad.push(c.at + '：索引の外のリポジトリ ' + c.repo);
  return bad;
});

check('記した条文は、記した sha256 と合い、法令の番号の形と出どころを持つ。正本の条文の写しも同じ', (F) => {
  const S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json'), K = json(F, 'verification/canonical-statutes.json');
  if (!S || !T || !K) return ['statutes.json か statutes-texts.json か canonical-statutes.json が読めない'];
  const bad = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(S.fetched || '')) bad.push('取り寄せた日');
  for (const e of S.statutes) {
    const k = e.law + ' ' + e.label;
    if (!/^\d{3}[A-Z]{2}[0-9A-Z]{10}$/.test(e.law_id)) bad.push(k + '：法令の番号');
    if (!e.law_id_from) bad.push(k + '：番号の出どころ');
    if (T[k] === undefined || sha(T[k]) !== e.sha256) bad.push(k + '：sha256');
  }
  if (Object.keys(T).length !== S.statutes.length) bad.push('写した文の数が条の数と違う');
  for (const p of S.policies) {
    if (!/^[0-9a-f]{40}$/.test(p.commit)) bad.push(p.name + '：コミット');
    for (const [s, ph] of Object.entries(p.sections || {})) if (!p.phrases.includes(ph)) bad.push(p.name + ' ' + s);
  }
  const C = K['条文'] || {};
  if (!/^[0-9a-f]{40}$/.test(K['写した正本のコミット'] || '')) bad.push('正本の条文：写したコミット');
  for (const [k, e] of Object.entries(C)) {
    if (sha(e['文'] || '') !== e.sha256) bad.push('正本の条文 ' + k + '：sha256');
    if (!/^\d{3}(?:[A-Z]{2}[0-9A-Z]{10}|M\d{11})$/.test(e['e-Gov'] || '')) bad.push('正本の条文 ' + k + '：法令の番号');
    if (!['articles', 'suppl', 'none'].includes(e['取り寄せ方'])) bad.push('正本の条文 ' + k + '：取り寄せ方');
  }
  if (Object.keys(C).length < 50) bad.push('正本の条文の写しが少ない');
  for (const [k, e] of Object.entries(K['規約'] || {})) {
    if (e['見張り'] === 'github' && (!/^[\w.-]+\/[\w.-]+$/.test(e.repo || '') || !e.path || !(e.phrases || []).length)) bad.push('正本の規約 ' + k + '：見張りの形');
    if (e['見張り'] !== 'github' && !e['見張らない理由']) bad.push('正本の規約 ' + k + '：見張らない理由');
  }
  return bad;
});

check('法令の整理の頁（日英）の引用が、取り寄せた条の文にそのまま現れ、記した条をすべて引き、取り寄せた日を書く', (F) => {
  const S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json');
  if (!S || !T) return ['statutes.json が読めない'];
  const bad = [];
  const policy = S.policies[0];
  for (const f of LAW_PAGES) {
    const text = F.get(f) || '';
    const en = isEn(f);
    const R = refs(text, en);
    const used = new Set();
    let carry = null;
    text.split('\n').forEach((line, n) => {
      const rl = R.filter((r) => r.line === n);
      for (const q of quotes(line)) {
        if (q.text === null) { bad.push(f + ' ' + (n + 1) + '：閉じない「'); break; }
        if (line.slice(0, q.at).endsWith(')の')) continue;
        const before = rl.filter((r) => r.at < q.at);
        const r = before.length ? before[before.length - 1] : carry;
        if (!r) { bad.push(f + ' ' + (n + 1) + '：どの条の引用か分からない'); continue; }
        if (r.kind === 'section') { if (policy.sections[r.section] !== q.text) bad.push(f + ' ' + (n + 1) + '：' + r.section + ' の句'); continue; }
        const k = statuteKey(S, r);
        if (!k) { bad.push(f + ' ' + (n + 1) + '：記していない条'); continue; }
        used.add(k);
        if (!T[k] || !T[k].includes(q.text)) bad.push(f + ' ' + (n + 1) + '：' + k + ' に無い句「' + q.text.slice(0, 20) + '」');
      }
      if (rl.length) carry = rl[rl.length - 1];
    });
    for (const e of S.statutes) if (!used.has(e.law + ' ' + e.label)) bad.push(f + '：' + e.law + ' ' + e.label + ' を引いていない');
    const d = en ? 'fetched from the e-Gov law API on ' + S.fetched + '.' : S.fetched + ' に e-Gov 法令 API から取り寄せた';
    if (!text.includes(d)) bad.push(f + '：取り寄せた日');
    if (!text.includes(policy.commit)) bad.push(f + '：規約のコミット');
  }
  return bad;
});

check('頁と様式が挙げる条は、どれも記した条である', (F) => {
  const S = json(F, 'verification/statutes.json');
  if (!S) return ['statutes.json が読めない'];
  const bad = [];
  for (const f of PROSE(F).concat(FORMS)) {
    const t = FORMS.includes(f) ? formText(F.get(f)) : F.get(f);
    const R = refs(t, isEn(f)).concat(FORMS.includes(f) ? refs(t, true) : []);
    for (const r of R) {
      if (r.kind === 'section') { if (!S.policies[0].sections[r.section]) bad.push(f + '：節 ' + r.section); continue; }
      if (!statuteKey(S, r)) bad.push(f + '：' + (r.law || '法令の名が無い') + ' ' + r.article + ' 条');
    }
  }
  return bad;
});

/* 散文の数。台帳のどれかの照らし方に当たらない数があれば落ちる。 */
function numberTokens(F, f) {
  const raw = FORMS.includes(f) ? formText(F.get(f)) : F.get(f);
  const t = bare(raw);
  const en = isEn(f);
  const spans = refs(t, en).concat(FORMS.includes(f) ? refs(t, true) : []).map((r) => [r.at, r.end, r.line]);
  const N = json(F, 'verification/numbers.json') || { fixed: [] };
  const forms = N.fixed.flatMap((x) => [x.re, x.en]);
  t.split('\n').forEach((line, n) => {
    for (const re of forms) for (const m of line.matchAll(new RegExp(re, 'g'))) spans.push([m.index, m.index + m[0].length, n]);
  });
  const out = [];
  t.split('\n').forEach((line, n) => {
    for (const m of line.matchAll(/(?<![A-Za-z0-9_-])\d+(?:[.\-]\d+)*(?![A-Za-z0-9_])/g)) {
      if (spans.some(([a, b, l]) => l === n && m.index >= a && m.index < b)) continue;
      out.push({ text: m[0], rest: line.slice(m.index), line: n + 1 });
    }
    for (const m of line.matchAll(/[一二三四五六七八九十百千]+(?:つ|件|項目|通り|本|か所|部分|人|条)/g)) out.push({ text: m[0], rest: m[0], line: n + 1, kanji: true });
  });
  return out;
}
const ORCID_OK = (id) => { const d = id.replace(/-/g, ''); let t = 0; for (const c of d.slice(0, -1)) t = (t + Number(c)) * 2; const r = (12 - (t % 11)) % 11; return (r === 10 ? 'X' : String(r)) === d.slice(-1); };
check('散文の数は、どれも台帳に載り、それぞれの照らし方で合う', (F) => {
  const N = json(F, 'verification/numbers.json'), S = json(F, 'verification/statutes.json'), T = json(F, 'verification/statutes-texts.json'), SC = json(F, 'verification/scope.json');
  if (!N || !S || !T || !SC) return ['台帳が読めない'];
  const bad = [];
  const seenDates = new Set();
  for (const f of PROSE(F).concat(FORMS)) {
    for (const tok of numberTokens(F, f)) {
      if (tok.kanji) { bad.push(f + ' ' + tok.line + '：漢字の数「' + tok.text + '」'); continue; }
      if (/^\d{4}-\d{2}-\d{2}/.test(tok.rest)) { const d = tok.rest.slice(0, 10); if (N.dates[d]) { seenDates.add(d); continue; } bad.push(f + ' ' + tok.line + '：台帳に無い日 ' + d); continue; }
      bad.push(f + ' ' + tok.line + '：台帳に無い数 ' + tok.text);
    }
  }
  for (const d of Object.keys(N.dates)) if (!seenDates.has(d)) bad.push('台帳の日 ' + d + ' がどこにも無い');
  const has = (f, s) => (F.get(f) || '').includes(s);
  for (const x of N.fixed) {
    if (x.check === 'age-min') for (const f of ['pages/advisory.md', 'pages/law.md', FORMS[1]]) if (!has(f, '16 歳')) bad.push(f + '：16 歳');
    if (x.check === 'age-min') for (const f of ['pages/advisory.en.md', 'pages/law.en.md', FORMS[1]]) if (!has(f, '16 years')) bad.push(f + '：16 years');
    if (x.check === 'age-adult' && !(T['民法 第4条'] || '').includes('十八歳')) bad.push('民法第4条に十八歳が無い');
    if (x.check === 'days' && !(has('pages/advisory.md', '7 日') && has('pages/advisory.en.md', '7 days'))) bad.push('7 日');
    if (x.check === 'licence' && !(F.get('LICENSE') || '').startsWith('Creative Commons Attribution 4.0 International')) bad.push('LICENSE の版');
    if (x.check === 'orcid' && !ORCID_OK(x.re)) bad.push('ORCID iD の検査の数字');
    if (x.check === 'ten' && SC['十'].length !== 10) bad.push('scope.json の 十 の数');
    if (x.check === 'coi' && !(has('pages/advisory.md', 'この 3 年間に') && has('pages/advisory.en.md', 'in the last three years'))) bad.push('利益相反の期間');
    if (x.check === 'rule18' && !(F.get('CLAUDE.md') || '').includes('**合っているかを、最低 10 回確かめる。**')) bad.push('10 回が CLAUDE.md の決めごとと違う');
  }
  if (!(F.get('verification/statutes.json') || '').includes('"fetched": "' + Object.keys(N.dates)[0] + '"')) bad.push('取り寄せた日が台帳の初めの日と違う');
  return bad;
});

check('約束の文が、一字一句そのままある', (F) => {
  const P = json(F, 'verification/promises.json');
  if (!P) return ['promises.json が読めない'];
  const bad = [];
  for (const [f, list] of Object.entries(P.files)) for (const s of list) if (!(F.get(f) || '').includes(s)) bad.push(f + '：' + s.slice(0, 24));
  for (const p of PAGES(F)) if (!P.files[p]) bad.push(p + '：約束を固めていない');
  return bad;
});

check('頁と様式のつながり：このリポジトリの中のリンク先と節の名があり、「」はどれも照らせる形で、README がすべての頁を挙げ、様式の選びが頁と scope.json と同じ', (F) => {
  const bad = [];
  for (const c of claims(F)) {
    if (c.kind === 'bad-url') bad.push(c.at + '：main の枝のファイルを指していない URL ' + c.text);
    if (c.kind === 'local-bad') bad.push(c.at + '：照らせない「' + c.text.slice(0, 20) + '」');
    if (c.repo !== SELF) continue;
    if (!F.has(c.path)) { bad.push(c.at + ' → ' + c.path); continue; }
    if (c.kind === 'section' && !headings(F.get(c.path)).includes(c.text)) bad.push(c.at + '：' + c.path + ' に節「' + c.text + '」が無い');
  }
  for (const p of PAGES(F).filter((x) => x.startsWith('pages/'))) {
    const readme = isEn(p) ? 'README.en.md' : 'README.md';
    const index = isEn(p) ? 'pages/index.en.md' : 'pages/index.md';
    if (!(F.get(readme) || '').includes('(./' + p + ')') && !(F.get(index) || '').includes('(./' + p.slice(6) + ')')) bad.push(p + ' をどこも挙げない');
    if (!(F.get(readme) || '').includes('(./' + p + ')') && p !== 'pages/index.md' && p !== 'pages/index.en.md' && !['requests', 'advisory'].some((x) => p.includes(x))) bad.push(readme + ' が ' + p + ' を挙げない');
  }
  const opts = (t, id) => { const i = t.indexOf('id: ' + id); const j = t.indexOf('validations:', i); return i < 0 ? [] : [...t.slice(i, j).matchAll(/^\s+- (.+)$/gm)].map((m) => m[1].split(' / ')); };
  const listOf = (t, h) => { const i = t.indexOf(h); if (i < 0) return []; const k = t.indexOf('\n- ', i); const j = t.indexOf('\n\n', k + 1); return [...t.slice(k, j < 0 ? undefined : j).matchAll(/^- (.+)$/gm)].map((m) => m[1]); };
  const kinds = opts(F.get(FORMS[0]) || '', 'kind');
  if (!kinds.length || JSON.stringify(kinds.map((o) => o[0])) !== JSON.stringify(listOf(F.get('pages/requests.md') || '', '## この入口の様式で受ける求め'))) bad.push('求めの種類（日本語）が様式と違う');
  if (JSON.stringify(kinds.map((o) => o[1])) !== JSON.stringify(listOf(F.get('pages/requests.en.md') || '', '## Requests received by the form of this entrance'))) bad.push('求めの種類（英語）が様式と違う');
  const SC = json(F, 'verification/scope.json');
  const repos = opts(F.get(FORMS[0]) || '', 'repo').map((o) => o[0]);
  if (!SC || JSON.stringify(repos) !== JSON.stringify(SC['様式で選べる'].concat(['分からない']))) bad.push('求めの様式のリポジトリの選びが scope.json と違う');
  const fields = opts(F.get(FORMS[1]) || '', 'field').map((o) => o[0]);
  const first = listOf(F.get('pages/advisory.md') || '', '## 加われる人')[0] || '';
  if (fields.length !== 5 || fields.some((x) => !first.includes(x))) bad.push('諮問委員への申し出の分野が「加われる人」と違う');
  if (SC) for (const f of ['pages/index.md', 'pages/index.en.md']) {
    const t = F.get(f) || '';
    for (const r of SC['十'].concat(SC['ほか']).filter((x) => x !== SELF)) if (!t.includes(GH + r + '/blob/main/')) bad.push(f + '：' + r + ' を指さない');
    const tenRows = t.split('\n').filter((l) => /^\| [a-z0-9-]+ \| \[LICENSE\]/.test(l)).map((l) => l.split(' | ')[0].slice(2));
    if (JSON.stringify(tenRows) !== JSON.stringify(SC['十'])) bad.push(f + '：10 のリポジトリの表が scope.json と違う');
  }
  return bad;
});

check('日本語と英語の頁が対で、最終更新の日・節の数・数と条がそろう', (F) => {
  const bad = [];
  const N = json(F, 'verification/numbers.json') || { fixed: [] };
  for (const p of PAGES(F).filter((x) => !isEn(x))) {
    const q = p.replace(/\.md$/, '.en.md');
    if (!F.has(q)) { bad.push(q + ' が無い'); continue; }
    const a = F.get(p), b = F.get(q);
    const da = (/最終更新：(\d{4}-\d{2}-\d{2})。/.exec(a) || [])[1], db = (/Last updated: (\d{4}-\d{2}-\d{2})\./.exec(b) || [])[1];
    if (!/^README/.test(p) && (!da || da !== db)) bad.push(p + '：最終更新の日');
    for (const h of ['## ', '### ']) { const c = (t) => t.split('\n').filter((l) => l.startsWith(h)).length; if (c(a) !== c(b)) bad.push(p + '：' + h.trim() + ' の数'); }
    const facts = (t, en) => {
      const s = new Set();
      for (const r of refs(bare(t), en)) s.add(r.kind === 'article' ? r.law + ' ' + r.article : r.section);
      for (const d of bare(t).match(/\d{4}-\d{2}-\d{2}/g) || []) s.add(d);
      for (const x of N.fixed) if (new RegExp(en ? x.en : x.re).test(bare(t))) s.add(x.check);
      return [...s].sort().join(',');
    };
    if (facts(a, false) !== facts(b, true)) bad.push(p + '：数と条が英語の頁と違う（' + facts(a, false) + ' / ' + facts(b, true) + '）');
    const links = (t) => [...t.matchAll(/https:\/\/github\.com\/[^\s)"]+/g)].map((m) => { const g = ghTarget(m[0]); return g ? g.repo + ':' + g.path.replace(/\.(ja|en)\.md$/, '.md').replace(/-ja\.yml$/, '.yml').replace(/README\.md$/, 'README').replace(/DISCLAIMER\.md$/, 'DISCLAIMER') : m[0]; });
    const la = new Set(links(a)), lb = new Set(links(b));
    const only = [...la].filter((x) => !lb.has(x)).concat([...lb].filter((x) => !la.has(x)));
    if (only.length) bad.push(p + '：日英で指す先が違う（' + only.slice(0, 3).join(', ') + '）');
  }
  for (const q of PAGES(F).filter(isEn)) if (!F.has(q.replace(/\.en\.md$/, '.md'))) bad.push(q + ' に日本語の頁が無い');
  return bad;
});

check('書き方：ですます、二人称を使わない、太字を使わない、ダッシュは段落に一つまで、長い文を置かない', (F) => {
  const bad = [];
  const ENDS = /(です|ます|ません|でした|ました)$/;
  const jaLines = (f) => {
    if (FORMS.includes(f)) {
      const t = F.get(f), out = [];
      let inValue = false;
      for (const l of t.split('\n')) {
        if (/value: \|/.test(l)) { inValue = true; continue; }
        if (inValue && /^ {8}\S/.test(l)) out.push(l.trim()); else if (inValue && !/^ {8}/.test(l)) inValue = false;
      }
      return out.filter((l) => /[ぁ-ん]/.test(l) && !/[A-Za-z]{4,} [a-z]{3,}/.test(l.replace(/https?:\/\/\S+/g, '')));
    }
    let inCode = false;
    return F.get(f).split('\n').filter((l) => { if (/^```/.test(l)) { inCode = !inCode; return false; } return !inCode && l.trim() && !/^(#|\||>|- |\* |\d+\. )/.test(l); });
  };
  for (const f of PROSE(F).concat(FORMS)) {
    const raw = F.get(f) || '';
    const plain = bare(FORMS.includes(f) ? formText(raw) : raw);
    if (/\*\*/.test(plain)) bad.push(f + '：太字');
    if (/あなた|ください|下さい/.test(plain)) bad.push(f + '：二人称か指図');
    if ((isEn(f) || FORMS.includes(f)) && /\b(?:you|your|yours|yourself)\b/i.test(plain)) bad.push(f + '：you');
    for (const para of raw.split(/\n\s*\n/)) if ((bare(para).match(/[—―–]/g) || []).length > 1) bad.push(f + '：ダッシュが一つの段落に二つ以上');
    if (isEn(f)) {
      for (const l of plain.split('\n')) for (const s of l.split(/(?<=\.)\s+/)) if (s.length > 200 && !/^\|/.test(l)) bad.push(f + '：長い文 ' + s.slice(0, 30));
      continue;
    }
    for (const l of jaLines(f)) {
      const b = bare(l).replace(/https?:\/\/\S+/g, '').trim();
      if (/^(最終更新：|\[English\]|\[日本語\])/.test(b)) continue;
      if (!b.includes('。')) continue;
      const parts = b.split('。');
      if (parts[parts.length - 1].trim() !== '') bad.push(f + '：。の後に文が残る「' + parts[parts.length - 1].slice(0, 16) + '」');
      for (const s of parts.slice(0, -1)) {
        const x = s.replace(/[（(][^（）()]*[）)]$/, '').replace(/[」』]$/, '').trim();
        if (!ENDS.test(x)) bad.push(f + '：ですます調でない「…' + x.slice(-14) + '」');
        if (x.length > 110) bad.push(f + '：長い文「' + x.slice(0, 16) + '…」（' + x.length + ' 字）');
      }
    }
  }
  return bad;
});

check('ワークフローの外のアクションはコミットの値で固め、権限と時間の上限を書き、見張りは書く権限を一つの仕事にだけ持ち、Dependabot が同じ形で上げる', (F) => {
  const bad = [];
  const wf = [...F.keys()].filter((f) => /^\.github\/workflows\/.+\.yml$/.test(f));
  if (wf.length === 0) bad.push('ワークフローが無い');
  for (const f of wf) {
    const t = F.get(f);
    for (const m of t.matchAll(/uses:\s*(\S+)(.*)$/gm)) if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1]) || !/# v\d/.test(m[2])) bad.push(f + '：' + m[1]);
    if (!/^permissions:/m.test(t)) bad.push(f + '：権限');
    const jobs = (t.match(/^ {2}[\w-]+:\n {4}(?:if|name|runs-on)/gm) || []).length;
    if ((t.match(/timeout-minutes: \d+/g) || []).length < jobs) bad.push(f + '：時間の上限');
  }
  const W = F.get('.github/workflows/statutes.yml') || '';
  if (!/^permissions:\n {2}contents: read\n/m.test(W)) bad.push('statutes.yml：全体の権限が読むだけでない');
  if ((W.match(/issues: write/g) || []).length !== 1) bad.push('statutes.yml：issues: write が一つの仕事だけでない');
  if (/contents: write|pull-requests: write/.test(W)) bad.push('statutes.yml：書く権限が広い');
  const cron = /cron: '\d+ \d+ \* \* (\d)'/.exec(W);
  if (!cron || cron[1] !== '3') bad.push('statutes.yml：水曜でない（月・火・木はほかのリポジトリが使う）');
  if (!/concurrency:/.test(W)) bad.push('statutes.yml：concurrency');
  if (!/if: github\.event_name == 'pull_request'/.test(W)) bad.push('statutes.yml：PR で比べるだけの仕事が無い');
  const D = F.get('.github/dependabot.yml') || '';
  if (!/package-ecosystem: github-actions/.test(D)) bad.push('Dependabot');
  if (/してください|利用者が/.test(D)) bad.push('Dependabot の注釈が利用者に作業を振る');
  if (F.has('package.json')) bad.push('package.json がある');
  return bad;
});

check('CLAUDE.md が、決めごと 16・17・18 に当たる文を持つ', (F) => {
  const t = F.get('CLAUDE.md') || '';
  const want = ['**Claude は利用者に命令しない。** Claude には、利用者に作業を割り当てる権限が無い。',
    '**issue の中身を言語モデルに渡すのは、本人の同意がある題と本文だけにする。**',
    '`list_issues` で一覧を取らない（本文も返る）。コメントは読まない。メールの中身は扱わない。',
    '**合っているかを、最低 10 回確かめる。** 報告・返答・コミット・PR・マージの前に、',
    '(9) 他の言語版・写し・生成元と突き合わせる (10) 結論を渡さずに別の担当に確かめさせる。',
    '確かめた回数とやり方は、報告に一行で書く。2026-11-18 に利用者が 3 回と決め、2026-11-19 に 10 回へ引き上げた。'];
  return want.filter((s) => !t.includes(s)).map((s) => s.slice(0, 24));
});

/* ------------------------------------------------------------ 壊し方 */

const BREAKS = [];
const brk = (name, desc, mut) => BREAKS.push({ name, desc, mut });
const sub = (f, a, b) => (F) => { const t = F.get(f); if (t === undefined || !t.includes(a)) throw new Error('壊し方が当たらない：' + f + ' ' + String(a).slice(0, 30)); F.set(f, t.replace(a, b)); };
const add = (f, s) => (F) => F.set(f, (F.get(f) || '') + s);

const C = (i) => CHECKS[i].name;
brk(C(0), '写しの正本の文を一字変える', sub('SECURITY.md', '7 日以内', '8 日以内'));
brk(C(0), 'empty-issue.yml を一字変える', sub('.github/workflows/empty-issue.yml', 'waits 10 minutes', 'waits ten minutes'));
brk(C(0), '写しを一つ外す', (F) => { const j = JSON.parse(F.get('verification/copies.json')); delete j['写し']['.github/workflows/empty-issue.yml']; F.set('verification/copies.json', JSON.stringify(j)); });
brk(C(1), '同意の欄の英語の文を一語変える', sub(FORMS[0], 'I consent to the operator giving the title', 'I agree to the operator giving the title'));
brk(C(1), '求めの同意の欄を必須にする', sub(FORMS[0], 'United States).\n          required: false', 'United States).\n          required: true'));
brk(C(1), '申し出の様式から第28条を外す', (F) => F.set(FORMS[1], F.get(FORMS[1]).split('個人情報保護法第28条').join('個人情報保護法')));
brk(C(1), 'privacy.md から同意の文の引用を外す', sub('pages/privacy.md', '「I consent', '「We consent'));
brk(C(1), '第28条第2項の情報の節の名を変える', sub('pages/privacy.en.md', '## Information on the third party in a foreign country', '## The third party'));
brk(C(2), '求めの様式から利用目的を外す', sub(FORMS[0], 'にだけ使います。', 'に使います。'));
brk(C(2), '申し出の様式からメールの道を外す', sub(FORMS[1], '公開の場で申し出たくないときは、運営者の ORCID の記録にあるメールアドレスで申し出ることができます。', ''));
brk(C(2), '求めの様式に、プロフィールに連絡先を出させる道を足す', sub(FORMS[0], 'この issue は公開されます。', 'この issue は公開されます。非公開の答えは、GitHub のプロフィールに公開した連絡先へ送ります。'));
brk(C(2), '求めの様式から Sophaxis の削除の様式を外す', (F) => F.set(FORMS[0], F.get(FORMS[0]).split('template=removal.yml').join('template=remove.yml')));
brk(C(2), '白紙の issue を開けるようにする', sub('.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled: false', 'blank_issues_enabled: true'));
brk(C(3), 'labels.yml から「諮問」を外す', sub('.github/workflows/labels.yml', 'gh label create "諮問"', 'gh label create "諮問委員"'));
brk(C(4), 'README にメールアドレスを書く', add('README.md', '\nexample' + '@' + 'example.org\n'));
brk(C(5), 'README に大学の名を書く', add('README.md', '\n' + dec('WkVO') + dec('5aSn5a2m') + '\n'));
brk(C(5), '頁に肩書きを書く', add('pages/advisory.md', '\n独立研究者\n'));
brk(C(6), '免責の頁に別の場の名を書く', add('pages/disclaimer.md', '\n' + OTHER_PLACE[2] + '\n'));
brk(C(6), '英語の頁に別の場の名を小文字で書く', add('pages/index.en.md', '\n' + OTHER_PLACE[0].toLowerCase() + '\n'));
brk(C(6), '索引の外のリポジトリを指す', add('pages/index.md', '\n[頁](https://github.com/cpsbvbng26-dotcom/' + OTHER_PLACE[0].toLowerCase().slice(0, 3) + 'x/blob/main/README.md)があります。\n'));
brk(C(7), '写した条文を一字変える', sub('verification/statutes-texts.json', '年齢十八歳をもって', '年齢二十歳をもって'));
brk(C(7), '法令の番号を壊す', sub('verification/statutes.json', '"law_id": "322AC0000000049"', '"law_id": "322AC000000049"'));
brk(C(7), '正本の条文の写しを一字変える', sub('verification/canonical-statutes.json', '第七百九条 故意又は過失によって', '第七百九条 故意又は重過失によって'));
brk(C(7), '正本の規約の見張らない理由を消す', (F) => { const j = JSON.parse(F.get('verification/canonical-statutes.json')); const k = Object.keys(j['規約']).find((x) => j['規約'][x]['見張り'] !== 'github'); delete j['規約'][k]['見張らない理由']; F.set('verification/canonical-statutes.json', JSON.stringify(j)); });
brk(C(8), '引用を一字変える', sub('pages/law.md', '「年齢十八歳をもって、成年とする。」', '「年齢二十歳をもって、成年とする。」'));
brk(C(8), '英語の頁の引用を別の条に付ける', sub('pages/law.en.md', 'Article 33(1) provides that the person 「電磁的記録', 'Article 34(1) provides that the person 「電磁的記録'));
brk(C(8), '記した条の一つを引かなくする', (F) => F.set('pages/law.md', F.get('pages/law.md').split('\n').filter((l) => !l.startsWith('労働基準法第11条')).join('\n')));
brk(C(8), '規約の句を変える', sub('pages/law.md', '「You must be age 13 or older.」', '「You must be age 16 or older.」'));
brk(C(8), '取り寄せた日を変える', sub('pages/law.en.md', 'on 2026-11-19.', 'on 2026-11-18.'));
brk(C(9), '記していない条を挙げる', add('pages/requests.md', '\n民法第709条に従います。\n'));
brk(C(9), '英語の頁に記していない条を挙げる', add('pages/privacy.en.md', '\nArticle 29 of the Act on the Protection of Personal Information applies.\n'));
brk(C(10), '台帳に無い数を書く', add('pages/advisory.md', '\n委員は 5 人までです。\n'));
brk(C(10), '漢字の数を書く', add('pages/index.md', '\n索引は三つの部分からなります。\n'));
brk(C(10), '台帳に無い日を書く', add('README.en.md', '\nSet up on 2026-11-20.\n'));
brk(C(10), '年齢の線を一つの頁で変える', (F) => F.set('pages/law.md', F.get('pages/law.md').split('16 歳').join('15 歳')));
brk(C(10), 'ORCID iD の数字を一つ変える', sub('verification/numbers.json', '"re": "0009-0000-1406-0547"', '"re": "0009-0000-1406-0548"'));
brk(C(10), '記録の回数を決めごとと変える', sub('CLAUDE.md', '**合っているかを、最低 10 回確かめる。**', '**合っているかを、最低 3 回確かめる。**'));
brk(C(10), '十の数を変える', (F) => { const j = JSON.parse(F.get('verification/scope.json')); j['十'].pop(); F.set('verification/scope.json', JSON.stringify(j)); });
brk(C(11), '連絡先の公開を求めない約束を弱める', sub('pages/requests.md', '運営者は、求めた人に、自分の連絡先を公開することを求めません。', '運営者は、求めた人に、なるべく自分の連絡先を公開することを求めません。'));
brk(C(11), '助言が雇用でない約束を外す', sub('pages/advisory.en.md', '- Advice is not employment. The operator makes no employment contract with an adviser.', '- Advice may be employment.'));
brk(C(11), '約束を固めていない頁を足す', (F) => { F.set('pages/extra.md', '# 足した頁\n'); F.set('pages/extra.en.md', '# Extra\n'); });
brk(C(12), '頁へのリンクを壊す', sub('README.md', '(./pages/privacy.md)', '(./pages/private.md)'));
brk(C(12), 'このリポジトリの様式の名を壊す', sub('pages/advisory.md', 'template=advisory.yml', 'template=adviser.yml'));
brk(C(12), 'このリポジトリの節の名を壊す', sub('pages/privacy.md', '[法令の整理](./law.md)の「GitHub の利用規約」', '[法令の整理](./law.md)の「GitHub の規約」'));
brk(C(12), '照らせない引用を足す', add('pages/advisory.md', '\n委員は「よく考えます」と言いました。\n'));
brk(C(12), '英語の頁に照らせない引用を足す', add('pages/requests.en.md', '\nThe operator says "requests are welcome".\n'));
brk(C(12), '求めの種類を一つ様式から外す', sub(FORMS[0], '        - 言語モデルに渡すことへの同意の撤回 / Withdrawal of consent to giving an issue to a language model\n', ''));
brk(C(12), '求めの様式のリポジトリを一つ外す', sub(FORMS[0], '        - golden-window-resolution\n', ''));
brk(C(12), '申し出の分野を変える', sub(FORMS[1], '- 論理学 / Logic', '- 統計学 / Statistics'));
brk(C(12), '索引の表から一つのリポジトリを外す', (F) => F.set('pages/index.en.md', F.get('pages/index.en.md').split('\n').filter((l) => !l.startsWith('| naval-gazette-notes |')).join('\n')));
brk(C(12), 'main でない枝を指す', add('pages/index.md', '\n[頁](https://github.com/cpsbvbng26-dotcom/sophaxis/blob/dev/README.md)があります。\n'));
brk(C(13), '英語の頁の最終更新の日をずらす', sub('pages/advisory.en.md', 'Last updated: 2026-11-19.', 'Last updated: 2026-11-18.'));
brk(C(13), '英語の頁から節を一つ消す', sub('pages/disclaimer.en.md', '## Liability', 'Liability'));
brk(C(13), '英語の頁から条を一つ消す', (F) => F.set('pages/privacy.en.md', F.get('pages/privacy.en.md').split('Article 28').join('the article')));
brk(C(13), '英語の頁だけ別の頁を指す', (F) => F.set('pages/requests.en.md', F.get('pages/requests.en.md').split('policies/withdrawal.md').join('policies/moderation.md')));
brk(C(14), 'である調の文を足す', add('pages/requests.md', '\n運営者は、すべての求めを読む。\n'));
brk(C(14), '指図の文を足す', add('pages/advisory.md', '\nメールで申し出てください。\n'));
brk(C(14), '英語の頁に you を足す', add('pages/advisory.en.md', '\nYou may stop at any time.\n'));
brk(C(14), '太字を足す', sub('pages/disclaimer.md', 'Claude は著者ではありません。', '**Claude は著者ではありません。**'));
brk(C(14), '一つの段落にダッシュを二つ置く', add('pages/index.md', '\n索引は ― 案内 ― です。\n'));
brk(C(15), 'アクションを版の名で呼ぶ', sub('.github/workflows/check.yml', 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1', 'actions/checkout@v7'));
brk(C(15), 'ワークフローから権限を外す', sub('.github/workflows/remote.yml', '\npermissions:\n  contents: read\n\njobs:', '\njobs:'));
brk(C(15), '見張りの曜日を木曜にする', (F) => F.set('.github/workflows/statutes.yml', F.get('.github/workflows/statutes.yml').replace(/(cron: '\d+ \d+ \* \* )3'/, "$14'")));
brk(C(15), '見張りの PR の仕事に issues: write を足す', sub('.github/workflows/statutes.yml', '    permissions:\n      contents: read\n    steps:', '    permissions:\n      contents: read\n      issues: write\n    steps:'));
brk(C(15), 'package.json を置く', (F) => F.set('package.json', '{}'));
brk(C(16), 'CLAUDE.md の決めごと 18 を 3 回に戻す', sub('CLAUDE.md', '**合っているかを、最低 10 回確かめる。**', '**合っているかを、最低 3 回確かめる。**'));

/* ------------------------------------------------------------ 走らせる */

function run(F) { return CHECKS.map((c) => ({ name: c.name, bad: c.fn(F) })); }

if (require.main === module) {
  const F = load();
  if (process.argv.includes('--break')) {
    let missed = 0, total = 0;
    for (const b of BREAKS) {
      total++;
      const G = new Map(F);
      let caught = false, err = null;
      try { b.mut(G); caught = CHECKS.find((c) => c.name === b.name).fn(G).length > 0; } catch (e) { err = e.message; }
      console.log((caught ? '  落ちた  ' : '  通った  ') + b.desc + (err ? ' —— ' + err : ''));
      if (!caught) missed++;
    }
    const without = CHECKS.filter((c) => !BREAKS.some((b) => b.name === c.name));
    for (const c of without) console.log('  壊し方が無い  ' + c.name);
    console.log('\n' + total + ' 通りの壊し方のうち ' + (total - missed) + ' 通りで落ちた。壊し方の無い検査は ' + without.length + ' 本。');
    process.exit(missed || without.length ? 1 : 0);
  }
  let fail = 0;
  for (const r of run(F)) {
    console.log((r.bad.length ? '  落  ' : '  通  ') + r.name);
    for (const b of r.bad) console.log('        ' + b);
    if (r.bad.length) fail++;
  }
  console.log('\n' + CHECKS.length + ' 本の検査のうち ' + (CHECKS.length - fail) + ' 本が通った。');
  process.exit(fail ? 1 : 0);
}
module.exports = { CHECKS, BREAKS, load, refs, quotes, bare, claims, norm, headings, ghTarget, sha, json, COPIES, SELF, OWNER, GH };
