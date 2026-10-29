import type { Institution, InstitutionStatus } from "../types";

const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL ?? "https://rpc.testnet.near.org";

type ChainCharter = {
  founder: string;
  name: string;
  mission_summary: string;
  funding_deadline_ns: string;
  expires_at_ns: string;
  minimum_funding: string;
  funding_cap: string;
  verifiers: string[];
  verifier_threshold: number;
  charter_hash: string;
  code_version: string;
};

type ChainTreasury = {
  total_received: string;
  confirmed_milestone_spend: string;
  pending_outbound: string;
  confirmed_refunds: string;
  spendable: string;
  storage_reserve: string;
};

type ChainMilestone = {
  id: string;
  title: string;
  beneficiary: string;
  budget: string;
  deadline_ns: string;
  acceptance_criteria: string;
};

function nsToIso(value: string): string {
  return new Date(Number(BigInt(value) / 1_000_000n)).toISOString();
}

function mapStatus(value: string): InstitutionStatus {
  const status = value.toLowerCase().replaceAll("_", "");
  if (status === "funding") return "funding";
  if (status === "active") return "active";
  if (status === "settling") return "settling";
  if (status === "archived" || status === "fundingfailed") return "archived";
  throw new Error(`Unsupported institution status: ${value}`);
}

async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const encodedArgs = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(args))));
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `sunset-${method}`,
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contractId, method_name: method, args_base64: encodedArgs }
    })
  });
  if (!response.ok) throw new Error(`NEAR RPC returned HTTP ${response.status}.`);
  const payload = await response.json() as { result?: { result?: number[] }; error?: { message?: string; data?: string } };
  if (payload.error) throw new Error(payload.error.data || payload.error.message || `Contract view ${method} failed.`);
  if (!payload.result?.result) throw new Error(`Contract view ${method} returned no data.`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(payload.result.result))) as T;
}

export async function readInstitution(contractId: string): Promise<Institution> {
  const [charter, statusValue, treasury, milestones] = await Promise.all([
    view<ChainCharter>(contractId, "get_charter"),
    view<string>(contractId, "get_status"),
    view<ChainTreasury>(contractId, "get_treasury"),
    view<ChainMilestone[]>(contractId, "get_milestones")
  ]);
  const status = mapStatus(statusValue);
  return {
    accountId: contractId,
    name: charter.name,
    missionSummary: charter.mission_summary,
    status,
    nextAction: status === "funding" ? "Contribute or activate when the floor is met" : status === "active" ? "Review milestone work" : status === "settling" ? "Resolve settlement obligations" : "Review the permanent record",
    founder: charter.founder,
    fundingDeadline: nsToIso(charter.funding_deadline_ns),
    expiresAt: nsToIso(charter.expires_at_ns),
    minimumFunding: charter.minimum_funding,
    fundingCap: charter.funding_cap,
    verifierThreshold: charter.verifier_threshold,
    verifiers: charter.verifiers,
    charterHash: charter.charter_hash,
    codeVersion: charter.code_version,
    treasury: {
      totalReceived: treasury.total_received,
      confirmedMilestoneSpend: treasury.confirmed_milestone_spend,
      pendingOutbound: treasury.pending_outbound,
      residual: treasury.spendable,
      storageReserve: treasury.storage_reserve
    },
    milestones: milestones.map((item) => ({
      id: item.id,
      title: item.title,
      beneficiary: item.beneficiary,
      budget: item.budget,
      deadline: nsToIso(item.deadline_ns),
      status: "planned",
      approvals: 0,
      verifierTotal: charter.verifiers.length,
      acceptanceCriteria: item.acceptance_criteria
    }))
  };
}

export async function readDirectory(): Promise<Institution[]> {
  const factory = import.meta.env.VITE_FACTORY_ACCOUNT_ID as string | undefined;
  if (!factory) return [];
  const records = await view<Array<{ account_id: string }>>(factory, "list_institutions", { from_index: 0, limit: 50 });
  const results = await Promise.allSettled(records.map((record) => readInstitution(record.account_id)));
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}
