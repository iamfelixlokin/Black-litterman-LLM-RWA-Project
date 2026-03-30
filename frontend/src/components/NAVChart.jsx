import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import styles from "./Panel.module.css";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px" }}>
      <p style={{ color:"var(--muted)", marginBottom:4, fontSize:12 }}>{label}</p>
      <p style={{ fontFamily:"var(--mono)", fontWeight:700, color:"var(--accent2)" }}>
        ${payload[0].value.toFixed(4)}
      </p>
    </div>
  );
};

export default function NAVChart({ history }) {
  // Ensure we always have at least a stub data point
  const data = history.length > 0
    ? history
    : [{ time: "—", nav: 100 }];

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>NAV History (USDC / token) <span style={{ fontSize:11, color:"var(--muted)", fontWeight:400 }}>· 每日更新一次</span></h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="time" tick={{ fill:"var(--muted)", fontSize:11 }} />
          <YAxis
            domain={["auto","auto"]}
            tick={{ fill:"var(--muted)", fontSize:11 }}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="nav"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill:"var(--accent)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
