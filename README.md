# SUNSET

SUNSET is a lifecycle protocol and application for finite-purpose collaborative treasuries. This repository currently contains Journey A, the public discovery experience.

## Current scope

- Public home page with lifecycle explanation
- Filterable institution directory
- Public institution detail with charter, treasury, milestones, verifiers, and receipt states
- Clearly isolated interface-preview mode at `?demo=1`
- No wallet or contract-write behavior yet

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
```

The default interface never presents fixture transactions or balances as chain data. Preview records require `?demo=1` and carry an explicit notice on every route.
