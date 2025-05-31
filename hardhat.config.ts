import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import 'hardhat-deploy';
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

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
};

export default config;
