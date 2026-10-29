import { useState } from "react";
import type { Milestone } from "../../lib/types";
import { useWallet } from "../wallet/WalletProvider";
import { classifyWalletError, requireSuccessfulExecution } from "../../lib/near/transaction";

type Props = { contractId: string; milestone: Milestone; preview: boolean };
type State = { kind: "idle" } | { kind: "pending"; label: string } | { kind: "success"; hash: string; explorerUrl: string } | { kind: "failure"; message: string };

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MilestoneWorkspace({ contractId, milestone, preview }: Props) {
  const wallet = useWallet();
  const [evidenceDigest, setEvidenceDigest] = useState("");
  const [evidenceUri, setEvidenceUri] = useState("");
  const [challengeReason, setChallengeReason] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function call(methodName: string, args: Record<string, unknown>) {
    if (preview) {
      setState({ kind: "failure", message: "Interface-preview records cannot request transactions." });
      return;
    }
    if (!wallet.accountId) {
      await wallet.connect();
      return;
    }
    try {
      setState({ kind: "pending", label: methodName });
      const signer = await wallet.getWallet();
      const outcome = await signer.signAndSendTransaction({ network: "testnet", signerId: wallet.accountId, receiverId: contractId, actions: [{ type: "FunctionCall", params: { methodName, args, gas: "120000000000000", deposit: "0" } }] });
      const confirmed = requireSuccessfulExecution(outcome);
      setState({ kind: "success", hash: confirmed.hash, explorerUrl: confirmed.explorerUrl });
    } catch (cause) {
      setState({ kind: "failure", message: classifyWalletError(cause) });
    }
  }

  return (
    <details className="milestone-workspace">
      <summary>Open milestone workspace</summary>
      {preview && <p className="preview-action-note">Actions are disabled for interface-preview records.</p>}
      {milestone.status === "planned" && <div className="workspace-block"><h4>Submit evidence</h4><label className="form-field"><span>Content SHA-256 digest</span><input value={evidenceDigest} maxLength={64} onChange={(event) => setEvidenceDigest(event.target.value.toLowerCase())} /></label><label className="form-field"><span>Public evidence URL</span><input type="url" value={evidenceUri} onChange={(event) => setEvidenceUri(event.target.value)} /></label><button className="button primary" type="button" onClick={() => void call("submit_evidence", { milestone_id: milestone.id, digest: evidenceDigest, evidence_uri: evidenceUri })}>Submit evidence on Testnet</button></div>}
      {(milestone.status === "under_review" || milestone.status === "disputed") && <div className="workspace-block"><h4>Verifier decision</h4><div className="funding-buttons"><button className="button primary" type="button" onClick={() => void call("attest", { milestone_id: milestone.id, decision: "Approve" })}>Approve evidence</button><button className="button secondary" type="button" onClick={() => void call("attest", { milestone_id: milestone.id, decision: "Reject" })}>Reject evidence</button><button className="button secondary" type="button" onClick={() => void call("finalize_review", { milestone_id: milestone.id })}>Finalize elapsed review</button></div></div>}
      {milestone.status === "under_review" && <div className="workspace-block"><h4>Contributor challenge</h4><label className="form-field"><span>Reason for the public decision trail</span><textarea rows={3} value={challengeReason} onChange={(event) => setChallengeReason(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => void digest(challengeReason).then((reasonHash) => call("challenge", { milestone_id: milestone.id, evidence_digest: milestone.evidenceDigest, reason_hash: reasonHash }))}>Raise challenge</button></div>}
      {(milestone.status === "payout_ready" || milestone.status === "retryable") && <div className="workspace-block"><h4>Beneficiary payout</h4><button className="button primary" type="button" onClick={() => void call("request_payout", { milestone_id: milestone.id })}>{milestone.status === "retryable" ? "Retry payout" : "Request approved payout"}</button></div>}
      {state.kind === "pending" && <div className="transaction-state pending" role="status">The `{state.label}` transaction is processing on NEAR Testnet.</div>}
      {state.kind === "failure" && <div className="transaction-state failure" role="alert">{state.message}</div>}
      {state.kind === "success" && <div className="transaction-state success" role="status">Transaction confirmed: <a href={state.explorerUrl} target="_blank" rel="noreferrer">view {state.hash} in the Testnet explorer</a></div>}
    </details>
  );
}
