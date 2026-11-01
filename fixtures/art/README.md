# Fixture art (Glimmer visual bases)

Status 2026-11-01: **pending** — `node scripts/glimmer-art.mjs` could not
complete (sandbox egress to api.meta.ai hangs ~14/15 attempts; one attempt
returned a bare 404 with no body). Rerun when the network path is healthy:

```bash
npm run build && node scripts/glimmer-art.mjs
```

Expected outputs (backdrop only — MRZ/card-number regions are composed
programmatically in `src/fixtures.ts`, so ground truth is exact either way):

- `aus-passport-glare.png` — fictional AU passport photo page, glare streak
  across laminate, portrait box empty grey, machine-readable zone blank.
- `nsw-dl-tilt.png` — fictional NSW DL front at a slight tilt, portrait box
  empty grey, card-number area blank.

Spend is appended to `docs/spend.md` by the script on success ($0 so far).
