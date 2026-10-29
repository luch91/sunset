import { useState } from "react";
import { formatNear } from "../../lib/format";
import type { InstitutionStatus } from "../../lib/types";
import { toYocto } from "../founding/validation";
import { useWallet } from "../wallet/WalletProvider";

type FundingPanelProps = {
  contractId: string;
  status: InstitutionStatus;
  totalReceived: string;
  fundingFloor: string;
  fundingCap: string;
  fundingDeadline: string;
  expiresAt: string;
  preview: boolean;
};

type CallState =
  | { kind: "idle" }
  | { kind: "awaiting_signature"; method: string }
  | { kind: "pending"; method: string }
  | { kind: "success"; method: string; transactionHash: string }
  | { kind: "failure"; message: string };

export function FundingPanel(props: FundingPanelProps) {
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [call, setCall] = useState<CallState>({ kind: "idle" });
  const received = BigInt(props.totalReceived);
  const floor = BigInt(props.fundingFloor);
  const cap = BigInt(props.fundingCap);
  const percent = cap > 0n ? Number((received * 10_000n) / cap) / 100 : 0;
  const canFund = props.status === "funding" && Date.now() < Date.parse(props.fundingDeadline);
  const canActivate = props.status === "funding" && received >= floor;
  const canBeginSettlement = props.status === "active" && Date.now() >= Date.parse(props.expiresAt);

  async function callContract(methodName: string, deposit = "0") {
    if (props.preview) {
      setCall({ kind: "failure", message: "Interface-preview records cannot request transactions." });
      return;
    }
    if (!wallet.accountId) {
      await wallet.connect();
      return;
    }
    try {
      setCall({ kind: "awaiting_signature", method: methodName });
      const signer = await wallet.getWallet();
      setCall({ kind: "pending", method: methodName });
      const outcome = await signer.signAndSendTransaction({
        network: "testnet",
        signerId: wallet.accountId,
        receiverId: props.contractId,
        actions: [{
          type: "FunctionCall",
          params: { methodName, args: {}, gas: "80000000000000", deposit }
        }]
      });
      setCall({ kind: "success", method: methodName, transactionHash: outcome.transaction_outcome.id });
      setAmount("");
    } catch (cause) {
      setCall({ kind: "failure", message: cause instanceof Error ? cause.message : "The Testnet transaction failed." });
    }
  }

  function contribute() {
    try {
      const deposit = toYocto(amount);
      if (BigInt(deposit) <= 0n) throw new Error("Contribution must be greater than zero.");
      if (received + BigInt(deposit) > cap) throw new Error("This contribution would exceed the funding cap.");
      void callContract("contribute", deposit);
    } catch (cause) {
      setCall({ kind: "failure", message: cause instanceof Error ? cause.message : "Enter a valid contribution." });
    }
  }

  return (
    <section className="funding-panel section-pad" aria-labelledby="funding-heading">
      <div className="funding-progress">
        <div className="section-heading-row"><div><p className="eyebrow">Public funding</p><h2 id="funding-heading">Treasury progress</h2></div><strong>{formatNear(props.totalReceived)}</strong></div>
        <div className="progress-track" role="progressbar" aria-label="Funding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)}><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
        <dl className="funding-metrics"><div><dt>Floor</dt><dd>{formatNear(props.fundingFloor)}</dd></div><div><dt>Cap</dt><dd>{formatNear(props.fundingCap)}</dd></div><div><dt>Funding closes</dt><dd><time dateTime={props.fundingDeadline}>{new Date(props.fundingDeadline).toLocaleString()}</time></dd></div></dl>
      </div>
      <div className="funding-action">
        {props.preview && <p className="preview-action-note">Interface preview only. No wallet transaction can be requested from this record.</p>}
        {canFund && <label className="form-field"><span>Contribution amount</span><div className="amount-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" /><span>NEAR</span></div></label>}
        <div className="funding-buttons">
          {canFund && <button className="button primary" type="button" disabled={call.kind === "pending" || call.kind === "awaiting_signature"} onClick={contribute}>Contribute on Testnet</button>}
          {canActivate && <button className="button secondary" type="button" disabled={call.kind === "pending" || call.kind === "awaiting_signature"} onClick={() => void callContract("activate")}>Activate institution</button>}
          {canBeginSettlement && <button className="button primary" type="button" disabled={call.kind === "pending" || call.kind === "awaiting_signature"} onClick={() => void callContract("begin_settlement")}>Begin settlement</button>}
          {props.status === "settling" && <button className="button primary" type="button" disabled={call.kind === "pending" || call.kind === "awaiting_signature"} onClick={() => void callContract("finalize_settlement")}>Finalize settlement</button>}
          {props.status === "archived" && <button className="button primary" type="button" disabled={call.kind === "pending" || call.kind === "awaiting_signature"} onClick={() => void callContract("claim_refund")}>Claim eligible refund</button>}
        </div>
        <CallMessage call={call} />
      </div>
    </section>
  );
}

function CallMessage({ call }: { call: CallState }) {
  if (call.kind === "idle") return null;
  if (call.kind === "awaiting_signature") return <div className="transaction-state pending" role="status">Review `{call.method}` for this contract on NEAR Testnet in your wallet.</div>;
  if (call.kind === "pending") return <div className="transaction-state pending" role="status">The transaction is still processing on NEAR Testnet.</div>;
  if (call.kind === "failure") return <div className="transaction-state failure" role="alert">{call.message}</div>;
  return <div className="transaction-state success" role="status">Confirmed `{call.method}` transaction: {call.transactionHash}</div>;
}
