# OmniFlow

**Payments orchestration protocol. One API. One Balance. Any Chain.**

> HackMoney 2026 submission

---

## The Problem

Tokens and USDC are scattered across chains with no unified way to manage them. An organization paying 50 contributors across 5 chains needs 50 separate transactions, native gas tokens on every chain, and manual tracking. There is no single balance, no single API, no single flow.

## The Solution

OmniFlow is a hub-and-spoke payments protocol that unifies fragmented crypto liquidity into a single USDC balance across all chains.

- **Deposit** any token from any chain — auto-swaps to USDC and settles on the hub
- **Pay out** to any chain in any token recipients actually want
- **Batch payouts** — any recipients, any chains, any tokens, one API call
- **Passkey auth** — FaceID/TouchID signs every transaction, no seed phrases
- **Fully non-custodial** — every user owns their Modular Smart Contract Account (MSCA)
- **ENS payment routing** — send to `alice.eth`, OmniFlow reads on-chain preferences and auto-routes

---

## Live Links

| What | URL |
|------|-----|
| Backend API | [omniflow.up.railway.app](https://omniflow.up.railway.app) |
| Frontend Dashboard | [omniflow-app.up.railway.app](https://omniflow-app.up.railway.app/#onboarding) |

---

## Architecture

**Hub-and-spoke model.** Every deposit flows inward (any chain → Arc hub), every payout flows outward (Arc hub → any chain). This reduces routing from N×(N-1) cross-chain paths to just 2N. Arc is the invisible center — users never see it.

**Why Arc as the hub.** Arc is Circle's purpose-built L1 — the USDC issuer's own chain. This gives OmniFlow properties no other hub can match: 1-second finality for instant settlement, native USDC as the base asset (no bridged/wrapped tokens on the hub itself), Circle Gas Station sponsoring all hub transactions, and first-class support for Circle Modular Wallets + Gateway. The hub chain is where all liquidity rests — it must be the most trusted, fastest, and cheapest chain in the topology. Arc is the only chain that checks all three boxes.

**Deployment strategy.** The full flow is validated end-to-end on **Arc testnet** ([example tx](https://testnet.arcscan.app/tx/0x77dabbce5748e6c88e4244e522f9505b2287818ddbe751f1d5dc861843ab7d36)). For the mainnet demo with real liquidity, the hub currently runs on Polygon — the architecture is chain-agnostic by design, and switching the hub is a [single config line](https://github.com/gliry/payments/blob/main/backend/src/circle/config/chains.ts#L86). Once Arc mainnet launches, OmniFlow migrates to its intended home with zero code changes.

---

## Transaction Examples

### 1. Onboarding — Passkey Register + Smart Account Deploy

The user taps FaceID once. Behind the scenes, a Passkey credential is created, a deterministic MSCA address is computed via CREATE2, and the contract deploys automatically on first UserOp.

```
User taps FaceID
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  WebAuthn / Passkey                                 │
│  Create credential (public key + credential ID)     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Circle Modular Wallets SDK                         │
│  Compute deterministic MSCA address (CREATE2)       │
│  Address is known before deployment                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  First UserOp triggers deployment
┌─────────────────────────────────────────────────────┐
│  Single atomic UserOp (one biometric tap):          │
│                                                     │
│  1. Deploy MSCA contract (initCode)                 │
│  2. approve(USDC, Gateway)                          │
│  3. Gateway.deposit(USDC, amount)                   │
│  4. Gateway.addDelegate(EOA)                        │
│  5. transfer(fee, protocol)                         │
│                                                     │
│  Gas: sponsored by Circle Gas Station (paymaster)   │
└─────────────────────────────────────────────────────┘
```

Code: [`app/js/auth.js:76`](https://github.com/gliry/payments/blob/main/app/js/auth.js#L76) — Passkey registration, [`app/js/userop.js:95`](https://github.com/gliry/payments/blob/main/app/js/userop.js#L95) — UserOp batching

### 2. Deposit via LI.FI — Any Token → USDC → Hub

User holds WETH on Arbitrum. They deposit into OmniFlow — LI.FI swaps to USDC, Gateway bridges to the hub. One biometric tap.

```
User: "Deposit 0.5 WETH from Arbitrum"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  LI.FI Quote API                                    │
│  Route: WETH (Arbitrum) → USDC (Arbitrum)           │
│  Aggregates 1inch / Paraswap / Uniswap              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Single atomic UserOp on Arbitrum:                  │
│                                                     │
│  1. approve(WETH, LI.FI router)                     │
│  2. LI.FI swap execute (WETH → USDC)               │
│  3. approve(USDC, Gateway)                          │
│  4. Gateway.deposit(USDC, swapped amount)           │
│  5. transfer(fee, protocol)                         │
│                                                     │
│  Gas: sponsored by paymaster                        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  Circle Gateway
┌─────────────────────────────────────────────────────┐
│  Burn USDC on Arbitrum                              │
│  Attestation from Circle                            │
│  Mint native USDC on Arc (hub)                      │
└─────────────────────────────────────────────────────┘

Result: USDC appears in unified balance on Arc hub
```

Code: [`app/js/lifi.js:16`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L16) — LI.FI quote, [`app/js/screens/deposit.js:793`](https://github.com/gliry/payments/blob/main/app/js/screens/deposit.js#L793) — swap + collect flow

### 3. Payout via LI.FI — Hub USDC → Any Token on Any Chain

Recipient wants DAI on Optimism. OmniFlow bridges USDC from the Arc hub to the destination chain, then swaps to DAI on-site.

```
API call: POST /operations/send
  { recipient: "0x...", chain: "optimism", token: "DAI", amount: "100" }
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Backend prepares sign requests                     │
│  LI.FI quote: USDC (Optimism) → DAI (Optimism)     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼  Circle Gateway
┌─────────────────────────────────────────────────────┐
│  Burn USDC on Arc (hub)                             │
│  Attestation from Circle                            │
│  Mint native USDC on Optimism (destination)         │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Single atomic UserOp on Optimism:                  │
│                                                     │
│  1. Gateway.mint(attestation, signature)            │
│  2. approve(USDC, LI.FI router)                     │
│  3. LI.FI swap execute (USDC → DAI)                │
│  4. transfer(DAI, recipient)                        │
│                                                     │
│  Gas: sponsored by paymaster                        │
└─────────────────────────────────────────────────────┘

Result: Recipient receives DAI on Optimism
```

Code: [`backend/src/lifi/lifi.service.ts:82`](https://github.com/gliry/payments/blob/main/backend/src/lifi/lifi.service.ts#L82) — swap + deposit calls, [`backend/src/circle/gateway/gateway.service.ts:151`](https://github.com/gliry/payments/blob/main/backend/src/circle/gateway/gateway.service.ts#L151) — Gateway burn/mint

### 4. Batch Payout — Multiple Recipients, Chains, Tokens in One Call

One API call distributes funds to N recipients across different chains and tokens. Each destination gets its own Gateway bridge + optional LI.FI swap.

```
API call: POST /operations/batch-send
{
  recipients: [
    { address: "alice.eth",  chain: "base",      token: "USDC",  amount: "500"  },
    { address: "bob.eth",    chain: "arbitrum",   token: "WETH",  amount: "200"  },
    { address: "0xCarol...", chain: "optimism",   token: "DAI",   amount: "300"  },
    { address: "0xDave...",  chain: "avalanche",  token: "USDC",  amount: "150"  },
    { address: "eve.eth",    chain: "polygon",    token: "USDC",  amount: "100"  }
  ]
}
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Backend: resolve ENS → addresses + preferences     │
│  Group by destination chain                         │
│  Get LI.FI quotes for non-USDC recipients           │
│  Build sign requests per chain                      │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┬────────────┐
          ▼            ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  Base    │ │ Arbitrum │ │ Optimism │ │Avalanche │
    │          │ │          │ │          │ │          │
    │ Gateway  │ │ Gateway  │ │ Gateway  │ │ Gateway  │
    │ bridge + │ │ bridge + │ │ bridge + │ │ bridge + │
    │ transfer │ │ LI.FI    │ │ LI.FI    │ │ transfer │
    │ USDC     │ │ → WETH   │ │ → DAI    │ │ USDC     │
    └──────────┘ └──────────┘ └──────────┘ └──────────┘


Result: 5 recipients, 4 chains, 3 tokens — one API call
```

Code: [`backend/src/operations/operations.service.ts:917`](https://github.com/gliry/payments/blob/main/backend/src/operations/operations.service.ts#L917) — batch send preparation, [`app/js/screens/batch.js:419`](https://github.com/gliry/payments/blob/main/app/js/screens/batch.js#L419) — ENS auto-routing in batch UI

---

## Project Structure

| Directory | Description |
|-----------|-------------|
| `app/` | Vanilla JS dashboard — ES6 modules, custom router, no build step |
| `backend/` | NestJS backend — Prisma ORM + SQLite + PostgreSQL, Circle SDK, LI.FI, Gateway |
| `frontend/` | First tests of idea frontend and scripts |
| `demo/` | Demo scripts and presentation materials |

---

## Prize Track: Arc (Circle)

Arc is the core of OmniFlow. We chose Arc as the hub chain because it is the USDC issuer's own L1 with 1-second finality, native USDC as the base asset, and deep integration with the full Circle developer stack. Every deposit settles on Arc, every payout originates from Arc. The entire protocol is built around Arc as the invisible liquidity center.

### Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub

- **Arc as liquidity hub** — hub-and-spoke model reduces N×(N-1) cross-chain paths to just 2N. All USDC consolidates on Arc, invisible to the user. → [`backend/src/circle/config/chains.ts:20`](https://github.com/gliry/payments/blob/main/backend/src/circle/config/chains.ts#L20) (AA_GATEWAY_CHAINS), [`:86`](https://github.com/gliry/payments/blob/main/backend/src/circle/config/chains.ts#L86) (HUB_CHAIN)
- **Circle Gateway** — native USDC burn-attestation-mint across chains. No wrapped tokens, no liquidity pools. Real native USDC on every chain. → [`backend/src/circle/gateway/gateway.service.ts:111`](https://github.com/gliry/payments/blob/main/backend/src/circle/gateway/gateway.service.ts#L111) (createBurnIntent), [`:151`](https://github.com/gliry/payments/blob/main/backend/src/circle/gateway/gateway.service.ts#L151) (signAndSubmitBurnIntent), [`:328`](https://github.com/gliry/payments/blob/main/backend/src/circle/gateway/gateway.service.ts#L328) (executeMint)
- **Circle Wallets (Passkey / MSCA)** — ERC-4337 smart accounts with WebAuthn signer. One Passkey controls accounts on all chains. Lazy deployment via CREATE2 — address is known before contract exists. → [`app/js/auth.js:76`](https://github.com/gliry/payments/blob/main/app/js/auth.js#L76) (registerPasskey)
- **AA Batching** — approve + swap + transfer + bridge + fee collapsed into a single atomic UserOp with one biometric confirmation → [`app/js/userop.js:95`](https://github.com/gliry/payments/blob/main/app/js/userop.js#L95) (signAndSubmitUserOps)
- **Cross-chain deposit & mint calls** → [`frontend/src/lib/gateway/operations.ts:97`](https://github.com/gliry/payments/blob/main/frontend/src/lib/gateway/operations.ts#L97) (buildGatewayDepositCalls), [`:137`](https://github.com/gliry/payments/blob/main/frontend/src/lib/gateway/operations.ts#L137) (buildGatewayMintCalls)

### Build Global Payouts and Treasury Systems with USDC on Arc

- **Batch payouts** — N recipients, M chains, K tokens, one API call. Backend groups by destination chain, builds Gateway bridges + optional LI.FI swaps per destination. → [`backend/src/operations/operations.service.ts:917`](https://github.com/gliry/payments/blob/main/backend/src/operations/operations.service.ts#L917) (prepareBatchSend)
- **Single cross-chain send** — prepare and execute a single transfer from hub to any destination chain → [`backend/src/operations/operations.service.ts:408`](https://github.com/gliry/payments/blob/main/backend/src/operations/operations.service.ts#L408) (prepareSend)
- **Unified treasury on Arc** — all deposits flow inward to Arc, all payouts flow outward. Single balance, single dashboard.
- Policy-based payouts via ENS — recipients store preferred chain + token in ENS text records, payout auto-routes → [`app/js/screens/batch.js:469`](https://github.com/gliry/payments/blob/main/app/js/screens/batch.js#L469)
- Fee calculation (Gateway fee BPS, cross-chain fee) → [`backend/src/operations/operations.service.ts:29`](https://github.com/gliry/payments/blob/main/backend/src/operations/operations.service.ts#L29)

### Additional Arc (Circle) tools used:

- **Circle Gas Station** — paymaster sponsors all hub transactions, users never hold native gas tokens → [`app/js/userop.js:133`](https://github.com/gliry/payments/blob/main/app/js/userop.js#L133)
- **Circle Bundler** — submits UserOperations to the network → [`app/js/userop.js:11`](https://github.com/gliry/payments/blob/main/app/js/userop.js#L11) (BUNDLER_RPCS for 5 chains)
- **Delegate workaround MSCA ↔ Gateway** — Gateway requires EIP-712 (EOA only, no EIP-1271). We add an EOA delegate to the MSCA via `addDelegate()` with limited permissions. Direct product feedback for Circle — Gateway and Modular Wallets don't work together out of the box, and we bridged the gap. → [`backend/src/wallet/wallet.service.ts:68`](https://github.com/gliry/payments/blob/main/backend/src/wallet/wallet.service.ts#L68), [`frontend/src/lib/gateway/operations.ts:195`](https://github.com/gliry/payments/blob/main/frontend/src/lib/gateway/operations.ts#L195) (buildAddDelegateCalls)
- **Atomic fee collection** — protocol fees collected inside the same UserOp batch as the payment. On-chain guarantee: impossible to execute payment without fee, impossible to charge fee without payment. → [`backend/src/operations/operations.service.ts:29`](https://github.com/gliry/payments/blob/main/backend/src/operations/operations.service.ts#L29)

---

## Prize Track: LI.FI

LI.FI powers any-token support on both ends of the flow. Users deposit any token from any chain — it auto-swaps to USDC and settles on Arc. Recipients receive any token they want on any chain.

### Best Use of LI.FI Composer in DeFi

- **Any-token deposit (swap → USDC → collect)** — LI.FI swap embedded in AA UserOp batch: approve + swap + deposit + fee execute atomically with a single biometric signature. → [`app/js/lifi.js:16`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L16) (getQuote), [`app/js/screens/deposit.js:773`](https://github.com/gliry/payments/blob/main/app/js/screens/deposit.js#L773) (handleCollect)
- **Any-token payout (USDC → swap → recipient token)** — USDC auto-swaps to the recipient's preferred token on the destination chain. Gateway mint + LI.FI swap in one atomic UserOp. → [`backend/src/lifi/lifi.service.ts:82`](https://github.com/gliry/payments/blob/main/backend/src/lifi/lifi.service.ts#L82) (buildSwapAndDepositCalls)
- **Swap calls in UserOp call array** — raw LI.FI transaction data embedded directly into the UserOp call array alongside deposit, bridge, and fee calls. No separate transactions. → [`frontend/src/lib/lifi/api.ts:259`](https://github.com/gliry/payments/blob/main/frontend/src/lib/lifi/api.ts#L259) (buildLifiSwapCalls)

### Best LI.FI-Powered DeFi Integration

- **Cross-chain routing via quote API** — aggregates DEXes (1inch, Paraswap, Uniswap) for optimal routes across all supported chains → [`backend/src/lifi/lifi.service.ts:23`](https://github.com/gliry/payments/blob/main/backend/src/lifi/lifi.service.ts#L23) (getQuote)
- **Multi-chain deposit collection** — collect non-USDC tokens from multiple chains in parallel, each with its own LI.FI swap route → [`app/js/screens/deposit.js:773`](https://github.com/gliry/payments/blob/main/app/js/screens/deposit.js#L773)
- Approve data builder → [`app/js/lifi.js:45`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L45)
- USDC output estimation → [`app/js/lifi.js:61`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L61)
- Backend swap call builder → [`backend/src/lifi/lifi.service.ts:47`](https://github.com/gliry/payments/blob/main/backend/src/lifi/lifi.service.ts#L47) (buildSwapCalls)

### Additional LI.FI tools used:

- **LI.FI Quote API** — SDK-less, direct fetch integration → [`app/js/lifi.js:16`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L16), [`backend/src/lifi/lifi.service.ts:23`](https://github.com/gliry/payments/blob/main/backend/src/lifi/lifi.service.ts#L23)
- **Supported tokens discovery** → [`app/js/lifi.js:70`](https://github.com/gliry/payments/blob/main/app/js/lifi.js#L70)

---

## Prize Track: ENS

ENS becomes a payment routing protocol. Recipients store preferences on-chain, senders auto-route. This is not an afterthought — ENS is a core part of the payout UX.

### Most Creative Use of ENS for DeFi

- **Custom `com.omniflow.*` namespace** — `com.omniflow.chain`, `com.omniflow.token` stored as ENS text records → [`app/js/ens.js:309`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L309) (DEFI_PREF_KEYS)
- **DeFi Payment Preferences resolution** — resolves address, reads all `com.omniflow.*` text records in parallel, auto-configures payout route (chain + token + slippage) → [`app/js/ens.js:373`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L373) (getDefiPreferences)
- **Combined resolution (address + prefs)** — single call returns both the resolved address and all DeFi preferences → [`app/js/ens.js:390`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L390) (resolveENS)
- **Batch send ENS auto-routing** — each ENS name in batch send gets its own preferences resolved. If alice.eth wants WETH on Arbitrum and bob.eth wants DAI on Optimism — one API call routes both correctly. → [`app/js/screens/batch.js:469`](https://github.com/gliry/payments/blob/main/app/js/screens/batch.js#L469) (debouncedResolve + resolveENS)

### Integrate ENS

- **Pure JS keccak256** — zero-dependency from-scratch implementation of the Keccak-256 hash function → [`app/js/ens.js:44`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L44)
- **ENS namehash (ENSIP-1)** — standard recursive hashing per ENSIP-1 specification → [`app/js/ens.js:191`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L191)
- **On-chain ENS resolution** — direct RPC calls to ENS Registry + Public Resolver, no library wrappers → [`app/js/ens.js:337`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L337) (resolveAddress)
- Text record reading → [`app/js/ens.js:353`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L353) (getTextRecord)
- ENS name detection → [`app/js/ens.js:326`](https://github.com/gliry/payments/blob/main/app/js/ens.js#L326) (isENSName)

### Additional ENS tools used:

- **ENS Registry + Public Resolver** — direct RPC calls, no library wrappers
- **Gasless preference setting** — setting ENS text records is batched into a single gasless UserOp via AA → [`app/js/userop.js:95`](https://github.com/gliry/payments/blob/main/app/js/userop.js#L95)

---

Built at HackMoney 2026.

---

