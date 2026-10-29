# Architecture

SUNSET is a Vite and React application backed by two NEAR Rust contracts.

`Factory` creates an institution child account, deploys the embedded institution WASM, initializes its immutable charter, and records the child account and artifact hash. `Institution` accepts capped contributions, records reviewer decisions, reserves asynchronous payouts and refunds, and exposes a permanent closure record.

The browser reads the factory directory and institution views through NEAR Testnet RPC. Writes are signed by the connected NEAR wallet. `?demo=1` is a separate interface-preview path; it must never be treated as live contract data.

## State flow

`Funding` becomes `Active` only after the floor is met. It becomes `FundingFailed` after the cutoff when below floor, then `Archived` after failed-funding refund finalization. An active institution may enter `Settling` after all milestones are terminal or the fixed expiration arrives, then `Archived` after pending transfers resolve. Archived contracts permit only eligible refund claims.

The charter contains funding and expiry timestamps, verifier policy, milestone budgets and beneficiaries, and refund policy. There is no public charter update method.
