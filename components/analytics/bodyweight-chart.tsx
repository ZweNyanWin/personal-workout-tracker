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
            <stop offset="5%" stopColor="hsl(142 70% 45%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 13% 18%)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "hsl(215 15% 50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
          domain={[min, max]}
          tick={{ fill: "hsl(215 15% 50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}kg`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(222 13% 10%)",
            border: "1px solid hsl(222 13% 18%)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelFormatter={(v) => formatDate(v as string)}
          formatter={(v: number) => [`${v}kg`, "Bodyweight"]}
        />
        <Area
          type="monotone"
          dataKey="weight"
          stroke="hsl(142 70% 45%)"
          strokeWidth={2}
          fill="url(#bwGradient)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
