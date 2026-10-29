# Deployments

There is no verified SUNSET Testnet deployment recorded in this repository yet. Do not configure a public factory account or display live records until the entries below are completed with real receipts.

| Network | Factory | Institution WASM SHA-256 | Source commit | Cloudflare URL | Status |
| --- | --- | --- | --- | --- | --- |
| NEAR Testnet | `sunset.testnet` requested, existing account ownership unverified | Not recorded | `0309efa12b0625b3885cefdeddf139d733aa8a2d` baseline | `https://sunset.pages.dev` requested, not verified | Pending owner authorization |

Deployment requires approved Testnet accounts and Cloudflare credentials. These secrets must be supplied through the platform environment, never committed to the repository.

## Readiness matrix

| Role | Required Testnet identity | Required authorization |
| --- | --- | --- |
| Factory administrator | `sunset.testnet` | Authorized signer able to deploy and initialize the factory |
| Founder | Separate account | Sign `create_institution` with the charter founder value |
| Contributor A | Separate account | Attach Testnet NEAR to `contribute` |
| Contributor B | Separate account | Attach Testnet NEAR to `contribute` |
| Beneficiary | Separate account | Submit evidence and request its approved payout |
| Verifier A | Separate account | Submit one attestation |
| Verifier B | Separate account | Submit one attestation |
| Verifier C | Separate account | Submit one attestation |

All identities must be distinct where the charter requires independence. Account names other than the approved factory name must be selected by the owner after availability checks. Never submit wallet keys or recovery phrases to this repository or chat.

## Reproducible artifact preparation

Run `powershell -ExecutionPolicy Bypass -File scripts/build-contracts.ps1` from the repository. It builds the institution first, builds the factory with that institution WASM embedded, and prints SHA-256 hashes plus source commit. Record that output before any deployment.

After an owner-controlled factory deployment, set Cloudflare Pages production variables to the actual `sunset.testnet` factory account, its reviewed creation deposit, and `https://rpc.testnet.near.org`. Build command: `pnpm build`. Output directory: `dist`. SPA fallback is committed as `public/_redirects`.
