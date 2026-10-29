# Security

SUNSET is under active development for NEAR Testnet. Testnet assets have no monetary value. The contracts have not received a formal security audit and are not ready for mainnet use.

## Reporting

Report suspected vulnerabilities privately to the repository owner before opening a public issue. Include the affected contract method, a minimal reproduction, and the expected financial invariant.

## Current trust assumptions

- Contract state is authoritative. The frontend and any future index are not.
- Institution child accounts created by the factory receive contract code and no external full-access key.
- The current factory embeds one institution WASM artifact and exposes its SHA-256 code hash.
- Factory deployment credentials and Testnet accounts are not stored in this repository.
- Contract upgrades are not implemented for child institutions.

## Known limitations

- Sandbox integration tests are not yet present.
- Milestone payouts, transfer callbacks, settlement, and refund claims are not yet implemented.
- The factory has not been deployed to NEAR Testnet.
