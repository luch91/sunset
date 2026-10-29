import { describe, expect, it } from "vitest";
import { classifyWalletError, requireSuccessfulExecution } from "./transaction";

describe("requireSuccessfulExecution", () => {
  it("accepts a finalized successful contract receipt", () => {
    expect(requireSuccessfulExecution({
      transaction_outcome: { id: "abc", outcome: { status: { SuccessValue: "" } } },
      receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }]
    })).toEqual({ hash: "abc", explorerUrl: "https://testnet.nearblocks.io/txns/abc" });
  });

  it("rejects a receipt failure even when a hash exists", () => {
    expect(() => requireSuccessfulExecution({
      transaction_outcome: { id: "abc", outcome: { status: { SuccessValue: "" } } },
      receipts_outcome: [{ outcome: { status: { Failure: "ERR_NOT_AUTHORIZED" } } }]
    })).toThrow("Contract execution failed");
  });

  it("reports a timeout as an unknown outcome", () => {
    expect(classifyWalletError(new Error("RPC timed out"))).toContain("outcome is unknown");
  });
});
