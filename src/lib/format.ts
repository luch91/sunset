const YOCTO = 10n ** 24n;

export function formatNear(value: string): string {
  const amount = BigInt(value);
  const whole = amount / YOCTO;
  const fraction = ((amount % YOCTO) * 10n) / YOCTO;
  return `${whole}.${fraction} NEAR`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
