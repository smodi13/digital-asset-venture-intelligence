# v7 judgment packets (dormant)

Human Screening-criterion judgment packets for the v7 digital-asset domain.
See `docs/digital-asset-v7-judgment-protocol.md` for the full workflow.

This directory holds real judgment packets only. It is never used for
research (`research/v7/input/` is the research namespace) and never used for
the active v6 application's analytical inputs (`data/analytical-inputs/`).

## Layout

```
judgments/v7/
  calibration/   CALIBRATION-cohort judgment packets (3C-1A/B/C)
```

`validation/` and `final_test/` subdirectories do not exist yet and must not
be created until their respective phases are authorized. As of Phase 3C-0,
`judgments/v7/calibration/` contains no real judgment packets: this phase
built the harness only, validated against synthetic fixtures
(`tests/judgments-v7/`).

## Commands

```
npm run judgments:v7:validate -- <packet-file-or-dir> [--research <research-packet-dir>]
npm run judgments:v7:build    -- <packet-dir> --batch <BATCH> [--research <research-packet-dir>] [--out <dir>]
npm run judgments:v7:audit    -- <packet-dir> [--research <research-packet-dir>] [--out <report.json>]
```

`--research` defaults to `research/v7/input/`, the frozen CALIBRATION
research corpus at commit `0c10a376c3ccc5df3429d397673b59ab97812b5f`.
