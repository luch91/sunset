import type { FoundingDraft } from "./types";

const accountPattern = /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function toYocto(value: string): string {
  if (!/^\d+(?:\.\d{1,24})?$/.test(value)) throw new Error("Enter a valid NEAR amount with no more than 24 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, "0"))).toString();
}

export function toNanoseconds(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("Enter a valid UTC date and time.");
  return (BigInt(milliseconds) * 1_000_000n).toString();
}

export function validateStep(draft: FoundingDraft, step: number, founder?: string | null): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!draft.name.trim() || draft.name.length > 80) errors.push("Name must contain 1 to 80 characters.");
    if (!draft.institutionId.trim() || !/^[a-z0-9-]{2,40}$/.test(draft.institutionId)) errors.push("Institution ID must use 2 to 40 lowercase letters, numbers, or hyphens.");
    if (!draft.missionSummary.trim() || draft.missionSummary.length > 600) errors.push("Mission summary must contain 1 to 600 characters.");
  }
  if (step === 1) {
    try {
      const floor = BigInt(toYocto(draft.minimumFundingNear));
      const cap = BigInt(toYocto(draft.fundingCapNear));
      if (floor <= 0n || cap < floor) errors.push("Funding cap must be at least the positive funding floor.");
    } catch (cause) { errors.push(cause instanceof Error ? cause.message : "Funding amounts are invalid."); }
    const cutoff = Date.parse(draft.fundingDeadline);
    const expiry = Date.parse(draft.expiresAt);
    if (!Number.isFinite(cutoff) || cutoff <= Date.now()) errors.push("Funding cutoff must be in the future.");
    if (!Number.isFinite(expiry) || expiry <= cutoff) errors.push("Institution expiration must be after the funding cutoff.");
  }
  if (step === 2) {
    if (!draft.milestones.length || draft.milestones.length > 16) errors.push("Add between 1 and 16 milestones.");
    let budget = 0n;
    for (const [index, item] of draft.milestones.entries()) {
      if (!item.title.trim()) errors.push(`Milestone ${index + 1} needs a title.`);
      if (!accountPattern.test(item.beneficiary)) errors.push(`Milestone ${index + 1} needs a valid beneficiary account.`);
      if (!item.acceptanceCriteria.trim()) errors.push(`Milestone ${index + 1} needs acceptance criteria.`);
      const deadline = Date.parse(item.deadline);
      if (!Number.isFinite(deadline) || deadline > Date.parse(draft.expiresAt) || deadline <= Date.parse(draft.fundingDeadline)) errors.push(`Milestone ${index + 1} deadline must be after funding and no later than expiration.`);
      try { budget += BigInt(toYocto(item.budgetNear)); } catch { errors.push(`Milestone ${index + 1} budget is invalid.`); }
    }
    try { if (budget > BigInt(toYocto(draft.minimumFundingNear))) errors.push("Milestone budgets cannot exceed the funding floor."); } catch { errors.push("Set valid funding amounts before allocating milestone budgets."); }
  }
  if (step === 3) {
    const values = draft.verifiers.map((item) => item.trim()).filter(Boolean);
    if (values.length < 3 || values.length > 12) errors.push("Add between 3 and 12 verifier accounts.");
    if (values.some((item) => !accountPattern.test(item))) errors.push("Every verifier must be a valid NEAR account ID.");
    if (new Set(values).size !== values.length) errors.push("Verifier accounts must be distinct.");
    if (founder && values.includes(founder)) errors.push("The founder cannot be an independent verifier.");
    if (draft.verifierThreshold < 2 || draft.verifierThreshold > values.length) errors.push("Approval threshold must be at least 2 and no greater than the verifier count.");
    const beneficiaries = new Set(draft.milestones.map((item) => item.beneficiary));
    if (values.some((item) => beneficiaries.has(item))) errors.push("A milestone beneficiary cannot also be a verifier.");
  }
  return errors;
}

export function validateAll(draft: FoundingDraft, founder?: string | null): string[] {
  return [0, 1, 2, 3].flatMap((step) => validateStep(draft, step, founder));
}
