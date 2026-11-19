# legal-and-governance

[English](./README.en.md)

運営者のサイトとリポジトリの、法務の入口です。
次のものを、この入口に集めています。

| 入口 | 中身 |
| --- | --- |
| [法務の索引](./pages/index.md) | 各サイトの法的な枠組み、免責事項、点検の記録、条文の写し |
| [修正と削除の求め](./pages/requests.md) | 誤り・個人の情報・権利・削除の求めの窓口と様式 |
| [諮問委員の募集](./pages/advisory.md) | 諮問委員の入口と、助言の範囲 |

この入口は、新しい手続きを作りません。
どの求めも、すでにある手続きで扱います。
どの事柄も、リンク先の規程の文が正です。

## この入口の頁

| 頁 | 中身 |
| --- | --- |
| [個人情報の取り扱い](./pages/privacy.md) | この入口の issue とメールの扱い、言語モデルに渡すことへの同意 |
| [法令の整理](./pages/law.md) | 引いた条文と、結論を出していないところ |
| [この入口の位置づけ](./pages/disclaimer.md) | 案内であること、法的な助言ではないこと、どの組織とも関わらないこと |
| [法令の点検の記録](./docs/legal-review-2026-11-19.md) | 置く前の点検 |

## 様式

- [修正と削除の求め](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=request.yml)
- [諮問委員への申し出](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=advisory.yml)
- [誤りの知らせ](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=error-report.yml)
- 安全の問題は、[SECURITY.md](./SECURITY.md) の入口で受けます。

issue は公開されます。
個人の情報を含む求めは、公開の issue ではなく、運営者の [ORCID の記録](https://orcid.org/0009-0000-1406-0547)にあるメールアドレスで受けます。

## 運営者

運営者は、根本卓哉（Takuya Nemoto）です。
ORCID iD は [0009-0000-1406-0547](https://orcid.org/0009-0000-1406-0547) です。
GitHub のアカウントは [cpsbvbng26-dotcom](https://github.com/cpsbvbng26-dotcom) です。

## 言語モデルの使い方

このリポジトリの頁とコードは、運営者が求め、Claude Code（Anthropic）が書きました。
Claude は著者ではありません。
issue を言語モデルに渡すのは、様式の同意の欄に印がある issue の題と本文だけです。
運営者が自分で開いた issue は、この限りではありません。

## 条文と規約の見張り

週に一度（水曜）、`statutes.yml` が条文と規約を取り寄せ直し、記した値と比べます。
比べるのは、この入口の頁が引く条文と GitHub の利用規約と、cpsbvbng26-dotcom の `verification/statutes.json` の条文と規約です。
cpsbvbng26-dotcom の分は、このリポジトリの `verification/canonical-statutes.json` に写しを持ち、正本の main を読むだけで照らします。
条文は e-Gov 法令 API から取り寄せます。
GitHub にある規約は、そのファイルに触れた最後のコミットと、引いた句が今もあるかを見ます。
違いがあれば、このリポジトリに issue を開くか、開いている issue を直します。
ほかのリポジトリには書きません。
Sophaxis の見張りは、Sophaxis が自分で持っています。
GitHub の外の頁にある規約は、取り寄せ直していません。
その理由は、`verification/canonical-statutes.json` にあります。

## 検査

```
node verification/check.js
node verification/check.js --break     # 検査を一つずつ壊し、落ちることを確かめる
node verification/check_remote.js      # 索引のリンク先・引いた句・正本の写しを各リポジトリの main と照らす（要: GitHub）
node tools/statutes.js                 # 条文と規約を取り寄せ直して比べる（要: 外への接続）
```

## ライセンス

文は [CC BY 4.0](./LICENSE)、コードは [MIT](./LICENSE-CODE) です。
