const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatUsagePercent(value: number) {
  if (value > 0 && value < 0.001) {
    return "<0.1%";
  }
  return percentFormatter.format(value);
}
