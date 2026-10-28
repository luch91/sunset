import type { Institution } from "./types";

const previewInstitution: Institution = {
  accountId: "east-garden.preview.testnet",
  name: "Repair the East Garden",
  missionSummary: "Restore two public benches and repair the worn path edge during a three-day community mission.",
  status: "active",
  nextAction: "Review submitted milestone evidence",
  founder: "garden-founder.preview.testnet",
  fundingDeadline: "2026-11-05T18:00:00Z",
  expiresAt: "2026-11-14T18:00:00Z",
  minimumFunding: "16000000000000000000000000",
  fundingCap: "20000000000000000000000000",
  verifierThreshold: 2,
  verifiers: ["north.preview.testnet", "willow.preview.testnet", "civic.preview.testnet"],
  charterHash: "preview-only-not-an-onchain-charter",
  codeVersion: "preview",
  treasury: {
    totalReceived: "18000000000000000000000000",
    confirmedMilestoneSpend: "6000000000000000000000000",
    pendingOutbound: "0",
    residual: "12000000000000000000000000",
    storageReserve: "1400000000000000000000000"
  },
  milestones: [
    {
      id: "path-edge",
      title: "Repair the path edge",
      budget: "6000000000000000000000000",
      beneficiary: "mason.preview.testnet",
      deadline: "2026-11-10T18:00:00Z",
      status: "paid",
      approvals: 2,
      verifierTotal: 3,
      acceptanceCriteria: "Damaged edge removed, reset, and documented with dated photographs."
    },
    {
      id: "benches",
      title: "Restore two benches",
      budget: "8000000000000000000000000",
      beneficiary: "joiner.preview.testnet",
      deadline: "2026-11-12T18:00:00Z",
      status: "under_review",
      approvals: 2,
      verifierTotal: 3,
      acceptanceCriteria: "Two benches repaired, sealed, and returned to their original locations."
    }
  ]
};

export function isPreviewMode(search: string): boolean {
  return new URLSearchParams(search).get("demo") === "1";
}

export function listInstitutions(preview: boolean): Institution[] {
  return preview ? [previewInstitution] : [];
}

export function getInstitution(accountId: string, preview: boolean): Institution | undefined {
  return listInstitutions(preview).find((item) => item.accountId === accountId);
}
