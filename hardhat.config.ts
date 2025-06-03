import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import 'hardhat-deploy';
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
console.log("ETHERSCAN_API_KEY", ETHERSCAN_API_KEY);

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    hardhat: {},
    baseSepolia: {
      url: process.env.RPC_URL_BASE_SEPOLIA || "",
      accounts: process.env.ADMIN_MNEMONIC ? { mnemonic: process.env.ADMIN_MNEMONIC } : []
    },
    base: {
      url: process.env.RPC_URL_BASE || "",
      accounts: process.env.ADMIN_MNEMONIC ? { mnemonic: process.env.ADMIN_MNEMONIC } : []
    }
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: true
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
};

export default config;
