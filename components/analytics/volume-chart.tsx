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
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 13% 18%)" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={(v) => formatDate(v)}
          tick={{ fill: "hsl(215 15% 50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "hsl(215 15% 50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(222 13% 10%)",
            border: "1px solid hsl(222 13% 18%)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(v) => `Week of ${formatDate(v as string)}`}
          formatter={(v: number) => [`${v.toLocaleString()} kg`, "Volume"]}
        />
        <Bar dataKey="volume" fill="hsl(25 95% 55%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
