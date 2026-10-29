import { Link, useLocation } from "react-router-dom";
import { InstitutionCard } from "../components/InstitutionCard";
import { Lifecycle } from "../components/Lifecycle";
import { PreviewNotice } from "../components/PreviewNotice";
import { isPreviewMode, listInstitutions } from "../lib/data";

export function HomePage() {
  const location = useLocation();
  const preview = isPreviewMode(location.search);
  const institutions = listInstitutions(preview);
  return (
    <>
      {preview && <PreviewNotice />}
      <section className="hero section-pad">
        <div className="hero-copy">
          <p className="eyebrow">Finite-purpose funding on NEAR Testnet</p>
          <h1>Every mission deserves an ending.</h1>
          <p className="hero-lede">Create a shared treasury with a fixed purpose, a fixed deadline, and founding rules for returning what remains.</p>
          <div className="hero-actions">
            <Link className="button primary" to={`/institutions${location.search}`}>Explore institutions</Link>
            <Link className="button secondary" to="/create">Found an institution</Link>
          </div>
          <p className="limitation">SUNSET manages an onchain funding lifecycle. It does not form or dissolve a legal entity.</p>
        </div>
        <div className="horizon-art" aria-hidden="true">
          <span className="sun" />
          <span className="horizon-line" />
          <span className="room room-one" />
          <span className="room room-two" />
          <span className="room room-three" />
          <p>Purpose in. Funds out. Mission closed.</p>
        </div>
      </section>

      <section id="how-it-works" className="lifecycle-section section-pad" aria-labelledby="lifecycle-heading">
        <p className="eyebrow">A finite lifecycle</p>
        <h2 id="lifecycle-heading">The ending is part of the founding.</h2>
        <p className="section-intro">Each institution begins with a public charter and ends by its fixed rules, including what happens to funds that were not spent.</p>
        <Lifecycle />
      </section>

      <section className="featured section-pad" aria-labelledby="featured-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Public record</p>
            <h2 id="featured-heading">Inspect an institution</h2>
          </div>
          <Link className="text-link" to={`/institutions${location.search}`}>View directory <span aria-hidden="true">→</span></Link>
        </div>
        {institutions.length ? (
          <InstitutionCard institution={institutions[0]} />
        ) : (
          <div className="empty-state">
            <p className="empty-kicker">The registry is quiet.</p>
            <h3>No institutions are available on NEAR Testnet yet.</h3>
            <p>Once the first contract is deployed, its charter, treasury, deadlines, and receipts will be readable here without connecting a wallet.</p>
            <Link className="text-link" to="/?demo=1">View a labeled interface preview <span aria-hidden="true">→</span></Link>
          </div>
        )}
      </section>

      <section className="constitution section-pad" aria-labelledby="constitution-heading">
        <div>
          <p className="eyebrow">The exit constitution</p>
          <h2 id="constitution-heading">Four promises, fixed at the start.</h2>
        </div>
        <dl className="promise-grid">
          <div><dt>Purpose</dt><dd>What this institution exists to accomplish.</dd></div>
          <div><dt>Limits</dt><dd>Who may receive funds and the most each milestone can pay.</dd></div>
          <div><dt>Deadline</dt><dd>When new spending authority ends, without extension.</dd></div>
          <div><dt>Return rule</dt><dd>How unspent funds become claimable by contributors.</dd></div>
        </dl>
      </section>
    </>
  );
}
