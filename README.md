# BtcRaceBot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/qaz19qpl/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/qaz19qpl/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A long-only cbBTC/USDC swing bot for [make.fun/bounty/btc-race-24h-20261118-1444](https://make.fun/bounty/btc-race-24h-20261118-1444), speaking `agent-fun/bars-replay/v1` on 1-minute bars. Node 22, standard library only; `main.ts` at the repo root, the kit's SDK shim copied byte-for-byte under `vendor/`.

## Idea

The dev window is a choppy, net-down day (BTC −2.8%): every kit baseline loses on it (buy-and-hold −$31.6, ema-cross −$148.2, rsi-bollinger −$39.9, momentum −$23.9). A full round trip costs ~26 bps, so the bot trades rarely and only on strong multi-minute signals, all-in, against an exactly tracked cost basis:

- **Dip (snap-back):** when the 30-minute return crosses below −1.2%, buy. A sharp drop in this thin pool snaps back within 15–30 minutes. Exit at +0.8% over cost, −1.5% under it, or after 30 bars.
- **Rally (ride the swing):** when the 60-minute return crosses above +0.5%, buy and ride the multi-hour up-move. Exit at +0.9% over cost, −0.8% under it, −1.2% from the peak close, or after 240 bars.

A 30-bar cooldown after every exit stops one event from re-triggering, and no new entry opens in the last 60 bars of the 1,440-bar window.

## Local grade (dev window)

```
node cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Dev-window result (kit's `grade-local`, process driver, two executions,
L1 regrade reproduced byte for byte): **net PnL +23.389109 USDC, 4 round-trip
trades (8 fills, win rate 0.75), max drawdown 0.0069, fees 3.248297 USDC**
(net PnL at 2x fees +20.132384 USDC; guardrails met). All comparisons are
exact bigint arithmetic on closes and on the position's cost basis, so the bot
is deterministic: no floats, no clock, no randomness, no network, no files
outside `/bot`.

## Layout

- `main.ts` — the bot (the only authored file besides this README)
- `vendor/makefun-bars.ts` — the kit's SDK shim, byte-identical copy
- `.makefun/owner.json` — claim file naming the entry wallet
- `LICENSE` — MIT
