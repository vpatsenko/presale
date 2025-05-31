# Backroom Token Presale Contract

A comprehensive presale contract for the Backroom token built on Base network, implementing the Main Sale component with ETH contributions.

## Features

### Core Functionality
- **24-hour contribution window** - Sale runs for exactly 24 hours after start
- **One contribution per address** - Each address can only contribute once
- **Soft cap / Hard cap mechanics** - Configurable minimum and maximum raise targets
- **Min/Max contribution limits** - Per-address contribution boundaries
- **Automatic finalization** - Sale auto-closes when hard cap is reached
- **Refund mechanism** - Full refunds available if soft cap not met
- **Token allocation calculation** - Built-in formula for fair token distribution

### Security Features
- **Ownable** - Admin-only functions for sale management
- **ReentrancyGuard** - Protection against reentrancy attacks
- **Emergency withdrawal** - Admin escape hatch after sale period
- **Comprehensive validation** - Input validation and state checks

## Contract Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `softCap` | Minimum ETH to raise for success | 10 ETH |
| `hardCap` | Maximum ETH before early close | 100 ETH |
| `minContribution` | Minimum ETH per address | 0.1 ETH |
| `maxContribution` | Maximum ETH per address | 5 ETH |

## Sale Flow

### 1. Deployment
```solidity
BackroomPresale presale = new BackroomPresale(
    10 ether,    // softCap
    100 ether,   // hardCap
    0.1 ether,   // minContribution
    5 ether      // maxContribution
);
```

### 2. Start Sale (Admin Only)
```solidity
presale.startSale();
```

### 3. Contribution Phase (24 hours)
```solidity
// Users contribute ETH
presale.contribute{value: 1 ether}();
```

### 4. Finalization
- **Automatic**: When hard cap reached
- **Manual**: After 24 hours via `finalizeSale()`

### 5. Post-Sale Actions

#### If Successful (Soft Cap Reached)
```solidity
// Admin withdraws raised funds
presale.withdrawFunds();

// Calculate token allocations off-chain
uint256 allocation = presale.calculateTokenAllocation(
    contributor,
    totalTokensForPresale
);
```

#### If Failed (Soft Cap Not Reached)
```solidity
// Contributors claim refunds
presale.claimRefund();
```

## Token Allocation Formula

```
UserTokens = (User ETH / Total ETH Raised) × Total Allocated Tokens
```

Example:
- User contributed: 2 ETH
- Total raised: 50 ETH
- Total tokens for presale: 1,000,000 tokens
- User allocation: (2/50) × 1,000,000 = 40,000 tokens

## Installation & Setup

### Prerequisites
- Node.js >= 16
- npm or yarn
- Hardhat

### Install Dependencies
```bash
npm install
```

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Deploy Contract
```bash
# Local deployment
npx hardhat run scripts/deploy.js --network hardhat

# Base mainnet deployment (configure network in hardhat.config.js)
npx hardhat run scripts/deploy.js --network base
```

## Contract Interface

### Admin Functions
- `startSale()` - Start the 24-hour sale period
- `withdrawFunds()` - Withdraw raised ETH (successful sales only)
- `emergencyWithdraw()` - Emergency fund recovery

### User Functions
- `contribute()` - Contribute ETH to the presale
- `claimRefund()` - Claim refund (failed sales only)

### View Functions
- `getSaleInfo()` - Get complete sale status
- `getContributionInfo(address)` - Get user contribution details
- `getContributors()` - Get all contributor addresses
- `getTimeRemaining()` - Get seconds remaining in sale
- `calculateTokenAllocation(address, uint256)` - Calculate token allocation

## Events

```solidity
event SaleStarted(uint256 startTime, uint256 endTime);
event ContributionMade(address indexed contributor, uint256 amount);
event SaleFinalized(bool successful, uint256 totalRaised);
event RefundClaimed(address indexed contributor, uint256 amount);
event FundsWithdrawn(uint256 amount);
```

## Integration with Claim Contract

This presale contract is designed to work with a separate claim contract for token distribution:

1. **Off-chain calculation**: Use `calculateTokenAllocation()` to compute allocations
2. **Merkle tree generation**: Create merkle tree of all allocations
3. **Claim contract deployment**: Deploy with merkle root
4. **User claims**: Users claim tokens using merkle proofs

## Security Considerations

- **Admin key security**: Secure the deployer/owner private key
- **Parameter validation**: Verify all constructor parameters before deployment
- **Network configuration**: Ensure correct network deployment
- **Gas optimization**: Consider gas costs for large contributor lists

## Testing

The contract includes comprehensive tests covering:
- Deployment and initialization
- Sale management (start/stop)
- Contribution validation and limits
- Sale finalization scenarios
- Refund mechanisms
- Fund withdrawal
- Token allocation calculations
- Edge cases and error conditions

Run tests with:
```bash
npx hardhat test
```

## License

UNLICENSED - This contract is proprietary to the Backroom project.

## Support

For technical support or questions about the contract implementation, please refer to the inline documentation or contact the development team.
