import { permanentRedirect } from "next/navigation";

// Sourcing is now the root landing page. `/` has permanently replaced /sourcing
// as the canonical Sourcing location, so this legacy path issues a true
// permanent redirect (308) rather than a temporary one.
export const dynamic = "force-static";

export default function SourcingRedirect() {
  permanentRedirect("/");
}
