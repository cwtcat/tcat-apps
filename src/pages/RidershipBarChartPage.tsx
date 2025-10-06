import React, { useEffect, useState } from "react";
import RidershipBarChart from "../components/RidershipBarChart";

interface DataPoint {
  service_day: string;
  farebox: number;
  apc: number;
}

const RidershipBarChartPage: React.FC = () => {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    fetch("/data/agg_daily_summary.json")
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error("Error loading data:", err));
  }, []);

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Ridership Stacked Bar Chart</h2>
      <RidershipBarChart data={data} />
    </div>
  );
};

export default RidershipBarChartPage;
