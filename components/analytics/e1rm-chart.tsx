"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatDate } from "@/lib/utils";

interface E1rmChartProps {
  data: Record<string, { date: string; value: number }[]>;
}

const LIFT_COLORS = {
  bench:    "#f97316",
  squat:    "#3b82f6",
  deadlift: "#a855f7",
};

const LIFT_LABELS = {
  bench:    "Bench",
  squat:    "Squat",
  deadlift: "Deadlift",
};

type Lift = keyof typeof LIFT_COLORS;

// Merge all dates into a single timeline
function mergeData(data: Record<string, { date: string; value: number }[]>) {
  const dateMap = new Map<string, Record<string, number>>();

  for (const [lift, points] of Object.entries(data)) {
    for (const p of points) {
      const existing = dateMap.get(p.date) ?? {};
      existing[lift] = p.value;
      dateMap.set(p.date, existing);
    }
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
}

export function E1rmChart({ data }: E1rmChartProps) {
  const merged = mergeData(data);

  if (!merged.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No data yet — complete some workouts.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={merged} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 13% 18%)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "hsl(215 15% 50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={30}
        />
        <YAxis
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
          formatter={(value, name) => [`${value}kg`, LIFT_LABELS[name as Lift] ?? name]}
        />
        <Legend
          formatter={(value) => LIFT_LABELS[value as Lift] ?? value}
          wrapperStyle={{ fontSize: "12px" }}
        />
        {(Object.keys(LIFT_COLORS) as Lift[]).map((lift) => (
          data[lift]?.length > 0 && (
            <Line
              key={lift}
              type="monotone"
              dataKey={lift}
              stroke={LIFT_COLORS[lift]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          )
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
