import { Link, useLocation } from "react-router-dom";
import { formatDate, formatNear } from "../lib/format";
import type { Institution } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

export function InstitutionCard({ institution }: { institution: Institution }) {
  const location = useLocation();
  return (
    <article className="institution-card">
      <div className="card-heading">
        <div>
          <p className="account-id">{institution.accountId}</p>
          <h2>{institution.name}</h2>
        </div>
        <StatusBadge status={institution.status} />
      </div>
      <p className="mission-summary">{institution.missionSummary}</p>
      <dl className="card-metrics">
        <div><dt>Received</dt><dd>{formatNear(institution.treasury.totalReceived)}</dd></div>
        <div><dt>Closes</dt><dd><time dateTime={institution.expiresAt}>{formatDate(institution.expiresAt)}</time></dd></div>
        <div><dt>Next</dt><dd>{institution.nextAction}</dd></div>
      </dl>
      <Link className="text-link" to={`/institutions/${institution.accountId}${location.search}`}>View institution <span aria-hidden="true">→</span></Link>
    </article>
  );
}
