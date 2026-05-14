import { useState, useEffect } from 'react';
import IssuerPage from './pages/IssuerPage';
import HolderPage from './pages/HolderPage';
import VerifierPage from './pages/VerifierPage';
import { connectWallet, onAccountChange, shortAddr } from './utils/web3';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('issuer');
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Lắng nghe sự kiện đổi tài khoản từ MetaMask
    onAccountChange((newAccount) => {
      setAccount(newAccount);
    });
  }, []);

  async function handleConnectWallet() {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const { account } = await connectWallet();
      setAccount(account);
    } catch (err) {
      alert(err.message);
    }
    setIsConnecting(false);
  }

  return (
    <div className="app-wrapper">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
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
            <span className="tab-icon">🏢</span> Verifier
          </button>
        </div>

        <div className="navbar-actions">
          {account ? (
            <div className="wallet-btn connected" title={account}>
              <div className="wallet-dot"></div>
              {shortAddr(account)}
            </div>
          ) : (
            <button className="wallet-btn" onClick={handleConnectWallet} disabled={isConnecting}>
              {isConnecting ? "Đang kết nối..." : "Kết nối Ví"}
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'issuer' && <IssuerPage />}
        {activeTab === 'holder' && <HolderPage />}
        {activeTab === 'verifier' && <VerifierPage />}
      </main>
    </div>
  );
}

export default App;
