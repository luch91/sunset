import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { InstitutionCard } from "../components/InstitutionCard";
import { PreviewNotice } from "../components/PreviewNotice";
import { isPreviewMode, listInstitutions } from "../lib/data";
import type { Institution } from "../lib/types";
import { readDirectory } from "../lib/near/rpc";

const tabs = ["all", "funding", "active", "settling", "archived"] as const;

export function DirectoryPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const preview = isPreviewMode(location.search);
  const activeTab = params.get("status") ?? "all";
  const query = params.get("q") ?? "";
  const [records, setRecords] = useState<Institution[]>(() => listInstitutions(preview));
  const [loading, setLoading] = useState(!preview);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (preview) {
      setRecords(listInstitutions(true));
      setLoading(false);
      setLoadError(null);
      return;
    }
    let current = true;
    setLoading(true);
    void readDirectory().then((items) => {
      if (current) setRecords(items);
    }).catch((cause) => {
      if (current) setLoadError(cause instanceof Error ? cause.message : "The factory registry could not be read.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [preview]);
  const filtered = useMemo(() => records.filter((item) => {
    const matchesStatus = activeTab === "all" || item.status === activeTab;
    const haystack = `${item.name} ${item.missionSummary} ${item.accountId}`.toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  }), [records, activeTab, query]);

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    setParams(next);
  }

  return (
    <>
      {preview && <PreviewNotice />}
      <section className="page-hero section-pad">
        <p className="eyebrow">Public directory</p>
        <h1>Institutions</h1>
        <p>Explore public missions with fixed funding, spending, and closure rules. No wallet is required.</p>
      </section>
      <section className="directory section-pad" aria-label="Institution directory">
        <div className="tabs" aria-label="Filter by status">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} type="button" onClick={() => update("status", tab)}>
              {tab === "settling" ? "Closing" : tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="directory-controls">
          <label>
            <span>Search</span>
            <input value={query} onChange={(event) => update("q", event.target.value)} placeholder="Name, mission, or account" />
          </label>
          <label>
            <span>Sort</span>
            <select defaultValue="closing"><option value="closing">Closing soon</option><option value="created">Recently created</option><option value="archived">Recently archived</option></select>
          </label>
        </div>
        <p className="result-count" aria-live="polite">{loading ? "Reading NEAR Testnet registry..." : `${filtered.length} ${filtered.length === 1 ? "institution" : "institutions"}`}</p>
        {loadError && <div className="transaction-state failure" role="alert">Directory data could not be refreshed. {loadError}</div>}
        <div className="card-list">
          {filtered.map((institution) => <InstitutionCard key={institution.accountId} institution={institution} />)}
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <p className="empty-kicker">No records in this view.</p>
            <h2>{records.length ? "No institutions match these filters." : "No institutions are available on NEAR Testnet yet."}</h2>
            <p>{records.length ? "Clear the search and status filters to return to the full directory." : "The directory will list contracts only after their state can be read from the configured registry."}</p>
            {records.length ? <button className="text-button" type="button" onClick={() => setParams(preview ? { demo: "1" } : {})}>Clear filters</button> : <Link className="text-link" to="/institutions?demo=1">View a labeled interface preview <span aria-hidden="true">→</span></Link>}
          </div>
        )}
      </section>
    </>
  );
}
