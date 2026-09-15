import { describe, it, expect } from "vitest";
import { scoreMomentum, eventContribution, type MomentumEvent } from "@/lib/scoring/momentum";

function ev(over: Partial<MomentumEvent> = {}): MomentumEvent {
  return {
    eventKey: "e1",
    family: "operating_growth",
    direction: 1,
    impact: "meaningful",
    evidenceConfidence: 0.8,
    ageDays: 0,
    halfLifeDays: 180,
    ...over,
  };
}

describe("temporal momentum", () => {
  // Case 21: half-life decay is exact at one and two half-lives.
  it("decays by exactly 1/2 and 1/4 at one and two half-lives", () => {
    const c1 = eventContribution(ev({ impact: "exceptional", evidenceConfidence: 1, ageDays: 180 }));
    const c2 = eventContribution(ev({ impact: "exceptional", evidenceConfidence: 1, ageDays: 360 }));
    expect(c1).toBeCloseTo(0.5, 10);
    expect(c2).toBeCloseTo(0.25, 10);
  });

  // Case 1 + 17 + 18 + 19: financing with ambiguous / no completed direction adds nothing.
  it("a direction-0 financing event produces zero momentum", () => {
    const r = scoreMomentum([
      ev({ family: "gtm_ecosystem", direction: 0, impact: "exceptional", evidenceConfidence: 1 }),
    ]);
    expect(r.positiveMomentum).toBe(0);
    expect(r.negativeMomentum).toBe(0);
    expect(r.netMomentum).toBe(0);
  });

  // Case 20: a repeated identical event cannot spam momentum.
  it("collapses repeated identical events to one contribution", () => {
    const once = scoreMomentum([ev()]);
    const fiveTimes = scoreMomentum([ev(), ev(), ev(), ev(), ev()]);
    expect(fiveTimes.positiveMomentum).toBeCloseTo(once.positiveMomentum, 10);
  });

  // Case 22 + 23: positive and negative momentum remain separately visible.
  it("keeps positive growth and a risk event separately visible", () => {
    const r = scoreMomentum([
      ev({ eventKey: "growth", family: "operating_growth", direction: 1, impact: "major", evidenceConfidence: 0.9 }),
      ev({ eventKey: "breach", family: "risk_deterioration", direction: -1, impact: "major", evidenceConfidence: 0.9 }),
    ]);
    expect(r.positiveMomentum).toBeGreaterThan(0);
    expect(r.negativeMomentum).toBeGreaterThan(0);
  });

  it("uses diminishing weights on the strongest three contributions in a family", () => {
    const r = scoreMomentum([
      ev({ eventKey: "a", impact: "exceptional", evidenceConfidence: 1 }),
      ev({ eventKey: "b", impact: "exceptional", evidenceConfidence: 1 }),
      ev({ eventKey: "c", impact: "exceptional", evidenceConfidence: 1 }),
      ev({ eventKey: "d", impact: "exceptional", evidenceConfidence: 1 }),
    ]);
    // family score clamps to 1 -> full weight 0.30 -> 30
    expect(r.familyScores.operating_growth).toBe(1);
    expect(r.positiveMomentum).toBeCloseTo(30, 10);
  });
});
