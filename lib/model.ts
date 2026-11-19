// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// early rows the radar exists to find: pre-token protocols below the watchlist floor that pass the
// watchlist's own exclusion rule. Protocols above the floor that the watchlist leaves out are left out
// here too: the house's record marks them as products of another protocol (its parentProtocol field,
// which the snapshot does not carry), so ranking them would rank a product, not a protocol.
//
// Implied value is calibrated on the market the snapshot itself records, not on a hand-picked
// constant. The live-token protocols in the snapshot trade at a median market-cap-to-TVL multiple; a
// pre-token protocol of the same category is valued at its category's median multiple where four or
// more live comparables exist, else at the market-wide median. Then:
//
//   growth   = clamp(change_7d, -60, 120) per cent
//   growthMult   = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity     = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth      = 1 + 0.02 x min(chains, 10)
//   implied      = max(1, round(tvl_usd x multiple x growthMult x maturity x breadth))
//
// The market range of a row applies the 25th and 75th percentile multiples of the same comparables
// to the same formula, so a reader sees what the launch would be worth if the market priced it like
// its category's cheap or expensive half. No protocol name is ever special-cased: the same function
// scores every row, and every constant is stated in the dashboard.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  min_category_n: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 10,
  min_category_n: 4,
  multiple_floor: 0.02,
  multiple_cap: 2.0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many live comparables the detail view shows per category. */
export const COMPARABLES_PER_CATEGORY = 3;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  farm_cost_usd: number;
  model: {
    multiple: number;
    multiple_source: 'category' | 'market';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  farm_cost_usd: number;
  multiple: number;
  multiple_source: 'category' | 'market';
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One live comparable for a detail view: a protocol of the same category that already trades. */
export interface Comparable {
  slug: string;
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  multiple: number;
}

/** One category's calibration: its live comparables' market-cap-to-TVL multiples. */
export interface CategoryCalibration {
  category: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  used: boolean;
}

/** The market calibration, computed from the snapshot's own live protocols. */
export interface Calibration {
  market_median: number;
  market_p25: number;
  market_p75: number;
  live_n: number;
  categories: CategoryCalibration[];
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  comparables: Record<string, Comparable[]>;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or `fallback` when it is empty. */
function medianOf(sorted: number[], fallback: number): number {
  if (sorted.length === 0) return fallback;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A percentile of a sorted array (nearest-rank), or `fallback` when it is empty. */
function percentileOf(sorted: number[], q: number, fallback: number): number {
  if (sorted.length === 0) return fallback;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The market-cap-to-TVL multiple of a live protocol, or null when either figure is missing. */
function multipleOf(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0) return null;
  return p.mcap_usd / p.tvl_usd;
}

/**
 * The market calibration, from the snapshot's own live protocols: the market-wide median multiple
 * and its quartiles, and the same per category. A category's median is only used as a multiple when
 * it has at least min_category_n live comparables; the table still shows every category.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter((p) => !isPreToken(p));
  const all = live.map(multipleOf).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const marketMedian = medianOf(all, 0.25);
  const marketP25 = percentileOf(all, 0.25, marketMedian);
  const marketP75 = percentileOf(all, 0.75, marketMedian);
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const m = multipleOf(p);
    if (m === null) continue;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(m);
    byCategory.set(key, list);
  }
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, values]) => {
      const sorted = values.sort((a, b) => a - b);
      return {
        category,
        n: sorted.length,
        median: round4(medianOf(sorted, marketMedian)),
        p25: round4(percentileOf(sorted, 0.25, marketP25)),
        p75: round4(percentileOf(sorted, 0.75, marketP75)),
        used: sorted.length >= model.min_category_n,
      };
    })
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { market_median: round4(marketMedian), market_p25: round4(marketP25), market_p75: round4(marketP75), live_n: all.length, categories };
}

/** The multiple one category is valued at: its own median where it has enough comparables, else the market's. */
export function multipleFor(category: string | null, calibration: Calibration, model: ModelConstants = MODEL): { multiple: number; source: 'category' | 'market' } {
  const key = category ?? 'Other';
  const row = calibration.categories.find((c) => c.category === key);
  if (row !== undefined && row.used) {
    return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, row.median)), source: 'category' };
  }
  return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.market_median)), source: 'market' };
}

/** The market range's multiples for one category: its quartiles where it has enough comparables, else the market's. */
export function rangeFor(category: string | null, calibration: Calibration, model: ModelConstants = MODEL): { low: number; high: number } {
  const key = category ?? 'Other';
  const row = calibration.categories.find((c) => c.category === key);
  if (row !== undefined && row.used) {
    return {
      low: Math.min(model.multiple_cap, Math.max(model.multiple_floor, row.p25)),
      high: Math.min(model.multiple_cap, Math.max(model.multiple_floor, row.p75)),
    };
  }
  return {
    low: Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.market_p25)),
    high: Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.market_p75)),
  };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  multipleSource: 'category' | 'market';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, source } = multipleFor(protocol.category, calibration, model);
  const range = rangeFor(protocol.category, calibration, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(protocol.chains.length, model.breadth_max_chains);
  const factor = growthMult * maturityMult * breadthMult;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * factor));
  const low = Math.max(1, Math.round(protocol.tvl_usd * range.low * factor));
  const high = Math.max(implied, Math.round(protocol.tvl_usd * range.high * factor));
  return { implied, low, high, multiple, multipleSource: source, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories the watchlist's rule keeps out: wrapped, staked and bridged products, and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** An exchange's name at the start of a protocol's name: its own product, not a protocol awaiting a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, not an exchange, and not a versioned pool. The rule is the
 * watchlist's own, from the snapshot's field guide, so the early radar reads the same record the
 * house's floor does.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if ((p.category ?? '').toLowerCase().includes('bridge')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Whether a chain charges mainnet-scale gas: Ethereum and Bitcoin do, every other chain charges little. */
function isExpensiveChain(chain: string): boolean {
  const c = chain.toLowerCase();
  return c === 'ethereum' || c === 'bitcoin';
}

/** The gas words for a chain, and the dollar figure the farm-cost estimate uses. */
function gasFor(chain: string): { words: string; setupUsd: number; weeklyUsd: number } {
  if (isExpensiveChain(chain)) return { words: 'gas can run $5-20 a transaction on this chain', setupUsd: 12, weeklyUsd: 8 };
  return { words: 'gas is a few cents a transaction on this chain', setupUsd: 1, weeklyUsd: 1 };
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('perps')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and hold the position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a farm that does one thing once is easy to discount. */
function secondActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the deposit and repay it once, so the position shows both sides of the market.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Make one swap through ${name}'s own router, so the wallet's activity is more than the deposit.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount back, so the wallet shows a round trip.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake or delegate the receipt token once, if ${name} offers it, to show a second interaction.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('perps')) return `Close the hedge and open a second small one, so the account shows more than one trade.`;
  if (c.includes('prediction')) return `Resolve the first position and place a second one on a different market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit into a second ${name} vault, so the wallet holds more than one position.`;
  if (c.includes('stable')) return `Swap a small amount of the stable asset through ${name}'s own pool.`;
  if (c.includes('rwa')) return `Claim one yield distribution, so the wallet's activity is recorded on chain.`;
  if (c.includes('insurance')) return `Renew or top up the policy once, so the account shows repeat cover.`;
  if (c.includes('basis')) return `Add a second, smaller deposit a week later, so the position grows over time.`;
  return `Make one more qualifying action, such as a second deposit or a vote.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. The cost estimate is the capital plus a month of gas on its main chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; costUsd: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${action} ${gas.words.charAt(0).toUpperCase() + gas.words.slice(1)}.`,
      cost: `$${capital} of capital and about $${gas.setupUsd} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `about $${gas.weeklyUsd} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas.weeklyUsd} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  const costUsd = capital + gas.setupUsd + gas.weeklyUsd * 4;
  return { steps, costUsd };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor that pass the watchlist's own
  // exclusion rule, every one of them — no cap, no hand-picking. Above the floor, only the watchlist
  // is ranked: the house's record marks the rest as products of another protocol.
  const early = snapshot.protocols.filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd);
  for (const p of early) chosen.set(p.slug, p);

  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    const { steps, costUsd } = farmSteps(p, v.age);
    return { p, v, steps, costUsd };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    farm_cost_usd: s.costUsd,
    model: {
      multiple: round4(s.v.multiple),
      multiple_source: s.v.multipleSource,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: s.steps.map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: multipleOf(p) === null ? null : round4(multipleOf(p)!),
    }));
}

/** The live comparables per board category: the three largest live protocols of that category. */
export function comparablesByCategory(snapshot: Snapshot): Record<string, Comparable[]> {
  const out: Record<string, Comparable[]> = {};
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    const m = multipleOf(p);
    if (m === null) continue;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }
  for (const [category, list] of byCategory) {
    out[category] = list
      .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
      .slice(0, COMPARABLES_PER_CATEGORY)
      .map((p) => ({ slug: p.slug, name: p.name, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd, multiple: round4(multipleOf(p)!) }));
  }
  return out;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    farm_cost_usd: row.farm_cost_usd,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const totalImplied = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: totalImplied,
    calibration,
    rows: board.map(radarRow),
    live,
    comparables: comparablesByCategory(snapshot),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  if (board.length > 4000) return `the board holds ${board.length} rows, over the gate's 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (!(r.implied_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_high_usd)) {
      return `${r.slug} has a market range that does not hold its implied value`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
