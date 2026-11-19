# legal-and-governance

運営者のサイトとリポジトリの、法務の入口。三つを集める。(a) 各サイトの法的な枠組み・免責事項・点検の記録・条文の索引、
(b) 誤り・個人の情報・権利・削除の求めの窓口と様式、(c) 諮問委員の募集。2026-11-19 に利用者が求めた。
サイトは持たない。頁は GitHub が描く Markdown だけ。依存は無い。Node.js 22。
研究の側のリポジトリである。索引に入れるのは、研究の系列の 10 のリポジトリと、Sophaxis・deposit-check・
research-collaboration・golden-window-resolution と、このリポジトリだけ。並びは `verification/scope.json` にある。

## 決めごと

1. **新しい手続きを作らない**。求めは、すでにある手続き（cpsbvbng26-dotcom の `DISCLAIMER.md` の「人についての記載」
   「情報の扱い」、Sophaxis の削除・撤回・著作権の規程、research-collaboration の求めの頁、正誤表と self-correction）へ
   案内するだけ。要点を書くときは、元の文を「」で引く。引いた句は `verification/check_remote.js` が各リポジトリの main の
   文と照らす。要点と元の文が食い違えば、元の文が正。
2. **新しい連絡先を作らない。メールアドレスを書かない**。公開の場で書けない求めは、免責事項と同じく、運営者の ORCID の
   記録にあるメールアドレスで受ける（アドレスそのものは書かない）。**求めた人に連絡先の公開を求める道を作らない**
   （2026-11-19 の法令の点検の 4 番が research-collaboration に見つけた欠け）。
3. **条文は、e-Gov 法令 API から取り寄せた文だけを引く**。法令の番号を記憶から書かない。取り寄せは
   `node tools/statutes.js --record`。引いた句は `verification/check.js` が取り寄せた文と一字ずつ照らす。
   結論を出していないところは、出していないと書く。
4. **正本の写しは、ここでは直さない**。`SECURITY.md`・`.github/ISSUE_TEMPLATE/error-report.yml`・
   `.github/checked-intake/verify.js`・`.github/workflows/checked-intake.yml`・`.github/workflows/empty-issue.yml` は
   cpsbvbng26-dotcom の正本の一字一句同じ写し。sha256 は `verification/copies.json` にあり、`check.js` が写しを、
   `check_remote.js` が正本そのものを照らす。正本を直して写す。
5. **運営者のほかの創作の場の名を書かない。リンクもしない。所属も大学の名も書かない。自称の肩書きを書かない**。
   使わない語は `verification/check.js` の表に符号にして置いてある。書き写せば、この文書自身が検査に掛かる。
6. **諮問委員の「加われる人」と「利益相反」は、Sophaxis の募集と一字一句同じ並びにする**。`check_remote.js` が
   Sophaxis の main の並びと照らす。Sophaxis の頁は、ここから変えない。ほかのサイトへの助言は、報酬なし・任意・
   雇用ではない・助言は何も決めない・利害の申告、の範囲で受ける。これらの約束の文は `verification/promises.json` が固めている。
7. **年齢と未成年は、ほかのリポジトリの線をそのまま使う**（research-collaboration の協力の条件：16 歳未満は受けない、
   18 歳未満は親または保護者の同意）。新しい線を作らない。
8. **Claude を著者にしない。言語モデル利用の開示は消さない**。
9. 文は CC BY 4.0、コードは MIT。勝手に変えない。
10. **散文に数を書いたら、`verification/numbers.json` に載せる**。載っていない数があれば検査が落ちる。漢字の数も同じ。
11. **検査の期待値を、通すために変えない**。落ちたら中身を直す。検査を足したら、`--break` の壊し方も足す。
    壊し方の無い検査があれば、`--break` が落ちる。`check_remote.js` も同じ。
12. 日本語の頁と英語の頁は同じ日に直す。最終更新の日付と節の数がずれると検査が落ちる。
13. 外のパッケージを足さない。`package.json` を置かない。ワークフローの外のアクションはコミットの値で固め、版を注釈に書く。
14. 枝を切って PR にする。コミットは種別ごとに分ける。マージには開示の二行を本文に入れる。
15. **条文の見張り**。`statutes.yml` が水曜に、ここで引く条文と、cpsbvbng26-dotcom の `verification/statutes.json` の
    条文と GitHub にある規約を取り寄せ直して比べる。cpsbvbng26-dotcom の分は `verification/canonical-statutes.json` に
    写しを持ち、正本の main を読むだけで照らす。違えば、このリポジトリに issue を一つ開く。ほかのリポジトリには書かない。
    ほかの創作の場の条文は見張らない。Sophaxis の見張りの代わりはしない。
16. **Claude は利用者に命令しない。** Claude には、利用者に作業を割り当てる権限が無い。
    返答・報告・PR・文書のどこにも、利用者がやることの一覧を書かない。「〜してください」
    「利用者の手作業」「利用者が確かめる」「needs the owner」の形で、利用者の仕事を作らない。
    後から足さない。決めることは Claude が決め、決めたことと理由を記録に書く。結果の責任は Claude が負う。
    利用者のアカウントでしか触れないもの（Zenodo・OSF・SSRN・ORCID・Wikidata・GitHub の設定など）で
    Claude に触れられないことは、触れられないという事実だけを書き、誰にも振らない。
    利用者が自分から手順を求めたときだけ、手順を書く。2026-11-12 に利用者が決めた。
17. **issue の中身を言語モデルに渡すのは、本人の同意がある題と本文だけにする。**
    このリポジトリの様式は、どれも同意の欄を持つ。求めと諮問委員への申し出の欄は任意で、
    誤りの知らせ（`error-report.yml`）の欄は正本のとおり必須である。扱いは `pages/privacy.md` の「言語モデルに渡すこと」にある。
    issue を読むときは、`search_issues` に同意の欄の英語の文
    （"I consent to the operator giving the title and text of this issue to Claude"）を引用符で囲んで渡し、出てきた issue の
    題と本文だけを読む。本文に印の付いた同意の行（`- [X]`）が無ければ、それ以上使わない。
    `list_issues` で一覧を取らない（本文も返る）。コメントは読まない。メールの中身は扱わない。
    利用者が開いた issue は、この限りではない。
18. **合っているかを、最低 10 回確かめる。** 報告・返答・コミット・PR・マージの前に、
    事実・数・証明・引用・差分が合っているかを、少なくとも 10 回、別々のやり方で確かめる。
    同じ検査を 10 回走らせても 10 回にはならない。やり方は、次のように互いに独立したものにする。
    (1) そのリポジトリの検査を走らせる (2) 横断の検査を走らせる (3) CI の結果を見る
    (4) 元の資料と差分を読み直す (5) 一次の出典（条文・DOI の登録情報・原論文）と突き合わせる
    (6) 数を自前の台本で計算し直す (7) 壊して落ちることを確かめる (8) 全リポジトリを同じ型で検索する
    (9) 他の言語版・写し・生成元と突き合わせる (10) 結論を渡さずに別の担当に確かめさせる。
    当てはまらないやり方があれば、別の独立したやり方で 10 に満たす。
    10 回のどれかで食い違えば、直してから 1 回目から数え直す。
    確かめた回数とやり方は、報告に一行で書く。2026-11-18 に利用者が 3 回と決め、2026-11-19 に 10 回へ引き上げた。

```
node verification/check.js                          # 頁・様式・条文の引用・散文の数・書き方
node verification/check.js --break                  # 検査を一つずつ壊し、どれも落ちることを確かめる
node verification/check_remote.js                   # 索引のリンク先・節の名・引いた句・正本の写し・Sophaxis と同じ並びを、各リポジトリの main と照らす（GitHub）
node verification/check_remote.js --siblings <dir>  # 同じことを、<dir> に並べたリポジトリの origin/main で照らす
node verification/check_remote.js --break           # 同じ検査を一つずつ壊す
node tools/statutes.js                              # 条文と規約を取り寄せ直して比べる（要: laws.e-gov.go.jp と GitHub）
node tools/statutes.js --record                     # 取り寄せた文と値を記す
node .github/checked-intake/verify.js --test
```

## 書き方

散文（README、pages、docs）は、cpsbvbng26-dotcom の CLAUDE.md の「書き方」に従う。
ですます調。一文に一つ。太字は使わない。ダッシュは一つの段落に一つまで。二人称を使わない（英語の you も使わない）。
様式の文も同じ。この CLAUDE.md と、正本の写しは対象外。検査がこれを数える。
