export type MilestoneDraft = {
  id: string;
  title: string;
  beneficiary: string;
  budgetNear: string;
  deadline: string;
  acceptanceCriteria: string;
};

export type FoundingDraft = {
  institutionId: string;
  name: string;
  missionSummary: string;
  metadataUri: string;
  fundingDeadline: string;
  expiresAt: string;
  settlementGraceHours: string;
  challengeWindowHours: string;
  minimumFundingNear: string;
  fundingCapNear: string;
  milestones: MilestoneDraft[];
  verifiers: string[];
  verifierThreshold: number;
};

export const emptyMilestone = (): MilestoneDraft => ({
  id: crypto.randomUUID(),
  title: "",
  beneficiary: "",
  budgetNear: "",
  deadline: "",
  acceptanceCriteria: ""
});

export const initialDraft: FoundingDraft = {
  institutionId: "",
  name: "",
  missionSummary: "",
  metadataUri: "",
  fundingDeadline: "",
  expiresAt: "",
  settlementGraceHours: "24",
  challengeWindowHours: "24",
  minimumFundingNear: "",
  fundingCapNear: "",
  milestones: [emptyMilestone()],
  verifiers: ["", "", ""],
  verifierThreshold: 2
};
