# Security notes

SUNSET is Testnet-only software. It has not received an external audit and is not represented as mainnet-ready.

## Immutable charter and code assumptions

The institution stores its charter in contract state and exposes no mutation method. This alone is not a complete immutability guarantee. The deployed child account must have no full-access keys after creation, and neither the factory nor a founder may retain an upgrade key. The factory creation receipt must not add an external access key. Before deployment, inspect the child account keys and record the institution WASM SHA-256 from `get_supported_code_hashes` and the factory registry.

## Financial invariants

- Every milestone budget is fixed in the charter and total budgets cannot exceed the funding floor.
- Payouts reserve `pending_outbound` before a transfer. The callback either converts that reservation to confirmed spend or releases it.
- A failed payout that resolves after expiration becomes `ExpiredUnpaid`, preventing a retry that would violate the fixed ending or strand settlement.
- Refunds reserve a claimant amount before transfer. A successful callback zeroes that contribution; a failed callback restores claimability.
- Treasury spendable balance excludes confirmed payouts, confirmed refunds, and all pending transfers. The initialization storage reserve is never counted as contributed treasury.
- Settlement cannot finalize while a transfer is pending or a milestone is nonterminal.

## Refund dust and unclaimed balances

The immutable charter currently specifies only pro-rata contributor refunds. It does not contain a claim deadline or a fallback beneficiary. Therefore SUNSET must not sweep unclaimed contributor funds to a founder, factory, or any discretionary recipient. Rounding dust and amounts that remain unclaimed stay locked in the archived institution and are disclosed as outstanding obligations. A future protocol version may add a sweep only when the destination and deadline are included in the founding charter before funding begins.

## Deployment checks

1. Build the institution WASM, hash it, then build the factory with that exact artifact embedded.
2. Confirm factory initialization is one-time and its deployed code hash matches the release artifact.
3. Create a disposable Testnet institution and inspect its access keys. No external full-access key is acceptable.
4. Exercise a failed creation and reconcile the factory balance, child account state, and returned deposit before accepting real users.
5. Record every scenario transaction in `docs/TEST_EVIDENCE.md`.

## Open risks

- Factory creation recovery has not yet been verified on Testnet with a deliberately failing child initialization.
- No Testnet account, contract address, or deployment receipt has been supplied to this checkout.
- Browser-level wallet and RPC outcome verification remains required before a submission claim.
