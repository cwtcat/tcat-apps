import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import MainApp from "./MainApp"; // we’ll move your existing code here
import RidershipBarChartPage from "./pages/RidershipBarChartPage";
import RidershipChart from "./components/RidershipChart";

export default function App() {
  return (
    <Router>
      <nav style={{ padding: "10px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <Link to="/" style={{ marginRight: 20 }}>Ridership Gapminder</Link>
        <Link to="/bar">Stacked Bar Chart  </Link>
        <Link to="/chart">New Chart  </Link>        
      </nav>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/bar" element={<RidershipBarChartPage />} />
        <Route path="/chart" element={<RidershipChart />} />        
      </Routes>
    </Router>
  );
}