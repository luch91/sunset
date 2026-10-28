import type { InstitutionStatus } from "../lib/types";
import { statusLabel } from "../lib/format";

export function StatusBadge({ status }: { status: InstitutionStatus }) {
  return <span className={`status status-${status}`}>{statusLabel(status)}</span>;
}
