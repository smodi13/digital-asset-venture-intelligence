"use client";

import { useRadar } from "@/components/radar/useRadar";
import { Icon } from "@/components/ui";

/** Compact add/remove control for the Follow-On Radar. Renders nothing until hydrated, to avoid a false "not on radar" flash. */
export function RadarButton({ entityId, compact = false }: { entityId: string; compact?: boolean }) {
  const { hydrated, has, toggle } = useRadar();
  if (!hydrated) return <span className="inline-block h-[26px] w-[104px]" aria-hidden />;

  const onRadar = has(entityId);
  return (
    <button
      type="button"
      onClick={() => toggle(entityId)}
      aria-pressed={onRadar}
      className={`btn-quiet inline-flex items-center gap-1.5 ${compact ? "text-[11px]" : ""} ${
        onRadar ? "bg-[var(--accent-weak)] text-[var(--accent)]" : ""
      }`}
      title={onRadar ? "Remove from your local Follow-On Radar" : "Add to your local Follow-On Radar"}
    >
      <Icon name={onRadar ? "check" : "feed"} />
      {onRadar ? "On Radar" : "Add to Radar"}
    </button>
  );
}
