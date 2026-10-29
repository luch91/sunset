import { afterEach, describe, expect, it, vi } from "vitest";
import { readInstitution } from "./rpc";

function rpcResult(value: unknown) {
  return new Response(JSON.stringify({ result: { result: [...new TextEncoder().encode(JSON.stringify(value))] } }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => vi.restoreAllMocks());

describe("NEAR RPC institution reader", () => {
  it("maps final contract views without using cached financial state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { params: { method_name: string } };
      if (request.params.method_name === "get_charter") return rpcResult({
        founder: "founder.testnet",
        name: "Garden",
        mission_summary: "Repair the garden.",
        funding_deadline_ns: "1893456000000000000",
        expires_at_ns: "1896134400000000000",
        minimum_funding: "10000000000000000000000000",
        funding_cap: "12000000000000000000000000",
        verifiers: ["v1.testnet", "v2.testnet", "v3.testnet"],
        verifier_threshold: 2,
        charter_hash: "a".repeat(64),
        code_version: "0.1.0"
      });
      if (request.params.method_name === "get_status") return rpcResult("Funding");
      if (request.params.method_name === "get_treasury") return rpcResult({
        total_received: "1000000000000000000000000",
        confirmed_milestone_spend: "0",
        pending_outbound: "0",
        confirmed_refunds: "0",
        spendable: "1000000000000000000000000",
        storage_reserve: "3000000000000000000000000"
      });
      return rpcResult([{ id: "path", title: "Repair path", beneficiary: "builder.testnet", budget: "8000000000000000000000000", deadline_ns: "1895000000000000000", acceptance_criteria: "Repair the edge." }]);
    });

    const record = await readInstitution("garden.factory.testnet");
    expect(record.status).toBe("funding");
    expect(record.treasury.totalReceived).toBe("1000000000000000000000000");
    expect(record.milestones[0].beneficiary).toBe("builder.testnet");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
