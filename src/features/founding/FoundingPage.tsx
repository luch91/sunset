import { useMemo, useState } from "react";
import { useWallet } from "../wallet/WalletProvider";
import { emptyMilestone, initialDraft, type FoundingDraft, type MilestoneDraft } from "./types";
import { toNanoseconds, toYocto, validateAll, validateStep } from "./validation";
import { classifyWalletError, requireSuccessfulExecution } from "../../lib/near/transaction";

const FACTORY_ACCOUNT = import.meta.env.VITE_FACTORY_ACCOUNT_ID as string | undefined;
const STORAGE_DEPOSIT = import.meta.env.VITE_CREATION_DEPOSIT_NEAR ?? "3";
const steps = ["Mission", "Funding", "Milestones", "Verifiers", "Constitution"];

type TransactionState =
  | { kind: "idle" }
  | { kind: "awaiting_signature" }
  | { kind: "pending" }
  | { kind: "success"; transactionHash: string; explorerUrl: string }
  | { kind: "failure"; message: string };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function FoundingPage() {
  const wallet = useWallet();
  const [draft, setDraft] = useState<FoundingDraft>(initialDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [transaction, setTransaction] = useState<TransactionState>({ kind: "idle" });
  const milestoneBudget = useMemo(() => draft.milestones.reduce((sum, item) => sum + (Number(item.budgetNear) || 0), 0), [draft.milestones]);

  function update<K extends keyof FoundingDraft>(key: K, value: FoundingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMilestone(id: string, value: Partial<MilestoneDraft>) {
    update("milestones", draft.milestones.map((item) => item.id === id ? { ...item, ...value } : item));
  }

  function goNext() {
    const nextErrors = validateStep(draft, step, wallet.accountId);
    setErrors(nextErrors);
    if (!nextErrors.length) setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  async function submit() {
    const nextErrors = validateAll(draft, wallet.accountId);
    setErrors(nextErrors);
    if (nextErrors.length) return;
    if (!wallet.accountId) {
      setErrors(["Connect the founder wallet before creating the institution."]);
      return;
    }
    if (!FACTORY_ACCOUNT) {
      setErrors(["The Testnet factory account is not configured. No transaction was requested."]);
      return;
    }
    try {
      const canonical = {
        id: draft.institutionId,
        founder: wallet.accountId,
        name: draft.name.trim(),
        mission_summary: draft.missionSummary.trim(),
        metadata_uri: draft.metadataUri.trim(),
        funding_deadline_ns: toNanoseconds(draft.fundingDeadline),
        expires_at_ns: toNanoseconds(draft.expiresAt),
        settlement_grace_ns: (BigInt(draft.settlementGraceHours) * 3_600_000_000_000n).toString(),
        challenge_window_ns: (BigInt(draft.challengeWindowHours) * 3_600_000_000_000n).toString(),
        minimum_funding: toYocto(draft.minimumFundingNear),
        funding_cap: toYocto(draft.fundingCapNear),
        verifiers: draft.verifiers.map((item) => item.trim()).filter(Boolean),
        verifier_threshold: draft.verifierThreshold,
        milestones: draft.milestones.map((item) => ({
          id: item.id,
          title: item.title.trim(),
          beneficiary: item.beneficiary.trim(),
          budget: toYocto(item.budgetNear),
          deadline_ns: toNanoseconds(item.deadline),
          acceptance_criteria: item.acceptanceCriteria.trim()
        })),
        refund_policy: "ProRataContributors",
        code_version: "0.1.0"
      };
      const charterHash = await sha256(JSON.stringify(canonical));
      const charter = { ...canonical, charter_hash: charterHash };
      setTransaction({ kind: "awaiting_signature" });
      const signer = await wallet.getWallet();
      setTransaction({ kind: "pending" });
      const outcome = await signer.signAndSendTransaction({
        network: "testnet",
        signerId: wallet.accountId,
        receiverId: FACTORY_ACCOUNT,
        actions: [{
          type: "FunctionCall",
          params: {
            methodName: "create_institution",
            args: { charter, metadata_hash: charterHash },
            gas: "250000000000000",
            deposit: toYocto(STORAGE_DEPOSIT)
          }
        }]
      });
      const confirmed = requireSuccessfulExecution(outcome);
      setTransaction({ kind: "success", transactionHash: confirmed.hash, explorerUrl: confirmed.explorerUrl });
    } catch (cause) {
      setTransaction({ kind: "failure", message: classifyWalletError(cause) });
    }
  }

  return (
    <section className="founding-shell section-pad">
      <header className="founding-header">
        <div><p className="eyebrow">Founding Studio</p><h1>Create an institution</h1><p className="section-intro">Set the mission, spending limits, independent review, and fixed ending before any public funding begins.</p></div>
        <div className="network-card"><span>Network</span><strong>NEAR Testnet</strong><small>{wallet.accountId ?? "Wallet disconnected"}</small></div>
      </header>

      <ol className="studio-steps" aria-label="Founding steps">
        {steps.map((label, index) => <li key={label} className={step === index ? "current" : step > index ? "complete" : ""}><button type="button" onClick={() => index < step && setStep(index)}><span>0{index + 1}</span>{label}</button></li>)}
      </ol>

      <div className="studio-grid">
        <div className="studio-form">
          {errors.length > 0 && <div className="form-errors" role="alert"><strong>Review these fields</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          {step === 0 && <MissionStep draft={draft} update={update} />}
          {step === 1 && <FundingStep draft={draft} update={update} />}
          {step === 2 && <MilestoneStep draft={draft} update={update} updateMilestone={updateMilestone} />}
          {step === 3 && <VerifierStep draft={draft} update={update} />}
          {step === 4 && <ConstitutionStep draft={draft} accountId={wallet.accountId} transaction={transaction} />}
          <div className="studio-actions">
            {step > 0 && <button className="button secondary" type="button" onClick={() => { setErrors([]); setStep(step - 1); }}>Back</button>}
            {step < steps.length - 1 ? <button className="button primary" type="button" onClick={goNext}>Continue</button> : (
              <>
                {!wallet.accountId ? <button className="button primary" type="button" disabled={wallet.connecting} onClick={() => void wallet.connect()}>{wallet.connecting ? "Opening wallet..." : "Connect founder wallet"}</button> : <button className="button primary" type="button" disabled={transaction.kind === "pending" || transaction.kind === "awaiting_signature"} onClick={() => void submit()}>Create on NEAR Testnet</button>}
              </>
            )}
          </div>
        </div>
        <aside className="summary-rail">
          <p className="eyebrow">Founding summary</p>
          <h2>{draft.name || "Untitled institution"}</h2>
          <dl>
            <div><dt>Funding floor</dt><dd>{draft.minimumFundingNear || "0"} NEAR</dd></div>
            <div><dt>Funding cap</dt><dd>{draft.fundingCapNear || "0"} NEAR</dd></div>
            <div><dt>Milestone allocation</dt><dd>{milestoneBudget} NEAR</dd></div>
            <div><dt>Fixed expiration</dt><dd>{draft.expiresAt ? new Date(draft.expiresAt).toLocaleString() : "Not set"}</dd></div>
            <div><dt>Verifier policy</dt><dd>{draft.verifierThreshold} of {draft.verifiers.filter(Boolean).length || 0}</dd></div>
            <div><dt>Refund policy</dt><dd>Pro rata to contributors</dd></div>
          </dl>
          <p className="fine-print">Expiration, recipients, budgets, verifier policy, and refund policy cannot be changed after creation.</p>
        </aside>
      </div>
    </section>
  );
}

type Update = <K extends keyof FoundingDraft>(key: K, value: FoundingDraft[K]) => void;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function MissionStep({ draft, update }: { draft: FoundingDraft; update: Update }) {
  return <fieldset><legend>Mission and identity</legend><p>Describe one finite purpose in language a public visitor can understand.</p><Field label="Institution name" hint={`${draft.name.length}/80 characters`}><input value={draft.name} maxLength={80} onChange={(event) => update("name", event.target.value)} /></Field><Field label="Institution ID" hint="Lowercase letters, numbers, and hyphens. Used for the institution account."><input value={draft.institutionId} maxLength={40} onChange={(event) => update("institutionId", event.target.value.toLowerCase())} /></Field><Field label="Mission summary" hint={`${draft.missionSummary.length}/600 characters`}><textarea value={draft.missionSummary} maxLength={600} rows={5} onChange={(event) => update("missionSummary", event.target.value)} /></Field><Field label="Metadata URI" hint="Optional public, content-addressed charter metadata."><input type="url" value={draft.metadataUri} onChange={(event) => update("metadataUri", event.target.value)} /></Field></fieldset>;
}

function FundingStep({ draft, update }: { draft: FoundingDraft; update: Update }) {
  return <fieldset><legend>Funding and fixed ending</legend><p>Funding closes first. The institution expiration is permanent and cannot be extended.</p><div className="field-pair"><Field label="Funding floor (NEAR)"><input inputMode="decimal" value={draft.minimumFundingNear} onChange={(event) => update("minimumFundingNear", event.target.value)} /></Field><Field label="Funding cap (NEAR)"><input inputMode="decimal" value={draft.fundingCapNear} onChange={(event) => update("fundingCapNear", event.target.value)} /></Field></div><Field label="Funding cutoff, UTC"><input type="datetime-local" value={draft.fundingDeadline} onChange={(event) => update("fundingDeadline", event.target.value)} /></Field><Field label="Institution expiration, UTC" hint="No funding, authorization, or new milestone approval is allowed after this time."><input type="datetime-local" value={draft.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} /></Field><div className="field-pair"><Field label="Challenge window (hours)" hint="Evidence must be submitted early enough for this full review period."><input type="number" min="1" max="336" value={draft.challengeWindowHours} onChange={(event) => update("challengeWindowHours", event.target.value)} /></Field><Field label="Settlement grace (hours)" hint="Time reserved for resolving already pending transfers. This does not extend spending authority."><input type="number" min="0" max="720" value={draft.settlementGraceHours} onChange={(event) => update("settlementGraceHours", event.target.value)} /></Field></div></fieldset>;
}

function MilestoneStep({ draft, update, updateMilestone }: { draft: FoundingDraft; update: Update; updateMilestone: (id: string, value: Partial<MilestoneDraft>) => void }) {
  return <fieldset><legend>Milestones and beneficiaries</legend><p>Each payout is capped now. Total milestone budgets cannot exceed the funding floor.</p>{draft.milestones.map((item, index) => <div className="milestone-editor" key={item.id}><div className="editor-heading"><h3>Milestone {index + 1}</h3>{draft.milestones.length > 1 && <button className="text-button" type="button" onClick={() => update("milestones", draft.milestones.filter((value) => value.id !== item.id))}>Remove</button>}</div><Field label="Title"><input value={item.title} onChange={(event) => updateMilestone(item.id, { title: event.target.value })} /></Field><div className="field-pair"><Field label="Beneficiary account"><input value={item.beneficiary} onChange={(event) => updateMilestone(item.id, { beneficiary: event.target.value.toLowerCase() })} /></Field><Field label="Budget (NEAR)"><input inputMode="decimal" value={item.budgetNear} onChange={(event) => updateMilestone(item.id, { budgetNear: event.target.value })} /></Field></div><Field label="Deadline, UTC"><input type="datetime-local" value={item.deadline} onChange={(event) => updateMilestone(item.id, { deadline: event.target.value })} /></Field><Field label="Acceptance criteria"><textarea rows={4} value={item.acceptanceCriteria} onChange={(event) => updateMilestone(item.id, { acceptanceCriteria: event.target.value })} /></Field></div>)}{draft.milestones.length < 16 && <button className="button secondary" type="button" onClick={() => update("milestones", [...draft.milestones, emptyMilestone()])}>Add milestone</button>}</fieldset>;
}

function VerifierStep({ draft, update }: { draft: FoundingDraft; update: Update }) {
  return <fieldset><legend>Independent verifiers</legend><p>Verifiers cannot be the founder or a milestone beneficiary. Accounts are pseudonyms, so disclose how you selected them.</p>{draft.verifiers.map((value, index) => <Field key={index} label={`Verifier ${index + 1}`}><div className="inline-field"><input value={value} onChange={(event) => update("verifiers", draft.verifiers.map((item, itemIndex) => itemIndex === index ? event.target.value.toLowerCase() : item))} />{draft.verifiers.length > 3 && <button type="button" aria-label={`Remove verifier ${index + 1}`} onClick={() => update("verifiers", draft.verifiers.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</div></Field>)}{draft.verifiers.length < 12 && <button className="text-button" type="button" onClick={() => update("verifiers", [...draft.verifiers, ""])}>Add verifier</button>}<Field label="Approvals required"><input type="number" min="2" max={draft.verifiers.length} value={draft.verifierThreshold} onChange={(event) => update("verifierThreshold", Number(event.target.value))} /></Field></fieldset>;
}

function ConstitutionStep({ draft, accountId, transaction }: { draft: FoundingDraft; accountId: string | null; transaction: TransactionState }) {
  return <fieldset><legend>Founding constitution</legend><div className="constitution-review"><p>This institution exists only to <strong>{draft.missionSummary || "complete its stated mission"}</strong>.</p><ol><li>Funding closes on <strong>{new Date(draft.fundingDeadline).toLocaleString()}</strong>.</li><li>Spending authority ends permanently on <strong>{new Date(draft.expiresAt).toLocaleString()}</strong>.</li><li>Milestone payouts are capped at their listed budgets and require {draft.verifierThreshold} verifier approvals.</li><li>Unspent public funds return pro rata to contributors after settlement.</li><li>The founder has no special withdrawal right after activation.</li></ol></div><div className="authorization-box"><p className="eyebrow">Transaction authorization</p><dl><div><dt>Signer</dt><dd>{accountId ?? "Connect wallet"}</dd></div><div><dt>Contract</dt><dd>{FACTORY_ACCOUNT ?? "Factory not deployed"}</dd></div><div><dt>Method</dt><dd>create_institution</dd></div><div><dt>Attached deposit</dt><dd>{STORAGE_DEPOSIT} NEAR</dd></div><div><dt>Network</dt><dd>NEAR Testnet</dd></div></dl></div><TransactionMessage transaction={transaction} /></fieldset>;
}

function TransactionMessage({ transaction }: { transaction: TransactionState }) {
  if (transaction.kind === "idle") return null;
  if (transaction.kind === "awaiting_signature") return <div className="transaction-state pending" role="status">Review the address, method, amount, and Testnet network in your wallet.</div>;
  if (transaction.kind === "pending") return <div className="transaction-state pending" role="status">The transaction is still processing on NEAR Testnet.</div>;
  if (transaction.kind === "failure") return <div className="transaction-state failure" role="alert"><strong>Creation failed.</strong> {transaction.message}</div>;
  return <div className="transaction-state success" role="status"><strong>Institution creation confirmed.</strong> <a href={transaction.explorerUrl} target="_blank" rel="noreferrer">View {transaction.transactionHash} in the Testnet explorer</a></div>;
}
