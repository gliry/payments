# ArcFlow: Детализация API, Позиционирование и MVP

## 1. Позиционирование

### 1.1 Конкурентный анализ

| Решение | Что делает | Недостатки |
|---------|------------|------------|
| **Circle APIs** | Инфраструктура: Wallets, Gateway, CCTP | Низкий уровень, нужна оркестрация, нет batch |
| **Stripe** | Фиат платежи, Connect для маркетплейсов | Нет крипто (кроме fiat onramp) |
| **Coinbase Commerce** | Приём криптоплатежей | Только входящие, нет payouts |
| **Request Network** | Инвойсы и запросы платежей | Сложный, требует своих контрактов |
| **Gnosis Pay** | Карты + крипто | Consumer-focused, не API |

### 1.2 Уникальное предложение ArcFlow

```
"Stripe для крипто-платежей"

1. ОДИН API вместо 4-х Circle API
2. Мультичейн = один баланс (Arc как хаб)
3. Batch payouts в один вызов
4. Internal transfers = instant + free
5. ENS/адреса — без разницы для разработчика
```

### 1.3 Target Audience

**Primary (для хакатона):**
- Web3 стартапы с payroll нуждами (DAO, протоколы)
- Криптокомпании платящие контракторам
- Маркетплейсы с выплатами продавцам

**Secondary (post-hackathon):**
- Fintech компании входящие в Web3
- Традиционный бизнес принимающий крипто

### 1.4 Почему Circle не скопирует

1. **Конфликт интересов** — Circle продаёт инфраструктуру, не готовые решения
2. **Network effect** — чем больше пользователей ArcFlow, тем ценнее internal transfers
3. **Разный фокус** — Circle = "AWS для крипто", ArcFlow = "Stripe для крипто"

### 1.5 Зачем пользователям держать деньги на Arc? (vs Gateway)

**Проблема:** Gateway уже даёт unified balance. Зачем Arc?

**Ответ:** Gateway = API, Arc = programmable wallets + UX

| Без Arc Hub | С Arc Hub |
|-------------|-----------|
| Gateway = только API | **AA Wallet** = твои средства |
| Газ нужен в каждой сети | **Gasless** через Gas Station |
| Кастодиальные решения | **Non-custodial** — ключи у тебя |
| Bridge fees на каждый перевод | **Internal transfers = free** |
| 5 кошельков в 5 сетях | **Один баланс, один dashboard** |

**Ключевые преимущества Arc Hub:**

1. **Non-custodial** — средства в твоём AA wallet, не у третьей стороны
2. **Gasless everywhere** — Gas Station спонсирует все операции
3. **Internal network** — переводы между users = instant + free
4. **Single balance** — deposit из любой сети, один unified view
5. **Batch operations** — 50 payouts в один вызов

**Flywheel:**
```
Держишь на Arc → Gasless payouts → Другие тоже хотят на Arc → Network effect → Ещё выгоднее держать
```

### 1.6 Монетизация (Revenue Model)

**Принцип:** Протокол берёт комиссию с каждой операции (как Stripe ~2.9%)

#### Варианты архитектуры сбора комиссий:

**Вариант A: Mint → AA Wallet → Fee deduction**
```
[Source Chain]                    [Arc]
     │                              │
     │  CCTP mint                   │
     └──────────────────────────────┼───→ User AA Wallet
                                    │         │
                                    │         │ автоматический
                                    │         │ transfer fee
                                    │         ▼
                                    │    ArcFlow Treasury
```
- ✅ Простая архитектура (используем Circle Wallets как есть)
- ✅ Прозрачно для пользователя (видит mint на свой адрес)
- ⚠️ Требует доп. транзакцию для сбора fee
- ⚠️ Gas на fee transfer (но Circle Gas Station спонсирует)

**Вариант B: Mint → ArcFlow Router Contract → AA Wallet** 
```
[Source Chain]                    [Arc]
     │                              │
     │  CCTP mint                   │
     └──────────────────────────────┼───→ ArcFlow Router Contract
                                    │         │
                                    │         ├─── 0.5% → Treasury
                                    │         │
                                    │         └─── 99.5% → User AA Wallet
```
- ✅ Атомарный сбор комиссии (одна транзакция)
- ✅ Контроль над mint destination
- ✅ Можно менять fee логику
- ⚠️ Требует свой контракт на Arc

#### Комиссии по операциям:

| Операция | Fee | Обоснование |
|----------|-----|-------------|
| **Deposit** (cross-chain) | 0.3-0.5% | Покрывает CCTP + наша маржа |
| **Payout** (cross-chain) | 0.3-0.5% | Аналогично deposit |
| **Payout** (same-chain) | 0.1% | Только наша маржа |
| **Internal transfer** | 0% | Free для network effect |
| **Batch payout** | 0.25% | Скидка за объём |

#### Пример revenue:

```
Компания делает payroll $100,000/месяц через ArcFlow:
- 50 cross-chain payouts × 0.4% = $200
- 20 internal transfers × 0% = $0
- Итого: ~$200/месяц с одного клиента

При 100 активных компаниях = $20,000 MRR
```

#### Для хакатона:

**MVP:** Вариант A (fee deduction после mint)
- Проще реализовать
- Не требует своих контрактов
- Показываем fee в API response

**Post-hackathon:** Вариант B (Router Contract)
- Более элегантно
- Лучший UX

### 1.7 Ключевые концепции и UX принципы

#### 1. Единый мультичейн баланс

**Проблема:** Пользователь держит USDC в 5 разных сетях, не понимает сколько у него денег.

**Решение:** Один баланс, который можно пополнять из любой сети.

```
┌─────────────────────────────────────────────────────────┐
│                    Deposit from any chain               │
│                                                         │
│   Arbitrum ──┐                                          │
│   Base ──────┼──→  [ Arc AA Wallet ]  ←── Polygon       │
│   Ethereum ──┘         $50,000           └── Optimism   │
│                                                         │
│                    One unified balance                  │
└─────────────────────────────────────────────────────────┘
```

**Почему Arc:**
- Дешёвые транзакции внутри Arc
- CCTP интеграция = дешёвый выход в любую сеть
- Circle Gas Station = gasless операции
- Arc как "routing hub" для мультичейн операций

**UX:** Пользователь видит только "$50,000 USDC", не думает про сети.

#### 2. Stripe-like Batch Payouts

**Концепция:** Из одной точки (Arc AA) → в любое количество получателей в разных сетях.

```
                         Arc AA Wallet
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Base USDC      Arbitrum ETH    Polygon USDT
         $5,000          0.5 ETH         $3,000
         alice.eth       bob.eth         carol.eth
```

**API:**
```javascript
await arcflow.payouts.batch({
  payouts: [
    { to: 'alice.eth', chain: 'base', amount: '5000' },
    { to: 'bob.eth', chain: 'arbitrum', token: 'ETH', amount: '1500' },
    { to: 'carol.eth', chain: 'polygon', token: 'USDT', amount: '3000' },
  ]
});
// Одна команда → 3 транзакции в 3 сетях
```

#### 3. LiFi интеграция: любой ассет in/out

**Вход (Incoming):**
```
Юзер платит ETH на Arbitrum
        ↓
LiFi Swap: ETH → USDC
        ↓
CCTP: Arbitrum USDC → Arc USDC
        ↓
Баланс пополнен в USDC
```

**Выход (Outgoing):**
```
Payout: $1500 в ETH на Base
        ↓
CCTP: Arc USDC → Base USDC
        ↓
LiFi Swap: USDC → ETH
        ↓
Получатель получает ETH
```

**Поддерживаемые токены:**
- **Входящие:** USDC, USDT, ETH, WETH, DAI, WBTC
- **Исходящие:** Любой токен через LiFi (1000+ токенов)

#### 4. Gasless UX через Arc AA

**Проблема:** Пользователю нужен газ в каждой сети для транзакций.

**Решение:** Онбординг в Arc AA = gasless навсегда во всех сетях.

```
┌─────────────────────────────────────────────────────────┐
│  Традиционный подход:                                   │
│                                                         │
│  Arbitrum: нужен ETH для газа                          │
│  Base: нужен ETH для газа                              │
│  Polygon: нужен MATIC для газа                         │
│  = Пользователь держит газ в 5 сетях 😩                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  ArcFlow подход:                                        │
│                                                         │
│  1. Онбординг → создаём Arc AA Wallet                  │
│  2. Circle Gas Station спонсирует все транзакции       │
│  3. CCTP выход → газ оплачивается из USDC              │
│  = Пользователь никогда не думает о газе 🎉            │
└─────────────────────────────────────────────────────────┘
```

**Как это работает:**
1. **Arc транзакции:** Circle Gas Station покрывает газ
2. **Cross-chain payouts:** Газ включён в fee (0.3-0.5%)
3. **Deposits:** Юзер платит газ в source chain, но на Arc уже gasless

#### 5. Абстракция: спрятать Arc от пользователя

**Принцип:** Пользователь не должен знать что такое "Arc".

**Что видит пользователь:**
```
┌─────────────────────────────────────────┐
│  ArcFlow Dashboard                      │
│                                         │
│  Balance: $50,000 USDC                  │
│                                         │
│  [Deposit]  [Payout]  [History]         │
│                                         │
│  Recent:                                │
│  ✓ Received $10,000 from Arbitrum       │
│  ✓ Paid $5,000 to alice.eth (Base)      │
└─────────────────────────────────────────┘
```

**Что происходит под капотом:**
```
- Balance хранится на Arc
- "Deposit from Arbitrum" = CCTP bridge to Arc
- "Payout to Base" = CCTP from Arc to Base
- Все операции gasless через Gas Station
```

**API тоже абстрагирует:**
```javascript
// Не нужно указывать source chain для баланса
const balance = await arcflow.accounts.getBalance(accountId);
// → { amount: "50000.00", currency: "USDC" }

// Не нужно знать про Arc
await arcflow.payouts.create({
  amount: "5000",
  destination: { address: "alice.eth", chain: "base" }
});
// ArcFlow сам решает: Arc → CCTP → Base
```

**Термины для пользователя:**
| Внутреннее | Для пользователя |
|------------|------------------|
| Arc chain | "ArcFlow Treasury" |
| CCTP bridge | "Transfer" |
| Gas Station | (не упоминаем) |
| AA Wallet | "Your account" |

---

## 2. API Функционал (Stripe-like)

### 2.1 Core Philosophy

```
Stripe принципы:
✓ Всё начинается с API key
✓ Минимум параметров для базового кейса
✓ Опциональные параметры для advanced
✓ Идемпотентность через idempotency_key
✓ Webhooks для async событий
✓ Test/Live режимы (sk_test_* / sk_live_*)
```

### 2.2 API Endpoints

#### Accounts (Субаккаунты)
```yaml
POST /v1/accounts
  body: { email, external_id?, metadata? }
  → Creates user + Circle Wallet on Arc

GET /v1/accounts/:id
GET /v1/accounts/:id/balance
```

#### Deposits (Сбор средств)
```yaml
# Получить deposit address для любой сети
POST /v1/deposits/address
  body: { account_id, chain: "arbitrum"|"base"|"polygon"|... }
  → { address, chain, fee_percent: "0.4%", expires_at }

# Создать deposit intent (для tracking)
POST /v1/deposits
  body: { account_id, expected_amount?, source_chain, metadata? }
  → { id, status: "awaiting", deposit_address, fee_percent: "0.4%", ... }

GET /v1/deposits/:id
  → {
      id,
      status: "completed",
      received_amount: "1000.00",  # что пришло на source chain
      fee: "4.00",                 # комиссия ArcFlow
      credited_amount: "996.00",  # что зачислено на баланс
      ...
    }
```

#### Payouts (Главная фича)
```yaml
# Одиночный payout
POST /v1/payouts
  body: {
    account_id,
    amount,           # "100.00" — сумма которую ПОЛУЧИТ recipient
    currency: "USDC", # пока только USDC
    destination: {
      address,        # 0x... или ENS
      chain,          # "base", "arbitrum", "arc", ...
      token?          # опционально конвертация: "ETH", "USDT"
    },
    metadata?
  }
  → {
      id,
      status: "processing",
      amount: "100.00",           # recipient получит
      fee: "0.40",                # комиссия ArcFlow
      total_deducted: "100.40",   # списано с баланса
      estimated_completion,
      ...
    }

# Batch payout (killer feature)
POST /v1/payouts/batch
  body: {
    account_id,
    payouts: [
      { amount, destination: { address, chain, token? } },
      ...
    ],
    metadata?
  }
  → { batch_id, status, payouts: [...], total_amount, total_fees }

GET /v1/payouts/:id
GET /v1/payouts/batch/:id
```

#### Transfers (Internal)
```yaml
# Между пользователями ArcFlow — instant + free
POST /v1/transfers
  body: {
    from_account_id,
    to: "email" | "account_id" | "ens.eth",
    amount,
    metadata?
  }
  → { id, status: "completed", fee: "0.00", ... }  # мгновенно и бесплатно!
```

#### Webhooks
```yaml
POST /v1/webhooks
  body: {
    url,
    events: ["deposit.completed", "payout.completed", "payout.failed", ...]
  }

# Webhook payload
{
  id: "evt_xxx",
  type: "payout.completed",
  data: { payout_id, amount, fee, recipient, chain, tx_hash },
  created_at
}
```

### 2.3 SDK (TypeScript)

```typescript
import { ArcFlow } from '@arcflow/sdk';

const arcflow = new ArcFlow({ apiKey: 'sk_test_xxx' });

// Создать аккаунт
const account = await arcflow.accounts.create({
  email: 'contractor@example.com'
});

// Получить deposit address
const deposit = await arcflow.deposits.createAddress({
  accountId: account.id,
  chain: 'arbitrum'
});

// Batch payout (главный use case)
const batch = await arcflow.payouts.createBatch({
  accountId: account.id,
  payouts: [
    { amount: '5000', destination: { address: 'alice.eth', chain: 'base' }},
    { amount: '3000', destination: { address: 'bob.eth', chain: 'polygon', token: 'USDT' }},
    { amount: '2000', destination: { address: 'carol@arcflow', chain: 'arc' }},
  ]
});
// batch.total_fees покажет общую комиссию

// Webhooks
arcflow.webhooks.verify(payload, signature, secret);
```

---

## 3. MVP Scope для хакатона

### 3.1 Must Have (без этого не показать)

| Фича | Endpoints | Зависимости |
|------|-----------|-------------|
| Account creation | `POST /v1/accounts` | Circle Wallets API |
| Balance check | `GET /v1/accounts/:id/balance` | Circle Wallets API |
| Deposit address | `POST /v1/deposits/address` | - |
| Single payout to same chain | `POST /v1/payouts` (Arc→Arc) | Circle Wallets |
| Cross-chain payout | `POST /v1/payouts` (Arc→Base) | Circle Gateway |
| **Fee collection** | Автоматический сбор комиссии | Circle Wallets |

**Демо сценарий (минимальный):**
1. Создать аккаунт → видим wallet address
2. Показать баланс (заранее положить тестовые USDC)
3. Отправить payout на Base → показать tx + fee deducted

### 3.2 Should Have (для убедительного демо)

| Фича | Добавляет ценности |
|------|-------------------|
| Batch payouts | Главное отличие от конкурентов |
| Internal transfers | "Instant + free" — wow effect |
| ENS resolution | "Отправь на vitalik.eth" |


**Расширенный демо сценарий:**
1. Создать аккаунт
2. Batch payout 3 получателям: Base, Polygon, internal
3. Показать: internal = instant + **free**, cross-chain = pending + fee
4. ENS анимация при резолве

### 3.3 Nice to Have (если время)

- LiFi интеграция (USDC → ETH на выходе)
- ENS payment preferences (text records)
- Dashboard UI
- Yellow streaming (вряд ли успеем)

### 3.4 Experimental (Post-MVP): Checkout API

> Дополнительная фича для увеличения причин собирать liquidity на Arc

**Концепция:** Stripe-like приём платежей - hosted checkout page

```
         ┌─────────────────────────────────┐
         │         ARC (Liquidity Hub)     │
         │                                 │
Incoming │  ┌─────────────────────────┐   │ Outgoing
payments │  │     USDC Treasury       │   │ payouts
   ────→ │  │     $500,000            │   │ ────→
         │  └─────────────────────────┘   │
         │                                 │
         └─────────────────────────────────┘
```

| Фича | Описание |
|------|----------|
| Payment Intent API | `POST /v1/payments` → checkout_url |
| Checkout Page | pay.arcflow.io - выбор сети/токена/кошелька |
| Multi-token Support | Принимаем USDC/USDT/ETH → конвертим в USDC на Arc |
| Webhooks | payment.completed, payment.failed |

**Зачем:**
- Больше причин держать деньги на Arc
- Incoming + Outgoing = полный цикл
- Ещё один revenue stream (0.5% fee)

**API:**
```javascript
// 1. Создать платёж
const payment = await arcflow.payments.create({
  amount: '100.00',
  success_url: 'https://shop.com/success',
  cancel_url: 'https://shop.com/cart'
});

// 2. Редирект на checkout
redirect(payment.checkout_url);  // → pay.arcflow.io/pay_xxx

// 3. Webhook когда оплачено
// POST /webhook → { type: 'payment.completed', ... }
```

**Checkout Page UX:**
```
┌─────────────────────────────────────┐
│  pay.arcflow.io/pay_abc123          │
│                                     │
│  Pay $100 to MyShop                 │
│                                     │
│  Select network:                    │
│  [Base] [Arbitrum] [Ethereum]       │
│                                     │
│  Pay with:                          │
│  ○ USDC ($100.00)                   │
│  ○ ETH (~0.028 ETH)                 │
│  ○ USDT ($100.00)                   │
│                                     │
│  [ Connect Wallet ]                 │
└─────────────────────────────────────┘
```

**Core Endpoints:**

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/v1/payments` | POST | Создать платёж |
| `/v1/payments/:id` | GET | Получить статус |
| `/v1/payments` | GET | Список платежей |
| `/v1/webhooks` | POST | Зарегистрировать webhook |
| `/v1/payouts` | POST | Вывести средства (существует) |

**Request/Response:**
```json
// POST /v1/payments
{
  "amount": "100.00",
  "description": "Order #123",
  "metadata": { "order_id": "123" },
  "success_url": "https://...",
  "cancel_url": "https://..."
}

// Response
{
  "id": "pay_abc123",
  "status": "pending",
  "checkout_url": "https://pay.arcflow.io/pay_abc123",
  "expires_at": "2026-02-01T12:00:00Z"
}
```

**Multi-chain Aggregation Flow:**
```
Юзер платит 100 USDT на Arbitrum
        ↓
ArcFlow Deposit Address (Arbitrum)
        ↓
LiFi Swap: USDT → USDC
        ↓
Circle CCTP: Arbitrum → Arc
        ↓
Мерчант получает 99.50 USDC на Arc
        ↓
Webhook: payment.completed
```

**Routing Logic:**

| Source Token | Source Chain | Path |
|--------------|--------------|------|
| USDC | CCTP chain | CCTP только |
| Non-USDC | CCTP chain | LiFi swap → CCTP |
| Any | Non-CCTP | LiFi bridge+swap |

---

## 4. План разработки (приоритеты)

### Критический путь:

```
День 1-2: Circle Wallets integration + Treasury wallet setup
    ↓
День 3: API framework + accounts endpoint
    ↓
День 4: Circle Gateway (CCTP) research + basic bridge
    ↓
День 5-6: Payouts endpoint + cross-chain + fee collection
    ↓
День 7: Batch payouts
    ↓
День 8: Internal transfers (free)
    ↓
День 9: ENS resolution
    ↓
День 10-11: Demo UI
    ↓
День 12: Polish + video
```




## 5. Следующие шаги

- [ ] Регнуться везде, получить api key
- [ ] Создать monorepo
- [ ] Запушить draw.io и текущий план
- [ ] Поделить разработку
- [ ] Протестировать каждую API, понять есть ли тестнет
- [ ] 

