"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const PIE_COLORS = [
  "#0f766e",
  "#0ea5a5",
  "#0284c7",
  "#1d4ed8",
  "#f59e0b",
  "#ea580c",
  "#ef4444",
  "#db2777",
  "#8b5cf6",
  "#7c3aed",
  "#65a30d",
  "#16a34a"
];

type SimpleDatum = {
  label?: string;
  name?: string;
  count?: number;
  date?: string;
  tasks?: number;
  candidates?: number;
};

export function DashboardCharts({
  statusDistribution,
  positionDistribution,
  funnel,
  trendDays
}: {
  statusDistribution: SimpleDatum[];
  positionDistribution: SimpleDatum[];
  funnel: SimpleDatum[];
  trendDays: SimpleDatum[];
}) {
  const chartEmpty = <div className="empty-state dashboard-chart-empty">当前筛选范围内暂无数据。</div>;

  return (
    <>
      <div className="card">
        <h3>阶段分布</h3>
        <div className="chart-box">
          {statusDistribution.length ? <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e3ee" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : chartEmpty}
        </div>
      </div>

      <div className="card">
        <h3>岗位分布</h3>
        <div className="chart-box">
          {positionDistribution.length ? <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={positionDistribution} dataKey="count" nameKey="name" outerRadius={100}>
                {positionDistribution.map((item, index) => (
                  <Cell key={`${item.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer> : chartEmpty}
        </div>
      </div>

      <div className="card">
        <h3>招聘漏斗</h3>
        <div className="chart-box">
          {funnel.some((item) => Number(item.count) > 0) ? <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e3ee" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={88} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0284c7" radius={[0, 12, 12, 0]} />
            </BarChart>
          </ResponsiveContainer> : chartEmpty}
        </div>
      </div>

      <div className="card">
        <h3>招聘与 Agent 趋势</h3>
        <div className="chart-box">
          {trendDays.some((item) => Number(item.tasks) > 0 || Number(item.candidates) > 0) ? <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e3ee" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="tasks" stroke="#0f766e" strokeWidth={3} />
              <Line type="monotone" dataKey="candidates" stroke="#8b5cf6" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer> : chartEmpty}
        </div>
      </div>
    </>
  );
}
