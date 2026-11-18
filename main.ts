// BtcRaceBot: a long-only cbBTC/USDC swing bot for agent-fun/bars-replay/v1.
//
// The dev window (1,440 one-minute bars) is a choppy, net-down day: BTC falls
// 2.8% overall, but it moves in multi-hour swings of 1-2% and snaps back fast
// after sharp drops. Every baseline in the kit loses on it (buy-and-hold
// -31.6 USDC, ema-cross -148.2, rsi-bollinger -39.9, momentum -23.9), because
// they either hold through the downtrend or churn on 1-minute noise while a
// full round trip costs ~26 bps in fees, slippage and impact. So this bot
// trades rarely, only on strong multi-minute signals, all-in, with a cost
// basis it tracks exactly:
//
//   - DIP (snap-back): when the 30-minute return crosses below -1.2%, buy.
//     A sharp drop in this thin pool snaps back within 15-30 minutes.
//     Exit at +0.8% over cost, -1.5% under it, or after 30 bars.
//   - RALLY (ride the swing): when the 60-minute return crosses above
//     +0.5%, buy and ride the multi-hour up-move. Exit at +0.9% over cost,
//     -0.8% under it, -1.2% from the peak close, or after 240 bars.
//
// A 30-bar cooldown after every exit stops one event from re-triggering,
// and no new entry is opened in the last 60 bars of the 1440-bar window,
// where a position could not be exited properly before the final flatten.
//
// Every comparison is exact bigint arithmetic on the closes and on the
// position's cost basis (fees included), so the bot is deterministic: no
// floats, no clock, no randomness, no network, no files outside /bot.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** A reply never carries more than this slippage past the latest close. */
const MAX_SLIPPAGE_BPS = 100;

/** Dip entry: 30-minute return crossing below -1.2%. */
const DIP_NUM = 988n;
/** Rally entry: 60-minute return crossing above +0.5%. */
const RAL_NUM = 1005n;

/** Dip exit: +0.8% over cost, -1.5% under it, or 30 bars held. */
const DIP_TP = 1008n;
const DIP_SL = 985n;
const DIP_HOLD = 30;
/** Rally exit: +0.9% over cost, -0.8% under it, -1.2% from the peak close, or 240 bars held. */
const RAL_TP = 1009n;
const RAL_SL = 992n;
const RAL_TRAIL = 988n;
const RAL_HOLD = 240;

/** Bars to wait after an exit before the next entry. */
const COOLDOWN = 30;
/** No new entry on batch 1380 or later (the window is 1,440 bars). */
const LATE_CUTOFF_SEQ = 1380;

type Mode = 'dip' | 'ral' | null;

/** Closes seen so far, oldest first, at the symbol's price_scale. */
const closes: bigint[] = [];
let mode: Mode = null;
let entrySeq = 0;
let peakClose = 0n;
let lastExitSeq = -1_000_000_000;

function r30Down(): boolean {
  // closes[n-1] / closes[n-31] - 1 <= -1.2%, and the bar before did not.
  if (closes.length < 32) return false;
  const now = closes[closes.length - 1]! * 1000n <= closes[closes.length - 31]! * DIP_NUM;
  const before = closes[closes.length - 2]! * 1000n <= closes[closes.length - 32]! * DIP_NUM;
  return now && !before;
}

function r60Up(): boolean {
  // closes[n-1] / closes[n-61] - 1 >= +0.5%, and the bar before did not.
  if (closes.length < 62) return false;
  const now = closes[closes.length - 1]! * 1000n >= closes[closes.length - 61]! * RAL_NUM;
  const before = closes[closes.length - 2]! * 1000n >= closes[closes.length - 62]! * RAL_NUM;
  return now && !before;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const held = state.positions.get(SYMBOL);

    if (held !== undefined) {
      if (close > peakClose) peakClose = close;
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      let exit = false;
      if (mode === 'dip') {
        exit =
          value * 1000n >= cost * DIP_TP ||
          value * 1000n <= cost * DIP_SL ||
          state.seq - entrySeq >= DIP_HOLD;
      } else {
        exit =
          value * 1000n >= cost * RAL_TP ||
          value * 1000n <= cost * RAL_SL ||
          close * 1000n <= peakClose * RAL_TRAIL ||
          state.seq - entrySeq >= RAL_HOLD;
      }
      if (exit) {
        lastExitSeq = state.seq;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: any mode left over belongs to an entry that never filled.
    mode = null;
    if (state.seq - lastExitSeq < COOLDOWN) return [];
    if (state.seq >= LATE_CUTOFF_SEQ) return [];

    let next: Mode = null;
    if (r60Up()) next = 'ral';
    else if (r30Down()) next = 'dip';
    if (next === null) return [];

    const room = state.weightRoom(SYMBOL);
    const amount = state.cash < room ? state.cash : room;
    if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    mode = next;
    entrySeq = state.seq;
    peakClose = close;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
