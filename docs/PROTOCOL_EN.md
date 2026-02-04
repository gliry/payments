# OmniFlow Protocol


## What is it

OmniFlow is a Stripe-like API for crypto payments. One balance, any chain, any token.

**Problem:**
- USDC is fragmented across chains — no unified balance
- Gas management — native tokens required on each chain
- No tools for mass payouts (batch payouts)
- Complex integration: 4 separate Circle APIs with no orchestration

**Solution:**

Arc is an invisible liquidity hub. All deposits flow into Arc via Circle Gateway (CCTP V2). Payouts are routed to any chain in any token.


## How it works

**Scenario: a business accepts payments via API**

A business integrates the OmniFlow API. The customer makes a single `approve()` — the payment is accepted.
Funds arrive in the business's unified balance on Arc, regardless of the source chain.
From there, the business manages funds from a single balance: batch payouts to contractors
in any chain and token, off-ramp to fiat, analytics.

The same API works for personal use — the user transfers funds to their unified hub
and manages them through a single interface.

**One `approve()` — and that's it**

Two scenarios depending on whether the user is already onboarded:

- **New user (EOA):** makes an `approve()` from their EOA wallet. The next transaction, the protocol sends a batch: deploy MSCA → transfer funds from EOA to AA → all necessary swaps → bridge to Arc
- **Existing user (already in AA):** no `approve()` needed — the flow is triggered directly from their MSCA

**What happens under the hood**

All this simplicity is powered by two mechanisms:

- **Lazy deploy:** AA wallets (MSCA) are deployed **not at registration, but at the moment of first interaction** with a specific chain. When a user initiates a deposit from Arbitrum — AA is deployed on Arbitrum and Arc. When they make a payout to Base — AA is deployed on Base. Keys are bound to the user's Passkey. At every stage, funds remain under the user's full control — the protocol never takes custody.
- **Automatic flow:** From there, everything is automatic: burn on the source chain, mint on Arc, fee collection, payout to destination, interaction with modules. Every step is executed from the user's AA wallet — funds never leave their control at any stage. Automation ≠ custody.


## Key properties

1. **Non-custodial + full chain abstraction**
2. **Gasless** — complete gas elimination
3. **Atomic fee collection** via AA batch
4. **Pluggable modules** (inputs/outputs)
5. **ENS resolution** — human-readable addresses instead of 0x...
6. **Batch payouts** — to any chain, in any token


### 1. Non-custodial + Chain Abstraction

- The user doesn't see Arc as a chain — for them it's simply "balance" and "transaction history"
- Arc is fully hidden behind the API: a deposit from Arbitrum looks like "received $10,000", not "CCTP mint on Arc domain 26"
- The architecture is **fully non-custodial** — keys belong to the user (Passkey/WebAuthn), the MSCA wallet is theirs
- Full transaction history is on-chain and verifiable, despite the UX abstraction
- A single Passkey controls all AAs — the user owns funds everywhere
- Protocol = orchestration, not custody: automation is complete, but funds never leave the user's control at any step


### 2. Gasless

- All transactions on Arc are sponsored by Circle Gas Station
- Cross-chain gas is included in the service fee
- The user's only action — `approve()` — can be fully sponsored via Gas Station, ensuring zero barrier to entry
- The user never holds or manages native tokens


### 3. Atomic fee collection

In the AA UserOp batch, the fee is collected atomically alongside the main operation. The user sees a single action; under the hood, the protocol deducts the service fee and routes the remainder.


### 4. Pluggable modules

OmniFlow is a protocol with pluggable input and output modules. Arc is the settlement core, and any new payment rail connects via an adapter without changing the core.

- AA wallets are deployed on each chain where interaction is needed
- Modules (LI.FI, off-ramp, cards) are called from the AA on the destination chain

**Planned partnerships:**
- **On-ramp (fiat→crypto)**
- **Off-ramp (crypto→fiat)**
- **Crypto cards**


### 5. ENS resolution

Human-readable addresses instead of 0x...


### 6. Batch payouts

Single and batch payouts — to any chain, in any token (LI.FI swap).


### 7. Onboarding and access

- **Account creation:** Passkey (WebAuthn), non-custodial MSCA wallet on Arc
- **Account access:** TouchID, FaceID and other authentication methods
- **Deposit from any chain:** USDC from 12+ chains → unified balance on Arc
