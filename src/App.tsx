import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import MainApp from "./MainApp";
import RidershipBarChartPage from "./pages/RidershipBarChartPage";
import RidershipChart from "./components/RidershipChart";
import CornellBarChart from "./components/CornellBarChart";

function NavBar() {
  const location = useLocation();

  const links = [
    { to: "/", label: "Ridership Gapminder" },
    { to: "/chart", label: "Ridership Stacked Bar Chart" },
    { to: "/cuchart", label: "Cornell Fare Events" },
  ];

  const isActive = (to: string) => {
    if (to === "/") return location.pathname === "/";
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  const baseBtn: React.CSSProperties = {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    transition: "background 0.15s ease, box-shadow 0.15s ease",
  };

  const activeBtn: React.CSSProperties = {
    ...baseBtn,
    background: "#1d4ed8",
    cursor: "default",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.18)",
    opacity: 0.95,
  };

  return (
    <nav
      style={{
        padding: "10px 16px",
        background: "#f9fafb",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {/* Left: logo + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src="/assets/4026b9fa.jpg"
          alt="App logo"
          width={90}
          height={45}
          style={{
            display: "block",
            borderRadius: "6px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        />
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 600,
            fontSize: "16px",
            color: "#1f2937",
            letterSpacing: "0.25px",
            marginLeft: "6px", // shifts the title slightly right for better spacing
          }}
        >
          TCAT Ridership
        </span>
      </div>

      {/* Right: nav buttons */}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {links.map(({ to, label }) => {
          const active = isActive(to);
          return (
            <Link key={to} to={to} style={{ textDecoration: "none" }}>
              <button
                type="button"
                style={active ? activeBtn : baseBtn}
                disabled={active}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "#1d4ed8";
                }}
                onMouseLeave={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "#2563eb";
                }}
              >
                {label}
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/bar" element={<RidershipBarChartPage />} />
        <Route path="/chart" element={<RidershipChart />} />
        <Route path="/cuchart" element={<CornellBarChart />} />
      </Routes>
    </Router>
  );
}
