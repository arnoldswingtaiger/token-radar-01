# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arnoldswingtaiger/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arnoldswingtaiger/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: a program that reads a sealed snapshot of the protocol universe
(DefiLlama data, 758 protocols) and writes a web dashboard ranking the
pre-token protocols by implied launch value, each with a concrete farm plan.

## The model (radar-2)

Implied value is calibrated on the market the snapshot itself records, not on
a hand-picked constant:

```
multiple  = median mcap/TVL of live protocols in the same category
            (4+ comparables), else the market-wide median
implied   = tvl_usd x multiple x growth x maturity x breadth
```

- **growth** = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
- **maturity** = 0.6 + min(age_days, 1095) / 1095 x 0.4 (unknown age: 365 days)
- **breadth** = 1 + 0.02 x min(chains, 10)

The board covers all 40 watchlist protocols plus every pre-token protocol
below the $50M floor that passes the same exclusion rule (no wrapped, staked
or bridged product, no exchange, no versioned pool): 178 rows. Protocols
above the floor that the watchlist leaves out are left out here too, since
the house's record marks them as products of another protocol. Every row
carries a 7-step farm plan derived from its own category, chains, TVL and
age, with a cost and a time for each step. The dashboard also shows a market
range (25th/75th percentile multiples), live-token comparables per category,
a model sandbox that re-ranks the board live, and the full calibration table.

Implied value is a model, not a promise — and a protocol "records no token",
never "has no token": DefiLlama's record is not proof.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Reads the snapshot, writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory. Node 22+,
standard library only, no network. Deterministic: two runs write the same
bytes.

## Layout

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the
  output and the dossier.
- `lib/model.ts` — the radar-2 model, the board builder, farm plans and the
  dashboard data.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as
  the kit ships it.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No
  network; all data comes from `data.js` beside it.
- `screenshots/` — the three screenshots the dossier carries: the board, a
  protocol's detail view, and a filtered view.

## Screenshots

The three screenshots are taken from the built dashboard in a browser at
1280x800 (long side at most 1440, short side at least 800, each under
512 KiB, ideally 300-350 KiB):

1. `1-board.png` — the board, default view (`dashboard/index.html`).
2. `2-detail.png` — a protocol's detail view, rank 1 open
   (`dashboard/index.html#p=<rank-1 slug>`).
3. `3-filtered.png` — a filtered view, e.g. one category
   (`dashboard/index.html#category=<category>`).

---

Entered on [make.fun](https://make.fun/?ref=zv5hc3pw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
