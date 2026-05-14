# ArcLend Protocol — Smart Contracts

A production-grade lending and borrowing protocol built natively on the [Arc Network](https://docs.arc.network/). ArcLend enables users to supply stablecoins (USDC, EURC) to earn yield, deposit tokenized money market fund shares (USYC) as collateral, and borrow against that collateral with transparent, algorithmically-determined interest rates.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Contract Descriptions](#contract-descriptions)
- [Protocol Mechanics](#protocol-mechanics)
- [Getting Started](#getting-started)
- [Build & Test](#build--test)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Security Model](#security-model)
- [License](#license)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArcLendVault                              │
│  (Core protocol: deposits, borrows, repayments, liquidations)   │
├─────────────────────────────────────────────────────────────────┤
│         │                                    │                   │
│         ▼                                    ▼                   │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │ InterestRateModel │              │   PriceOracle    │         │
│  │ (Kinked curve)    │              │ (Chainlink feeds)│         │
│  └──────────────────┘              └──────────────────┘         │
│                                            │                    │
│                                            ▼                    │
│                                    ┌──────────────────┐         │
│                                    │  IAggregatorV3   │         │
│                                    │ (Price feeds)    │         │
│                                    └──────────────────┘         │
└─────────────────────────────────────────────────────────────────┘

Supported Assets:
  • Supply/Borrow: USDC, EURC (6 decimals)
  • Collateral:    USYC (6 decimals, tokenized MMF)
```

The protocol follows a modular design with clear separation of concerns:

- **ArcLendVault** — The core lending engine managing all user-facing operations.
- **InterestRateModel** — A standalone contract implementing the interest rate curve.
- **PriceOracle** — An adapter layer over Chainlink-compatible price feeds.

---

## Contract Descriptions

### `ArcLendVault.sol`

The central contract of the protocol. It manages:

| Function | Description |
|----------|-------------|
| `deposit` | Supply assets to the lending pool and receive proportional share tokens |
| `depositCollateral` | Lock USYC as collateral to enable borrowing |
| `withdraw` | Burn share tokens to redeem underlying assets |
| `withdrawCollateral` | Unlock collateral (subject to health factor check) |
| `borrow` | Borrow assets against deposited collateral |
| `repay` | Repay outstanding debt (partial or full) |
| `liquidate` | Liquidate undercollateralized positions for a bonus |

**Share-based accounting:** Supply positions use an ERC-4626-style share model. As interest accrues, the exchange rate between shares and underlying assets increases, meaning depositors earn yield without any action.

**Borrow index compounding:** Debt is tracked via a global borrow index that compounds per-block. Each borrower's debt is calculated as `principal × currentIndex / snapshotIndex`, ensuring accurate interest accumulation.

### `InterestRateModel.sol`

Implements a **piecewise linear (kinked) interest rate curve** — the industry-standard model used by Compound and Aave:

```
Borrow Rate:
  • Below kink:  baseRate + baseSlope × utilization
  • Above kink:  baseRate + baseSlope × kink + jumpSlope × (utilization − kink)

Supply Rate:
  • borrowRate × utilization × (1 − reserveFactor)

Utilization:
  • totalBorrows / (totalSupply + totalBorrows)
```

The jump slope creates a steep rate increase above the kink, incentivizing repayments when utilization is high and ensuring liquidity for withdrawals.

**Default parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| Base Rate | 2% | Minimum borrow cost |
| Base Slope | 4% | Rate sensitivity below kink |
| Jump Slope | 75% | Rate sensitivity above kink |
| Kink | 80% | Utilization threshold |
| Reserve Factor | 10% | Protocol's share of interest |

### `PriceOracle.sol`

A Chainlink-compatible oracle adapter with:

- **Staleness protection** — Reverts if a price feed hasn't been updated within 24 hours.
- **Decimal normalization** — Normalizes all prices to 8-decimal precision regardless of the feed's native format.
- **Positive price validation** — Rejects zero or negative oracle answers.

### Libraries

| Library | Purpose |
|---------|---------|
| `DataTypes.sol` | Struct definitions for pool state, user positions, collateral config, and rate parameters |
| `Errors.sol` | Custom error definitions for gas-efficient reverts |
| `Events.sol` | Event definitions for all protocol actions |

### Interfaces

| Interface | Purpose |
|-----------|---------|
| `IArcLendVault.sol` | Public API for the vault contract |
| `IInterestRateModel.sol` | Rate model interface (allows swappable implementations) |
| `IPriceOracle.sol` | Oracle interface (allows swappable oracle backends) |
| `IAggregatorV3.sol` | Minimal Chainlink AggregatorV3 interface |

---

## Protocol Mechanics

### Health Factor

The health factor determines whether a position is eligible for liquidation:

```
healthFactor = (collateralValueUSD × collateralFactor) / totalDebtUSD
```

- **HF ≥ 1.0** — Position is healthy.
- **HF < 1.0** — Position is undercollateralized and eligible for liquidation.

### Liquidation

When a borrower's health factor drops below 1.0:

1. A liquidator repays up to **50%** of the borrower's outstanding debt.
2. The liquidator receives the borrower's collateral at a discount (liquidation incentive of 5–10%).
3. If the borrower's collateral is insufficient to cover the seized amount, the shortfall is recorded as **bad debt**.

### Interest Accrual

Interest compounds per-block using a simple interest approximation:

```
interestFactor = borrowRatePerBlock × blocksElapsed
newBorrowIndex = oldIndex × (1 + interestFactor)
interestAccrued = totalBorrows × interestFactor
```

The accrued interest is split between depositors (via increased `totalDeposits`) and the protocol reserve (via `reserveFactor`).

### Pause Guards

The admin can independently pause/unpause:
- Deposits
- Withdrawals
- Borrows
- Repayments

This provides granular circuit-breaker capability during emergencies.

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- Git

### Installation

```bash
cd packages/contracts
forge install
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

---

## Build & Test

### Build

```bash
forge build
```

### Run Tests

```bash
# Run all tests
forge test

# Run with verbose output (traces on failure)
forge test -vvv

# Run a specific test file
forge test --match-path test/ArcLendVault.t.sol

# Run a specific test function
forge test --match-test test_borrow_success -vvvv
```

### Test Suite

The protocol includes **100 tests** covering all contract functionality:

| Suite | Tests | Coverage |
|-------|-------|----------|
| `ArcLendVault.t.sol` | 51 | Deposits, withdrawals, borrows, repayments, liquidations, interest accrual, admin functions, health factor, view functions |
| `InterestRateModel.t.sol` | 27 | Constructor validation, borrow/supply rate calculations, utilization formula, admin setters, access control |
| `PriceOracle.t.sol` | 20 | Price retrieval, staleness checks, decimal normalization, feed configuration, ownership |
| `Counter.t.sol` | 2 | Template contract (can be removed) |

Tests run locally using mock ERC-20 tokens and a controllable `TestAggregator` oracle — no network access required.

### Gas Snapshots

```bash
forge snapshot
```

### Formatting

```bash
forge fmt
```

---

## Deployment

### Deploy to Arc Testnet

1. Configure your `.env` file with the required variables:

```env
PRIVATE_KEY=<deployer_private_key_without_0x>
DEPLOYER_ADDRESS=<deployer_address>
USDC_ADDRESS=0x3600000000000000000000000000000000000000
EURC_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
USYC_ADDRESS=0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
USYC_PRICE_FEED=<chainlink_compatible_feed_address>
```

2. Run the deployment script:

```bash
source .env

forge script script/DeployArcLend.s.sol:DeployArcLend \
  --rpc-url https://rpc.testnet.arc.network \
  --broadcast \
  --verify
```

### Deployment Order

The script deploys contracts in dependency order:

1. **PriceOracle** — Deployed first, then configured with the USYC price feed.
2. **InterestRateModel** — Deployed with default rate parameters.
3. **ArcLendVault** — Deployed last, wired to the oracle and rate model.

### Arc Testnet Details

| Property | Value |
|----------|-------|
| Network | Arc L1 Testnet |
| Chain ID | 5042002 |
| RPC | `https://rpc.testnet.arc.network` |
| USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |

---

## Configuration

### Admin-Configurable Parameters

| Parameter | Range | Default | Function |
|-----------|-------|---------|----------|
| Collateral Factor | 1% – 97% | 80% | `setCollateralFactor()` |
| Liquidation Incentive | 5% – 10% | 5% | `setLiquidationIncentive()` |
| Base Rate | 0% – 500% | 2% | `setRateModelParams()` |
| Base Slope | 0% – 500% | 4% | `setRateModelParams()` |
| Jump Slope | 0% – 500% | 75% | `setRateModelParams()` |
| Kink | 1% – 99% | 80% | `setRateModelParams()` |
| Reserve Factor | 0% – 50% | 10% | `setRateModelParams()` |

All parameters use **ray math** (1e27 = 100% = 1.0) for precision.

---

## Security Model

### Access Control

- **Admin-only functions** are gated by the `onlyAdmin` modifier.
- The admin address is set at deployment and cannot be transferred (consider adding a transfer mechanism for production).

### Validation & Guards

- All user inputs are validated (zero amounts, unsupported assets, insufficient balances).
- Oracle staleness is checked before every borrow operation.
- Health factor is enforced on withdrawals, collateral withdrawals, and borrows.
- Liquidation is capped at 50% of outstanding debt per transaction.
- Pause guards provide emergency circuit-breaker functionality.

### Known Considerations

- **No reentrancy guard** — The contract uses a checks-effects-interactions pattern with low-level calls. Consider adding `ReentrancyGuard` for defense-in-depth.
- **Single admin** — No multi-sig or timelock. Recommended for production deployments.
- **Oracle dependency** — Protocol health depends on timely oracle updates. The 24-hour staleness threshold provides protection.
- **Bad debt socialization** — When liquidation collateral is insufficient, bad debt is tracked but not currently socialized across depositors.

### Audit Status

⚠️ **This protocol has not been audited.** Do not use in production with real funds without a professional security audit.

---

## Project Structure

```
packages/contracts/
├── src/
│   ├── ArcLendVault.sol          # Core lending vault
│   ├── InterestRateModel.sol     # Kinked interest rate curve
│   ├── PriceOracle.sol           # Chainlink oracle adapter
│   ├── Counter.sol               # Template (removable)
│   ├── interfaces/
│   │   ├── IArcLendVault.sol
│   │   ├── IInterestRateModel.sol
│   │   ├── IPriceOracle.sol
│   │   └── IAggregatorV3.sol
│   └── libraries/
│       ├── DataTypes.sol
│       ├── Errors.sol
│       └── Events.sol
├── test/
│   ├── ArcLendVault.t.sol        # 51 tests
│   ├── InterestRateModel.t.sol   # 27 tests
│   ├── PriceOracle.t.sol         # 20 tests
│   ├── Counter.t.sol             # 2 tests
│   ├── helpers/
│   │   ├── BaseTest.sol          # Fork-based test base
│   │   ├── TestAggregator.sol    # Controllable price feed
│   │   └── IERC20.sol            # Minimal ERC-20 interface
│   └── mocks/
│       └── MockERC20.sol         # Local test token
├── script/
│   ├── DeployArcLend.s.sol       # Production deployment
│   └── Counter.s.sol             # Template (removable)
├── foundry.toml                  # Foundry configuration
└── .env.example                  # Environment template
```

---

## License

MIT
