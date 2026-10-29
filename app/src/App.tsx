import { HashRouter, Route, Routes, Link } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Screener } from "./pages/Screener";
import { CompanyPage } from "./pages/Company";
import { Events } from "./pages/Events";
import { Industries } from "./pages/Industries";
import { Watchlist } from "./pages/Watchlist";
import { Methodology } from "./pages/Methodology";
import { Compare } from "./pages/Compare";
import { Finance } from "./pages/Finance";

function NotFound() {
  return (
    <div className="empty">
      <h1 style={{ color: "var(--text)" }}>404</h1>
      <p>Không tìm thấy trang.</p>
      <Link className="btn" to="/">Về trang tổng quan</Link>
    </div>
  );
}

// HashRouter: the build is a static bundle that works on any file host without rewrite rules.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="screener" element={<Screener />} />
          <Route path="finance" element={<Finance />} />
          <Route path="c/:ticker" element={<CompanyPage />} />
          <Route path="events" element={<Events />} />
          <Route path="industries" element={<Industries />} />
          <Route path="compare" element={<Compare />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="methodology" element={<Methodology />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
