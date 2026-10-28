const phases = ["Founding", "Funding", "Active", "Closing", "Archived"];

export function Lifecycle({ current }: { current?: string }) {
  return (
    <ol className="lifecycle" aria-label="Institution lifecycle">
      {phases.map((phase, index) => (
        <li key={phase} className={current?.toLowerCase() === phase.toLowerCase() ? "current" : undefined}>
          <span className="phase-number">0{index + 1}</span>
          <span>{phase}</span>
        </li>
      ))}
    </ol>
  );
}
