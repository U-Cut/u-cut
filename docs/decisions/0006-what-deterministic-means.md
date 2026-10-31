# 0006. What "deterministic" means

Status: accepted

## Context

The brief asks for a byte-identical plan and a visually identical render.

We rendered the same project five times. Four matched frame for frame. One differed in the 57 frames of a single CSS pan, at a worst SSIM of 0.9987 and PSNR of about 58 dB or better. Nobody can see that difference. Hardware GPU capture and the encoder also differ between machines, and VideoToolbox output is not reproducible at all.

## Decision

- `plan.json` is byte-identical for the same inputs and options. It holds no timestamps, absolute paths or machine details. Media are referred to by content hash and always sorted, so file-system order can't matter. All randomness comes from a seeded PRNG whose seed is stored in the plan.
- A render passes as visually identical at SSIM of at least 0.995 on every sampled frame.
- `EditPlan` carries `schemaVersion`, `aspect`, `fps` and `seed` beyond the fields in the brief's §7, because compose needs them to reproduce a render.

## Consequences

Golden tests compare sampled frames with a tolerance, never file hashes. Running under `--docker` would give byte-identical output but is not required of users.
