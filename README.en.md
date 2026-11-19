# legal-and-governance

[日本語](./README.md)

This is the legal entrance to the operator's sites and repositories.
It gathers the following.

| Entrance | Content |
| --- | --- |
| [Legal index](./pages/index.en.md) | The legal framework of each site, disclaimers, audit records and copies of statutes |
| [Requests](./pages/requests.en.md) | Where requests about errors, personal information, rights and removal are received, and the forms |
| [Advisory board](./pages/advisory.en.md) | The entrance for advisers, and the scope of advice |

This entrance creates no new procedure.
Every request is handled under a procedure that already exists.
On every matter, the text of the policy linked to governs.

## Pages of this entrance

| Page | Content |
| --- | --- |
| [Personal data](./pages/privacy.en.md) | How issues and emails to this entrance are handled, and consent to giving issues to a language model |
| [Reading of the law](./pages/law.en.md) | The articles quoted, and where no conclusion is drawn |
| [About this entrance](./pages/disclaimer.en.md) | A guide, not legal advice, no affiliation |
| [Legal review](./docs/legal-review-2026-11-19.md) (Japanese only) | The review before it was set up |

## Forms

- [Requests](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=request.yml)
- [Advisory board](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=advisory.yml)
- [Report an error](https://github.com/cpsbvbng26-dotcom/legal-and-governance/issues/new?template=error-report.yml)
- Security issues are received through the route in [SECURITY.md](./SECURITY.md).

Issues are public.
A request that contains personal information is received by email, at the address on the operator's [ORCID record](https://orcid.org/0009-0000-1406-0547), not in a public issue.

## The operator

The operator is Takuya Nemoto (根本卓哉).
The ORCID iD is [0009-0000-1406-0547](https://orcid.org/0009-0000-1406-0547).
The GitHub account is [cpsbvbng26-dotcom](https://github.com/cpsbvbng26-dotcom).

## Use of language models

The pages and code of this repository were written by Claude Code (Anthropic) at the operator's request.
Claude is not an author.
Only the title and text of an issue whose consent box is ticked are given to a language model.
Issues opened by the operator are outside this rule.

## Watch over statutes and terms

Once a week (Wednesday), `statutes.yml` fetches the statutes and terms again and compares them with the record.
It covers the articles quoted by the pages of this entrance, the GitHub Terms of Service, and the statutes and terms in `verification/statutes.json` of cpsbvbng26-dotcom.
For cpsbvbng26-dotcom, this repository holds a copy in `verification/canonical-statutes.json`, and compares it with the canonical file on main, which it only reads.
The articles are fetched from the e-Gov law API.
For terms held on GitHub, it reads the latest commit that touched the file and checks that each quoted phrase is still there.
A difference opens an issue in this repository, or updates the one already open.
Nothing is written to any other repository.
Sophaxis keeps its own watch.
Terms on pages outside GitHub are not fetched again.
The reason is given in `verification/canonical-statutes.json`.

## Checks

```
node verification/check.js
node verification/check.js --break     # breaks each check in turn and confirms that it fails
node verification/check_remote.js      # checks the links, quotations and canonical copies against the main branch of each repository (needs GitHub)
node tools/statutes.js                 # fetches the articles and terms again and compares (needs network)
```

## Licence

Text is under [CC BY 4.0](./LICENSE), code under [MIT](./LICENSE-CODE).
