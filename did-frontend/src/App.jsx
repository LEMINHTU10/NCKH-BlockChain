import { useState, useEffect } from 'react';
import IssuerPage from './pages/IssuerPage';
import HolderPage from './pages/HolderPage';
import VerifierPage from './pages/VerifierPage';
import LandingPage from './pages/LandingPage';
import { connectWallet, onAccountChange, shortAddr } from './utils/web3';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('issuer');
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  // guestMode = true: doanh nghiệp vào trang Verifier mà không cần kết nối ví
  const [guestMode, setGuestMode] = useState(false);

  useEffect(() => {
    onAccountChange((newAccount) => {
      setAccount(newAccount);
      if (newAccount) setGuestMode(false); // có ví → thoát guest mode
    });
  }, []);

  async function handleConnectWallet() {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const { account } = await connectWallet();
      setAccount(account);
      setGuestMode(false);
    } catch (err) {
      alert(err.message);
    }
    setIsConnecting(false);
  }

  function handleLogout() {
    setAccount(null);
    setGuestMode(false);
  }

  // ── Màn hình Landing (chưa kết nối ví, không phải guest) ───────────────
  if (!account && !guestMode) {
    return (
      <LandingPage
        onConnect={handleConnectWallet}
        isConnecting={isConnecting}
        onGuestVerifier={() => setGuestMode(true)}
      />
    );
  }

  // ── Chế độ Verifier (doanh nghiệp, không cần ví) ───────────────────────
  if (guestMode && !account) {
    return (
      <div className="app-wrapper">
        <nav className="navbar">
          <div
            className="navbar-brand"
            onClick={handleLogout}
            style={{ cursor: "pointer" }}
            title="Bấm để về Màn hình Đăng nhập"
          >
            <div className="navbar-logo">D</div>
            <span className="navbar-title">DID System</span>
          </div>
          <div className="guest-mode-bar">
            <span className="guest-mode-label">
              🔎 Chế độ Doanh nghiệp · Chỉ xác thực bằng cấp
            </span>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleLogout}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              🏠 Về Trang chủ
            </button>
            <button
              className="wallet-btn"
              onClick={handleConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'Đang kết nối...' : '🔐 Đăng nhập (Trường/Sinh viên)'}
            </button>
          </div>
        </nav>
        <main className="main-content">
          <VerifierPage />
        </main>
      </div>
    );
  }

  // ── App đầy đủ (đã kết nối ví) ─────────────────────────────────────────
  return (
    <div className="app-wrapper">
      <nav className="navbar">
        <div
          className="navbar-brand"
          onClick={handleLogout}
          style={{ cursor: "pointer" }}
          title="Bấm để về Màn hình Đăng nhập"
        >
          <div className="navbar-logo">D</div>
          <span className="navbar-title">Decentralized ID</span>
        </div>

        <div className="navbar-tabs">
          <button
            className={`nav-tab ${activeTab === 'issuer' ? 'active' : ''}`}
            onClick={() => setActiveTab('issuer')}
          >
            <span className="tab-icon">🏛️</span> Issuer
          </button>
          <button
            className={`nav-tab ${activeTab === 'holder' ? 'active' : ''}`}
            onClick={() => setActiveTab('holder')}
          >
            <span className="tab-icon">🎓</span> Holder
          </button>
          <button
            className={`nav-tab ${activeTab === 'verifier' ? 'active' : ''}`}
            onClick={() => setActiveTab('verifier')}
          >
            <span className="tab-icon">🔎</span> Verifier
          </button>
        </div>

        <div className="navbar-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="wallet-btn connected" title={account}>
            <div className="wallet-dot"></div>
            {shortAddr(account)}
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleLogout}
            title="Đăng xuất / Về màn hình Đăng nhập"
            style={{ fontSize: 12, padding: "6px 12px" }}
          >
            🚪 Đăng xuất
          </button>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === 'issuer'   && <IssuerPage key={account} account={account} />}
        {activeTab === 'holder'   && <HolderPage key={account} account={account} />}
        {activeTab === 'verifier' && <VerifierPage key={account} account={account} />}
      </main>
    </div>
  );
}

export default App;
