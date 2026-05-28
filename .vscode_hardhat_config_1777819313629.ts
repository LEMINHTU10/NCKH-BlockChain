import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

import "@nomicfoundation/hardhat-toolbox"; 


export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin], 
  solidity: "0.8.28",
  networks: {
    ganache: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:7545",
      
      accounts: ["0x3bb7b09f69d895a3330e9d47142fae263a68af8367c96c4d654a1f377fa4ef1f"], 
    },
  },
});