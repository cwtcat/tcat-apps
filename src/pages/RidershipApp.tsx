import React, { useEffect, useState } from "react";
import RidershipBarChart from "../components/RidershipBarChart";

interface DataPoint {
  service_day: string;
  farebox: number;
  apc: number;
}

const RidershipApp: React.FC = () => {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    // Try loading local data (for testing)
    fetch("/data/agg_daily_summary.json")
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch((err) => console.error("Error loading data:", err));
  }, []);

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Ridership Visualization</h1>
      <RidershipBarChart data={data} />
    </div>
  );
};

export default RidershipApp;
