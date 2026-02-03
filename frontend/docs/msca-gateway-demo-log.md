# MSCA Gateway Demo Log

**Дата:** 2026-02-02

## Адреса

| Роль | Адрес |
|------|-------|
| EOA Owner/Delegate | `0xAa428314e8C257411de2Cf18B5b1F86349dDdB6E` |
| MSCA (Smart Account) | `0xd62c5b76bce738e1db18d7883ea1c803415f133b` |

## Архитектура Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  MSCA (Circle Modular Wallet пользователя)                       │
│  owner: EOA privateKey                                           │
│                                                                   │
│  1. approve + deposit в Gateway  ← UserOp (batch)                │
│  2. addDelegate(serverEOA)       ← UserOp (1 раз на сеть)        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼  USDC в Gateway, баланс = MSCA address

┌──────────────────────────────────────────────────────────────────┐
│  Сервер (serverEOA = delegate)                                   │
│                                                                   │
│  3. Подписывает burn intent (EIP-712) ← offchain                 │
│     sourceSigner = delegate EOA                                   │
│     sourceDepositor = MSCA address                                │
│  4. POST /transfer → получает attestation                         │
│  5. Вызывает gatewayMint на destination                          │
└──────────────────────────────────────────────────────────────────┘
```

### Почему именно так?

1. **Deposit работает от MSCA** - UserOp с batch (approve + deposit) позволяет MSCA положить USDC в Gateway
2. **Burn intent требует EOA подпись** - Gateway использует EIP-712, а EIP-1271 (smart contract signatures) НЕ поддерживается
3. **Решение: delegate mechanism** - MSCA добавляет EOA как delegate, который может подписывать burn intents от имени MSCA

---

## Начальное состояние

**Timestamp:** 2026-02-02 (start)

### Gateway Unified Balance (MSCA deposits)

| Chain | Balance |
|-------|---------|
| base-sepolia | 1 USDC |
| **Total** | **1 USDC** |

### On-Chain MSCA Balances

| Chain | USDC | Native |
|-------|------|--------|
| base-sepolia | 1 | 0.010 ETH |
| avalanche-fuji | - | - |
| arc-testnet | 0.5 | 0.500 ARC |

---

## Скрипты и их назначение

### 1. `scripts/gateway-msca-flow.ts status`

**Что делает:**
- Создает MSCA setup для получения адреса
- Запрашивает Gateway API `/v1/balances` для unified balance
- Читает on-chain балансы USDC и native для каждой цепи

**Файлы задействованы:**
- `src/lib/aa/circle-smart-account.ts` - создание MSCA
- `src/lib/gateway/api.ts` - `getGatewayBalance()`
- `src/config/chains.ts` - конфигурация цепей

### 2. `scripts/gateway-msca-flow.ts deposit <chain> <amount>`

**Что делает:**
1. Создает MSCA setup для цепи
2. Проверяет USDC баланс на MSCA
3. Строит batch вызовов: `approve(GatewayWallet, amount)` + `deposit(USDC, amount)`
4. Отправляет UserOperation через Circle Bundler

**Файлы задействованы:**
- `src/lib/gateway/operations.ts` - `buildMscaDepositCalls()`
- `src/lib/aa/circle-smart-account.ts` - `sendUserOperation()`

### 3. `scripts/gateway-msca-flow.ts delegate <chain>`

**Что делает:**
1. Создает MSCA setup для цепи
2. Строит вызов: `GatewayWallet.addDelegate(USDC, delegateEOA)`
3. Отправляет UserOperation

**Почему нужен delegate:**
- Gateway burn intent использует EIP-712 подпись
- EIP-1271 (contract signatures) НЕ поддерживается
- Delegate EOA может подписывать burn intents от имени MSCA depositor

**Файлы задействованы:**
- `src/lib/gateway/operations.ts` - `buildAddDelegateCalls()`

### 4. `scripts/gateway-msca-flow.ts transfer <source> <dest> <amount>`

**Что делает:**
1. Проверяет Gateway баланс на source chain
2. Создает burn intent с:
   - `sourceDepositor` = MSCA address
   - `sourceSigner` = delegate EOA
3. Подписывает EIP-712 типизированные данные delegate EOA
4. Отправляет в Gateway API `/v1/transfer`
5. Получает attestation + operator signature
6. Вызывает `gatewayMint(attestation, signature)` на destination через UserOp

**Файлы задействованы:**
- `src/lib/gateway/api.ts` - `initiateMscaTransfer()`, `requestTransfer()`
- `src/lib/gateway/operations.ts` - `buildGatewayMintCalls()`

### 5. `scripts/gateway-msca-flow.ts collect <amount> <sources> <dest>`

**Что делает:**
1. Параллельно получает attestations со всех source chains
2. Последовательно минтит на destination chain

**Используется для:** сбора USDC с нескольких цепей в одну (Arc)

---

## Выполнение Demo

### Цель

Собрать 1 USDC с Base Sepolia в Arc Testnet через Gateway.

**Текущее состояние:**
- Gateway balance на Base Sepolia: 1 USDC (уже задепозичен)
- Delegate: нужно проверить/добавить

---

## Шаг 1: Add Delegate на Base Sepolia

**Timestamp:** 2026-02-03 00:05

```bash
npx ts-node scripts/gateway-msca-flow.ts delegate base-sepolia
```

**Результат:** SUCCESS
- TX: `0x080471c22d26ef23fa2c06b66f0c132fdbd848a48171c421f887b1acb6fa1f33`
- Explorer: https://sepolia.basescan.org/tx/0x080471c22d26ef23fa2c06b66f0c132fdbd848a48171c421f887b1acb6fa1f33

**Что произошло:**
1. MSCA отправил UserOp с вызовом `GatewayWallet.addDelegate(USDC, EOA)`
2. Event `DelegateAdded` эмиттирован
3. Delegate теперь может подписывать burn intents от имени MSCA

---

## Шаг 2: Transfer из Gateway (Base Sepolia → Arc)

**Timestamp:** 2026-02-03 00:15

```bash
npx ts-node scripts/gateway-msca-flow.ts transfer base-sepolia arc-testnet 0.5
```

**Результат:** PARTIAL SUCCESS
- Burn intent создан: SUCCESS
- Attestation получен: SUCCESS
- Mint на Arc: FAILED (gas pricing issue)

**Ошибка mint:**
```
precheck failed: maxPriorityFeePerGas is 4390320 but must be at least 1000000000
```

Arc testnet требует minimum 1 gwei priority fee, а Circle bundler SDK устанавливает слишком низкое значение.

**Attestation данные получены:**
- Source: base-sepolia (domain 6)
- Destination: arc-testnet (domain 26)
- Amount: 0.5 USDC (500000)
- Depositor: MSCA
- Recipient: MSCA
- Signer: EOA delegate

---

## Шаг 3: Fix Gas Pricing для Arc

**Проблема:** Circle bundler для Arc устанавливает `maxPriorityFeePerGas: 0.003 gwei`, а Arc требует минимум `1 gwei`.

**Решение:** Добавлен override в `src/lib/aa/circle-smart-account.ts`:

```typescript
const CHAIN_MIN_GAS: Record<string, { maxPriorityFeePerGas: bigint; maxFeePerGas: bigint }> = {
  'arc-testnet': {
    maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei
    maxFeePerGas: 50_000_000_000n, // 50 gwei
  },
};
```

---

## Шаг 4: Successful Transfer

**Timestamp:** 2026-02-03 00:45

```bash
npx ts-node scripts/gateway-msca-flow.ts transfer base-sepolia arc-testnet 0.4
```

**Результат:** SUCCESS

```
======================================================================
  Transfer Complete!
======================================================================
  Amount: 0.4 USDC
  From:   base-sepolia (Gateway)
  To:     arc-testnet (MSCA wallet)
  TX:     0x77dabbce5748e6c88e4244e522f9505b2287818ddbe751f1d5dc861843ab7d36
  Explorer: https://testnet.arcscan.app/tx/0x77dabbce5748e6c88e4244e522f9505b2287818ddbe751f1d5dc861843ab7d36
```

---

## Финальное состояние

### Gateway Unified Balance

| Chain | Balance |
|-------|---------|
| base-sepolia | 0.079955 USDC |
| **Total** | **0.079955 USDC** |

### On-Chain MSCA Balances

| Chain | USDC | Native |
|-------|------|--------|
| base-sepolia | 1 | 0.010 ETH |
| avalanche-fuji | - | - |
| arc-testnet | **0.803535** | 0.804 ARC |

---

## Итоги Demo

### Что работает

1. **MSCA Deposit** - UserOp с batch (approve + deposit) успешно депозитит USDC в Gateway
2. **Add Delegate** - UserOp добавляет EOA как delegate для подписи burn intents
3. **MSCA Transfer** - Delegate подписывает burn intent, Gateway возвращает attestation
4. **Mint via AA** - UserOp вызывает `gatewayMint` на destination chain

### Выученные уроки

1. **Base Sepolia finality** - ~13-19 мин, delegate не видим сразу после добавления
2. **Arc gas requirements** - требует минимум 1 gwei priority fee, Circle bundler по умолчанию ставит меньше
3. **Gateway rollback** - если mint не проходит, burn может быть откачен (не всегда)

### Команды

```bash
# Статус
npx ts-node scripts/gateway-msca-flow.ts status

# Deposit USDC в Gateway
npx ts-node scripts/gateway-msca-flow.ts deposit <chain> <amount>

# Добавить delegate (один раз на сеть)
npx ts-node scripts/gateway-msca-flow.ts delegate <chain>

# Transfer из Gateway
npx ts-node scripts/gateway-msca-flow.ts transfer <source> <dest> <amount>

# Collect с нескольких источников
npx ts-node scripts/gateway-msca-flow.ts collect <amount> <src1,src2> <dest>
```

