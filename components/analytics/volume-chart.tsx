"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatDate } from "@/lib/utils";

interface VolumeChartProps {
  data: { week: string; volume: number }[];
}

export function VolumeChart({ data }: VolumeChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No volume data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={(v) => formatDate(v)}
          tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--chart-tooltip)",
            border: "1px solid var(--chart-grid)",
            color: "var(--pb-foreground)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(v) => `Week of ${formatDate(v as string)}`}
          formatter={(v: number) => [`${v.toLocaleString()} kg`, "Volume"]}
        />
        <Bar dataKey="volume" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
