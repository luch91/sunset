# Testnet demonstration script

1. Create Institution A with an immutable charter, three independent verifiers, and a funding floor above zero.
2. Fund it from at least two accounts, activate it, submit beneficiary evidence, obtain threshold approvals during the review window, then request a payout.
3. Open the explorer receipt and reconcile contract treasury, recipient balance, and `confirmed_milestone_spend` after the callback succeeds.
4. Reach expiry or terminal milestones, settle, claim each eligible contributor refund, and show the archive with outstanding obligations if any remain.
5. Create Institution B with the same controls but fund it below its floor. Wait until its cutoff, mark failed funding, finalize it, and claim refunds.
6. Attempt an unauthorized payout or an action after its deadline. Show the rejected Testnet transaction and the unchanged contract state.

Capture the deployed browser at desktop and mobile widths and show the linked explorer records. Do not use `?demo=1` as evidence.
