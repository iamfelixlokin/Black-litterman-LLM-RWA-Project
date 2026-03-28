import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from "recharts";
import styles from "./Panel.module.css";

const COLORS = ["#6366f1","#818cf8","#10b981","#f59e0b","#ef4444","#38bdf8","#a78bfa"];

export default function WeightsChart({ assets }) {
  if (!assets || assets.length === 0) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Portfolio Weights</h3>
        <p style={{ color:"var(--muted)", marginTop:16 }}>No rebalance data yet</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Portfolio Weights</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={assets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fill:"var(--muted)", fontSize:11 }} />
          <YAxis
            tick={{ fill:"var(--muted)", fontSize:11 }}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 35]}
          />
          <Tooltip
            formatter={(v) => [`${v.toFixed(2)}%`, "Weight"]}
            contentStyle={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8 }}
            labelStyle={{ color:"var(--muted)" }}
          />
          <Bar dataKey="weight" radius={[4,4,0,0]}>
            {assets.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
