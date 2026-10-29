import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DirectoryPage } from "./pages/DirectoryPage";
import { HomePage } from "./pages/HomePage";
import { InstitutionPage } from "./pages/InstitutionPage";
import { FoundingPage } from "./features/founding/FoundingPage";
import { WalletProvider } from "./features/wallet/WalletProvider";

export function App() {
  return (
    <WalletProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/institutions" element={<DirectoryPage />} />
          <Route path="/institutions/:id" element={<InstitutionPage />} />
          <Route path="/create" element={<FoundingPage />} />
          <Route path="*" element={<section className="not-found section-pad"><p className="eyebrow">404</p><h1>Page not found.</h1></section>} />
        </Routes>
      </Layout>
    </WalletProvider>
  );
}
