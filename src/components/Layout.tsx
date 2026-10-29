import { useState, type PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";

export function Layout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="SUNSET home">SUNSET<span aria-hidden="true">.</span></Link>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}>
          Menu
        </button>
        <nav id="primary-nav" className={open ? "primary-nav is-open" : "primary-nav"} aria-label="Primary navigation">
          <NavLink to="/institutions">Institutions</NavLink>
          <NavLink to="/archive">Archive</NavLink>
          <a href="/#how-it-works">How it works</a>
          <NavLink className="button" to="/create">Found an institution</NavLink>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div>
          <p className="wordmark footer-mark">SUNSET<span aria-hidden="true">.</span></p>
          <p>Finite-purpose funding with an enforceable ending.</p>
        </div>
        <div>
          <p className="eyebrow">Network</p>
          <p>NEAR Testnet</p>
          <p className="fine-print">Testnet assets have no monetary value.</p>
        </div>
        <div>
          <p className="eyebrow">Scope</p>
          <p className="fine-print">SUNSET manages an onchain funding lifecycle. It does not form or dissolve a legal entity.</p>
        </div>
      </footer>
    </div>
  );
}
