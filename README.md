# SUNSET

[![Contracts: Rust](https://img.shields.io/badge/contracts-Rust-000000?logo=rust)](contracts/)
[![Web: React](https://img.shields.io/badge/web-React-149ECA?logo=react)](src/)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)](src/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

SUNSET is a lifecycle protocol and application for finite-purpose collaborative treasuries. Founders define a public charter, capped milestone budgets, independent verifiers, a fixed expiration, and a rule for returning unspent funds.

## Current scope

- Public home page with lifecycle explanation
- Filterable institution directory
- Public institution detail with charter, treasury, milestones, verifiers, and receipt states
- Clearly isolated interface-preview mode at `?demo=1`
- Founding Studio with mission, funding, milestone, verifier, and constitution review
- NEAR Connect wallet authorization on Testnet
- Rust institution and factory contracts with immutable charter validation

The factory and contracts have not been deployed. No live contract address or transaction is claimed here.

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
cargo build --target wasm32-unknown-unknown --release -p sunset-institution
cargo test --workspace
cargo build --target wasm32-unknown-unknown --release -p sunset-factory
```

The default interface never presents fixture transactions or balances as chain data. Preview records require `?demo=1` and carry an explicit notice on every route.

## Contract build order

The factory embeds the compiled institution WASM. Build `sunset-institution` before testing or building `sunset-factory`. The factory creates child accounts without adding an external access key.

## Deployment configuration

Set `VITE_FACTORY_ACCOUNT_ID` to the deployed NEAR Testnet factory account and `VITE_CREATION_DEPOSIT_NEAR` to the reviewed creation deposit. Without a configured factory, the Founding Studio refuses to request a transaction.
