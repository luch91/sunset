type ExecutionStatus = { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown };

type WalletOutcome = {
  transaction_outcome?: { id?: string; outcome?: { status?: ExecutionStatus } };
  receipts_outcome?: Array<{ outcome?: { status?: ExecutionStatus } }>;
};

export type ConfirmedTransaction = { hash: string; explorerUrl: string };

const EXPLORER_BASE = "https://testnet.nearblocks.io/txns/";

function failure(status: ExecutionStatus | undefined): string | null {
  if (status?.Failure === undefined) return null;
  return typeof status.Failure === "string" ? status.Failure : JSON.stringify(status.Failure);
}

/**
 * Wallet adapters may return a transaction identifier before the contract receipt
 * has succeeded. SUNSET accepts success only when a final execution outcome has no
 * failure and at least one final outcome reports SuccessValue.
 */
export function requireSuccessfulExecution(value: unknown): ConfirmedTransaction {
  const outcome = value as WalletOutcome;
  const hash = outcome.transaction_outcome?.id;
  if (!hash) throw new Error("The wallet did not return a transaction hash. Its outcome is unknown.");

  const statuses = [
    outcome.transaction_outcome?.outcome?.status,
    ...(outcome.receipts_outcome ?? []).map((receipt) => receipt.outcome?.status)
  ];
  const contractFailure = statuses.map(failure).find((message): message is string => Boolean(message));
  if (contractFailure) throw new Error(`Contract execution failed: ${contractFailure}`);
  if (!statuses.some((status) => status?.SuccessValue !== undefined)) {
    throw new Error("The transaction was submitted but final contract execution has not been confirmed. Check the explorer and refresh the contract state.");
  }
  return { hash, explorerUrl: `${EXPLORER_BASE}${hash}` };
}

export function classifyWalletError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Unknown transaction outcome.";
  const normalized = message.toLowerCase();
  if (normalized.includes("reject") || normalized.includes("declin") || normalized.includes("cancel")) return "Wallet authorization was rejected. No transaction was confirmed.";
  if (normalized.includes("timeout") || normalized.includes("timed out")) return "RPC timeout. The transaction outcome is unknown; check the explorer before retrying.";
  return message;
}
