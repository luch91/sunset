import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App";

function renderRoute(route: string) {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("Journey A", () => {
  it("explains SUNSET without requiring a wallet", () => {
    renderRoute("/");
    expect(screen.getByRole("heading", { name: "Every mission deserves an ending." })).toBeInTheDocument();
    expect(screen.queryByText(/connect wallet/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/does not form or dissolve a legal entity/i)).toHaveLength(2);
  });

  it("shows an honest empty directory by default", () => {
    renderRoute("/institutions");
    expect(screen.getByRole("heading", { name: "No institutions are available on NEAR Testnet yet." })).toBeInTheDocument();
  });

  it("filters labeled preview records", async () => {
    const user = userEvent.setup();
    renderRoute("/institutions?demo=1");
    expect(screen.getByText("Interface preview.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Repair the East Garden" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search"), "no match");
    expect(screen.getByRole("heading", { name: "No institutions match these filters." })).toBeInTheDocument();
  });

  it("shows charter, treasury, milestones, and verifier disclosure", () => {
    renderRoute("/institutions/east-garden.preview.testnet?demo=1");
    expect(screen.getByRole("heading", { name: "Funds at a glance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Founding rules" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Milestones" })).toBeInTheDocument();
    expect(screen.getByText(/accounts are pseudonyms/i)).toBeInTheDocument();
    expect(screen.getByText(/has no transaction hashes/i)).toBeInTheDocument();
  });

  it("opens the Founding Studio without requesting a transaction", () => {
    renderRoute("/create");
    expect(screen.getByRole("heading", { name: "Create an institution" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mission and identity" })).toBeInTheDocument();
    expect(screen.queryByText(/transaction processing/i)).not.toBeInTheDocument();
  });
});
