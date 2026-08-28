import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    version: "0.8.20",
    settings: {
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
        "0x3bb7b09f69d895a3330e9d47142fae263a68af8367c96c4d654a1f377fa4ef1f", // Index 0: tester (0x3b1a...)
        "0x3f8a8fbb57a4e9be12c4b461e3d604d7e4bfde4d483cdff6fb3659ce293ac435", // Index 1: (0xB6Ef...)
        "0x686f1268a22265ea495b6c3b01924f611b60eceb2188c06850152d03029cfb49", // Index 2: issuer (0x66DD...)
        "0x76bbddfc7a86679fc6653e21bf0241a1e4950097e689e3ae9e1810a45d6de7c8", // Index 3: holder (0x1d71...)
        "0x2b5baa9a728510da115caae6a7072dae350ea520171fdb2f93843b8d10d30242", // Index 4: verifier (0x28b4...)
        "0x3ee9c1483e880ca907ef82eeaf332ad0594ee6a67fe141a19db22aff0a5ba240", // Index 5: issuer 2 (0x70CC...)
      ],
    },
  },
});
