import styles from "./StatCard.module.css";

export default function StatCard({ label, value, sub, subValue, highlight, positive, negative }) {
  const valueClass = [
    styles.value,
    positive ? styles.positive : "",
    negative ? styles.negative : "",
  ].join(" ");

  const subValueClass = [
    styles.subValue,
    positive ? styles.positive : "",
    negative ? styles.negative : "",
  ].join(" ");

  return (
    <div className={`${styles.card} ${highlight ? styles.highlight : ""}`}>
      <span className={styles.label}>{label}</span>
      <span className={valueClass}>{value ?? "—"}</span>
      {subValue && <span className={subValueClass}>{subValue}</span>}
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}
