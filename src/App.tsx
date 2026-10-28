import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DirectoryPage } from "./pages/DirectoryPage";
import { HomePage } from "./pages/HomePage";
import { InstitutionPage } from "./pages/InstitutionPage";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/institutions" element={<DirectoryPage />} />
        <Route path="/institutions/:id" element={<InstitutionPage />} />
        <Route path="*" element={<section className="not-found section-pad"><p className="eyebrow">404</p><h1>Page not found.</h1></section>} />
      </Routes>
    </Layout>
  );
}
