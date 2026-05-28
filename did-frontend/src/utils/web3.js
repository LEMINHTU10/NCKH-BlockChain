import { ethers } from "ethers";

let provider = null;
let signer = null;
let account = null;


export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask chưa được cài đặt. Vui lòng cài MetaMask!");
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  account = await signer.getAddress();

  
  const network = await provider.getNetwork();
  if (network.chainId !== 1337n) {
    throw new Error(
      `Sai mạng! Đang kết nối mạng chainId=${network.chainId}. Vui lòng chuyển sang mạng Ganache Local (chainId=1337).`
    );
  }

  return { provider, signer, account };
}

export function getProvider() { return provider; }
export function getSigner()   { return signer; }
export function getAccount()  { return account; }


export function onAccountChange(callback) {
  if (window.ethereum) {
    
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      if (accounts.length > 0) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        account = accounts[0];
        callback(account);
      }
    });

    
    window.ethereum.on("accountsChanged", async (accounts) => {
      if (accounts.length > 0) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        account = accounts[0];
      } else {
        provider = null;
        signer = null;
        account = null;
      }
      callback(account);
    });
  }
}


export function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}


export function formatTimestamp(ts) {
  if (!ts || ts === 0n) return "Không giới hạn";
  return new Date(Number(ts) * 1000).toLocaleString("vi-VN");
}
