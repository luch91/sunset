import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Lifecycle } from "../components/Lifecycle";
import { PreviewNotice } from "../components/PreviewNotice";
import { StatusBadge } from "../components/StatusBadge";
import { getInstitution, isPreviewMode } from "../lib/data";
import { formatDate, formatNear, statusLabel } from "../lib/format";
import { FundingPanel } from "../features/funding/FundingPanel";
import { readInstitution } from "../lib/near/rpc";
import type { Institution } from "../lib/types";

export function InstitutionPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const preview = isPreviewMode(location.search);
  const [institution, setInstitution] = useState<Institution | undefined>(() => getInstitution(id, preview));
  const [loading, setLoading] = useState(!preview);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) {
      setInstitution(getInstitution(id, true));
      setLoading(false);
      setLoadError(null);
      return;
    }
    let current = true;
    setLoading(true);
    setLoadError(null);
    void readInstitution(id).then((record) => {
      if (current) setInstitution(record);
    }).catch((cause) => {
      if (current) setLoadError(cause instanceof Error ? cause.message : "Contract data could not be read.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [id, preview]);

  if (loading) {
    return <section className="not-found section-pad" aria-live="polite"><p className="eyebrow">NEAR Testnet</p><h1>Reading contract state...</h1><p>Loading the charter, treasury, and milestones directly from the institution contract.</p></section>;
  }
  if (!institution) {
    return (
      <section className="not-found section-pad">
        <p className="eyebrow">Record unavailable</p>
        <h1>Institution not found.</h1>
        <p>No canonical contract record is available for <span className="account-id">{id}</span>.</p>
        {loadError && <p className="transaction-state failure">{loadError}</p>}
        <Link className="button primary" to={`/institutions${location.search}`}>Return to institutions</Link>
      </section>
    );
  }
  const current = institution.status === "settling" ? "Closing" : institution.status;
  return (
    <>
      {preview && <PreviewNotice />}
      <article className="institution-detail">
        <header className="detail-hero section-pad">
          <p className="breadcrumb"><Link to={`/institutions${location.search}`}>Institutions</Link> <span aria-hidden="true">/</span> {institution.name}</p>
          <div className="detail-heading">
            <div>
              <div className="title-status"><p className="eyebrow">NEAR Testnet</p><StatusBadge status={institution.status} /></div>
              <h1>{institution.name}</h1>
              <p className="hero-lede">{institution.missionSummary}</p>
              <p className="account-id">{institution.accountId}</p>
            </div>
            <div className="closing-date">
              <span>Closes</span>
              <strong><time dateTime={institution.expiresAt}>{formatDate(institution.expiresAt)}</time></strong>
              <small>Fixed charter date, UTC</small>
            </div>
          </div>
        </header>
        <section className="detail-lifecycle section-pad" aria-labelledby="progress-heading">
          <h2 id="progress-heading" className="sr-only">Lifecycle progress</h2>
          <Lifecycle current={current} />
        </section>
        <FundingPanel
          contractId={institution.accountId}
          status={institution.status}
          totalReceived={institution.treasury.totalReceived}
          fundingFloor={institution.minimumFunding}
          fundingCap={institution.fundingCap}
          fundingDeadline={institution.fundingDeadline}
          preview={preview}
        />
        <section className="detail-grid section-pad">
          <div className="panel treasury-panel">
            <p className="eyebrow">Treasury</p>
            <h2>Funds at a glance</h2>
            <dl className="treasury-grid">
              <div><dt>Total received</dt><dd>{formatNear(institution.treasury.totalReceived)}</dd></div>
              <div><dt>Confirmed spend</dt><dd>{formatNear(institution.treasury.confirmedMilestoneSpend)}</dd></div>
              <div><dt>Pending outbound</dt><dd>{formatNear(institution.treasury.pendingOutbound)}</dd></div>
              <div><dt>Current residual</dt><dd>{formatNear(institution.treasury.residual)}</dd></div>
            </dl>
            <p className="reserve-note"><strong>Storage reserve:</strong> {formatNear(institution.treasury.storageReserve)}. This is operational funding, not public contributions.</p>
          </div>
          <div className="panel charter-panel">
            <p className="eyebrow">Charter</p>
            <h2>Founding rules</h2>
            <dl className="definition-list">
              <div><dt>Founder</dt><dd>{institution.founder}</dd></div>
              <div><dt>Funding cutoff</dt><dd><time dateTime={institution.fundingDeadline}>{formatDate(institution.fundingDeadline)}</time></dd></div>
              <div><dt>Funding range</dt><dd>{formatNear(institution.minimumFunding)} to {formatNear(institution.fundingCap)}</dd></div>
              <div><dt>Refund rule</dt><dd>Pro rata to contributors</dd></div>
              <div><dt>Charter hash</dt><dd className="hash">{institution.charterHash}</dd></div>
              <div><dt>Code version</dt><dd>{institution.codeVersion}</dd></div>
            </dl>
          </div>
        </section>
        <section className="milestones section-pad" aria-labelledby="milestones-heading">
          <div className="section-heading-row">
            <div><p className="eyebrow">Committed work</p><h2 id="milestones-heading">Milestones</h2></div>
            <p>{institution.milestones.length} fixed commitments</p>
          </div>
          <div className="milestone-list">
            {institution.milestones.map((milestone, index) => (
              <article className="milestone" key={milestone.id}>
                <span className="milestone-number">0{index + 1}</span>
                <div>
                  <div className="milestone-title"><h3>{milestone.title}</h3><span className="status">{statusLabel(milestone.status)}</span></div>
                  <p>{milestone.acceptanceCriteria}</p>
                  <dl className="milestone-meta">
                    <div><dt>Budget</dt><dd>{formatNear(milestone.budget)}</dd></div>
                    <div><dt>Recipient</dt><dd>{milestone.beneficiary}</dd></div>
                    <div><dt>Deadline</dt><dd><time dateTime={milestone.deadline}>{formatDate(milestone.deadline)}</time></dd></div>
                    <div><dt>Review</dt><dd>{milestone.approvals} of {milestone.verifierTotal} verifiers approved</dd></div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="records-grid section-pad">
          <div>
            <p className="eyebrow">Independent review</p>
            <h2>Verifiers</h2>
            <p className="section-intro">The charter requires {institution.verifierThreshold} of {institution.verifiers.length} named verifier accounts.</p>
            <ul className="verifier-list">{institution.verifiers.map((verifier) => <li key={verifier}>{verifier}</li>)}</ul>
            <p className="fine-print">Accounts are pseudonyms. Multiple accounts do not prove multiple independent people.</p>
          </div>
          <div>
            <p className="eyebrow">Ledger and receipts</p>
            <h2>No onchain receipts</h2>
            <div className="empty-ledger">
              <p>This interface-preview record has no transaction hashes. Deployed institutions will link every confirmed event to its NEAR Testnet record.</p>
            </div>
          </div>
        </section>
        <section className="contract-strip section-pad">
          <div><p className="eyebrow">Contract details</p><h2>{institution.accountId}</h2></div>
          <p>{preview ? "Preview data is local and cannot be opened in a block explorer." : "Contract views are the canonical source for this page."}</p>
        </section>
      </article>
    </>
  );
}
