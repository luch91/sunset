import { useEffect, useState } from "react";
import { InstitutionCard } from "../components/InstitutionCard";
import { readDirectory } from "../lib/near/rpc";
import type { Institution } from "../lib/types";

export function ArchivePage() {
  const [records, setRecords] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void readDirectory().then((items) => { if (current) setRecords(items.filter((item) => item.status === "archived")); }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Archive unavailable."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  return <><section className="page-hero section-pad"><p className="eyebrow">Permanent public record</p><h1>Archive</h1><p>Completed institutions remain readable with their original charter, milestone outcomes, final accounting, and claim status.</p></section><section className="directory section-pad" aria-live="polite">{loading && <p>Reading archived contracts from NEAR Testnet...</p>}{error && <div className="transaction-state failure" role="alert">{error}</div>}<div className="card-list">{records.map((record) => <InstitutionCard institution={record} key={record.accountId} />)}</div>{!loading && !error && records.length === 0 && <div className="empty-state"><p className="empty-kicker">No permanent records yet.</p><h2>No institutions have reached archived status on the configured Testnet factory.</h2><p>Closure records will appear only after settlement has been finalized onchain.</p></div>}</section></>;
}
