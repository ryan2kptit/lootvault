"use client";

import type { SalesStats } from "@lootvault/web-shared/api";
import { formatEth } from "@lootvault/web-shared/format";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEther } from "viem";

/** Gross revenue per day for the last 7 days (UTC), in ETH. */
export function SalesChart({ days }: { days: SalesStats["last7Days"] }) {
  const data = days.map((day) => ({
    label: new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }),
    eth: Number(formatEther(BigInt(day.grossWei))),
    grossWei: day.grossWei,
    orders: day.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          tickFormatter={(eth: number) => eth.toLocaleString("en-AU", { maximumSignificantDigits: 2 })}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(_value, _name, entry) => [`${formatEth(entry.payload.grossWei)} · ${entry.payload.orders} orders`, "Revenue"]}
        />
        <Bar dataKey="eth" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}
