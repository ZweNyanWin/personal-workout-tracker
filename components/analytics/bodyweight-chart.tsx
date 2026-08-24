"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatDate } from "@/lib/utils";

interface BodyweightChartProps {
  data: { date: string; weight: number }[];
}

export function BodyweightChart({ data }: BodyweightChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No bodyweight data yet. Log your weight after workouts.
      </div>
    );
  }

  const min = Math.floor(Math.min(...data.map((d) => d.weight)) - 2);
  const max = Math.ceil(Math.max(...data.map((d) => d.weight)) + 2);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
        <defs>
          <linearGradient id="bwGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--pb-success)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--pb-success)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
          domain={[min, max]}
          tick={{ fill: "var(--chart-tick)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}kg`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--chart-tooltip)",
            border: "1px solid var(--chart-grid)",
            color: "var(--pb-foreground)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(v) => formatDate(v as string)}
          formatter={(v: number) => [`${v}kg`, "Bodyweight"]}
        />
        <Area
          type="monotone"
          dataKey="weight"
          stroke="var(--pb-success)"
          strokeWidth={2}
          fill="url(#bwGradient)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
