import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.20",
    settings: {
      // evmVersion "berlin" để tương thích với Ganache (tránh opcode PUSH0 của Shanghai)
      evmVersion: "berlin",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ganache: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:7545",
      accounts: [
        "0x3f8a8fbb57a4e9be12c4b461e3d604d7e4bfde4d483cdff6fb3659ce293ac435", // [0] Deployer / Owner
        "0x686f1268a22265ea495b6c3b01924f611b60eceb2188c06850152d03029cfb49", // [1] Issuer  (Trường/Khoa)
        "0x76bbddfc7a86679fc6653e21bf0241a1e4950097e689e3ae9e1810a45d6de7c8", // [2] Holder  (Sinh viên)
        "0x2b5baa9a728510da115caae6a7072dae350ea520171fdb2f93843b8d10d30242", // [3] Verifier (Nhà tuyển dụng)
      ],
    },
  },
});