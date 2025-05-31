import { HardhatUserConfig } from "hardhat/config";
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
  }
};

export default config;
