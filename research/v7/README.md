# research/v7 (dormant)

This directory holds v7 research packets: the input to the harness in
`lib/research-v7/**` and `scripts/research-v7/**`. See
`docs/digital-asset-v7-research-ingestion.md` for the full packet format and
workflow, and `docs/digital-asset-v7-research-methodology.md` for the
underlying v7 domain model.

## Status

Dormant. `input/` is empty except for `.gitkeep`. No real Phase 3A universe
entity has been researched here. Do not add real research for the 44-entity
universe until Phase 3B-0 has been reviewed and Phase 3B-1 is explicitly
authorized.

## Layout

```
research/v7/
  README.md
  input/            one YAML packet per entity, added starting Phase 3B-1
```

## Adding a packet (once authorized)

1. Copy the packet shape documented in
   `docs/digital-asset-v7-research-ingestion.md`.
2. Validate it: `npm run research:v7:validate -- research/v7/input --universe <contract-dir>`.
3. Once a full batch (CALIBRATION, VALIDATION, or FINAL_TEST) validates clean,
   compile it: `npm run research:v7:build -- research/v7/input --batch CALIBRATION --universe <contract-dir>`.
4. Run the integrity audit: `npm run research:v7:audit -- research/v7/input --universe <contract-dir>`.

The universe/cohort contract path is never hardcoded here or in tracked
source; supply it explicitly on each command.
