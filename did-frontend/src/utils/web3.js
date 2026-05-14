import { ethers } from "ethers";

let provider = null;
let signer = null;
let account = null;

// Kết nối MetaMask
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask chưa được cài đặt. Vui lòng cài MetaMask!");
  }
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  account = await signer.getAddress();

  // Kiểm tra đúng mạng Ganache (chainId = 1337)
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

// Lắng nghe thay đổi tài khoản và tự động khởi tạo lại provider/signer
export function onAccountChange(callback) {
  if (window.ethereum) {
    // Lấy tài khoản hiện tại khi load trang nếu đã kết nối trước đó
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      if (accounts.length > 0) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        account = accounts[0];
        callback(account);
      }
    });

    // Lắng nghe khi người dùng đổi tài khoản trong MetaMask
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

// Rút gọn địa chỉ ví để hiển thị
export function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Format timestamp Unix → chuỗi ngày giờ
export function formatTimestamp(ts) {
  if (!ts || ts === 0n) return "Không giới hạn";
  return new Date(Number(ts) * 1000).toLocaleString("vi-VN");
}
