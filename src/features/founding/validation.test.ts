import { describe, expect, it } from "vitest";
import { initialDraft } from "./types";
import { toNanoseconds, toYocto, validateAll } from "./validation";

describe("Founding Studio validation", () => {
  it("converts NEAR and timestamps without floating point arithmetic", () => {
    expect(toYocto("1.25")).toBe("1250000000000000000000000");
    expect(toNanoseconds("2030-01-01T00:00")).toBe("1893456000000000000");
  });

  it("rejects role conflicts and budgets above the funding floor", () => {
    const draft = {
      ...initialDraft,
      institutionId: "garden",
      name: "Garden repair",
      missionSummary: "Repair the public garden.",
      fundingDeadline: "2030-01-01T00:00",
      expiresAt: "2030-02-01T00:00",
      minimumFundingNear: "10",
      fundingCapNear: "12",
      milestones: [{
        id: "path",
        title: "Repair path",
        beneficiary: "verifier-one.testnet",
        budgetNear: "11",
        deadline: "2030-01-20T00:00",
        acceptanceCriteria: "Path edge is repaired."
      }],
      verifiers: ["verifier-one.testnet", "verifier-two.testnet", "verifier-three.testnet"]
    };
    const errors = validateAll(draft, "founder.testnet");
    expect(errors).toContain("Milestone budgets cannot exceed the funding floor.");
    expect(errors).toContain("A milestone beneficiary cannot also be a verifier.");
  });
});
