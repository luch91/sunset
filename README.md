# SUNSET

[![CI](https://github.com/luch91/sunset/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/luch91/sunset/actions/workflows/ci.yml)
[![Contracts: Rust](https://img.shields.io/badge/contracts-Rust-000000?logo=rust)](contracts/)
[![Web: React](https://img.shields.io/badge/web-React-149ECA?logo=react)](src/)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](src/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

SUNSET is a lifecycle protocol and application for finite-purpose collaborative treasuries. Founders define a public charter, capped milestone budgets, independent verifiers, a fixed expiration, and a rule for returning unspent funds.

## Product scope

- Public home page with lifecycle explanation
- Filterable institution directory
- Public institution detail with charter, treasury, milestones, verifiers, and receipt states
- Clearly isolated interface-preview mode at `?demo=1`
- Founding Studio with mission, funding, milestone, verifier, and constitution review
- NEAR Connect wallet authorization on Testnet
- Rust institution and factory contracts with immutable charter validation, capped funding, verifier thresholds, milestone review, asynchronous payout recovery, settlement, and pro-rata refunds

The factory and contracts have not been deployed from this checkout. No live contract address, transaction, Testnet badge, Cloudflare deployment badge, or demo URL is claimed until independently verified. See [deployment records](docs/DEPLOYMENTS.md), [test evidence](docs/TEST_EVIDENCE.md), and [known limitations](docs/KNOWN_LIMITATIONS.md).

## Architecture and safety

The React application reads finalized NEAR RPC data and requests wallet-signed write transactions. The factory deploys institution child accounts with a charter fixed at initialization. The contracts reserve asynchronous transfer amounts before callbacks finalize their result. See [architecture](docs/ARCHITECTURE.md) and [security notes](docs/SECURITY.md).

## Development

```sh
pnpm install
pnpm dev
```

## Verification

```sh
pnpm test
pnpm build
pnpm check:copy
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --target wasm32-unknown-unknown --release -p sunset-institution
cargo test --workspace
cargo build --target wasm32-unknown-unknown --release -p sunset-factory
```

The default interface never presents fixture transactions or balances as chain data. Preview records require `?demo=1` and carry an explicit notice on every route.

## Contract build order

The factory embeds the compiled institution WASM. Build `sunset-institution` before testing or building `sunset-factory`. The factory creates child accounts without adding an external access key.

## Deployment configuration

Set `VITE_FACTORY_ACCOUNT_ID` to the deployed NEAR Testnet factory account and `VITE_CREATION_DEPOSIT_NEAR` to the reviewed creation deposit. Without a configured factory, the Founding Studio refuses to request a transaction.

Set `VITE_NEAR_RPC_URL` only to a trusted Testnet RPC endpoint. Cloudflare Pages environment variables must contain public configuration only; wallet secrets, account keys, and deployment credentials must never be placed in Vite variables.

## Deployment and demonstration

Cloudflare Pages needs a production build command of `pnpm build` and a client-side route fallback. Do not deploy to NEAR Mainnet or promote a production release without explicit owner authorization. The repeatable two-institution scenario is in [the demo script](docs/DEMO_SCRIPT.md).
