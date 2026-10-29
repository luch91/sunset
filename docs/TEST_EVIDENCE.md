# Test evidence

No Testnet transactions or browser screenshots have been verified from this checkout. This document is deliberately a record template, not proof of deployment.

## Local checks recorded on 2026-10-29

- `pnpm build`: passed.
- Focused Vitest suites for discovery, founding validation, RPC mapping, and final transaction outcome handling: passed.
- `pnpm check:copy`: passed with no U+2014 character found.
- `cargo +1.98.0 fmt --all -- --check`: passed.
- Rust compilation and contract tests could not run locally because the pinned Cargo dependency `borsh 1.8.1` was not cached and this environment could not resolve `index.crates.io`.
- Playwright browser installation could not run locally because this environment could not resolve `cdn.playwright.dev`.

## Required records

| Scenario | Contract / account | Transaction | Explorer URL | Result | Balance reconciliation |
| --- | --- | --- | --- | --- | --- |
| Successful mission: creation | Pending | Pending | Pending | Pending | Pending |
| Successful mission: funding and activation | Pending | Pending | Pending | Pending | Pending |
| Successful mission: review and payout | Pending | Pending | Pending | Pending | Pending |
| Successful mission: settlement and refunds | Pending | Pending | Pending | Pending | Pending |
| Failed mission: creation and underfunding | Pending | Pending | Pending | Pending | Pending |
| Failed mission: finalize and refund | Pending | Pending | Pending | Pending | Pending |
| Negative: unauthorized or expired action | Pending | Pending | Pending | Rejected by contract | N/A |
