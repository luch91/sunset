# Known limitations

- SUNSET is not deployed or verified on NEAR Testnet from this checkout.
- No Cloudflare Pages preview is recorded.
- The current immutable refund policy has no chartered claim deadline or fallback recipient. Unclaimed refunds and rounding dust remain locked rather than being swept.
- The contract suite needs Testnet integration tests for account creation failure, wallet rejection, RPC timeout, and final receipt reconciliation.
- Local Playwright execution is pending because this environment could not resolve `cdn.playwright.dev` to install Chromium. CI installs Chromium before running the E2E suite.
- This project is not audited and is not mainnet-ready.
