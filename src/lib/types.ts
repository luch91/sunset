export type InstitutionStatus = "funding" | "active" | "settling" | "archived";

export type Milestone = {
  id: string;
  title: string;
  budget: string;
  beneficiary: string;
  deadline: string;
  status: "planned" | "under_review" | "disputed" | "payout_ready" | "payout_pending" | "retryable" | "paid" | "rejected" | "expired_unpaid";
  approvals: number;
  verifierTotal: number;
  acceptanceCriteria: string;
  evidenceDigest?: string;
  evidenceUri?: string;
};

export type Institution = {
  accountId: string;
  name: string;
  missionSummary: string;
  status: InstitutionStatus;
  nextAction: string;
  founder: string;
  fundingDeadline: string;
  expiresAt: string;
  minimumFunding: string;
  fundingCap: string;
  verifierThreshold: number;
  verifiers: string[];
  charterHash: string;
  codeVersion: string;
  treasury: {
    totalReceived: string;
    confirmedMilestoneSpend: string;
    pendingOutbound: string;
    residual: string;
    storageReserve: string;
  };
  milestones: Milestone[];
};
