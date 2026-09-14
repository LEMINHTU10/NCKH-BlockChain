import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import IssuerPage from './pages/IssuerPage';
import HolderPage from './pages/HolderPage';
import VerifierPage from './pages/VerifierPage';
import LandingPage from './pages/LandingPage';
import { connectWallet, onAccountChange, shortAddr } from './utils/web3';
import './index.css';

// ── Route title map ─────────────────────────────────────────
const ROUTE_META = {
  '/issuer':   { label: 'Issuer',   icon: '🏛️', badge: 'badge-issuer',   color: 'var(--cyan)' },
  '/holder':   { label: 'Holder',   icon: '🎓', badge: 'badge-holder',   color: 'var(--purple)' },
  '/verifier': { label: 'Verifier', icon: '🔎', badge: 'badge-verifier', color: 'var(--green)' },
};

// ── Guard: redirect to / nếu chưa có ví (cho issuer/holder) ──
function WalletGuard({ account, onConnect, isConnecting, children }) {
  const navigate = useNavigate();
  if (!account) {
    return (
      <div className="connect-prompt">
        <div className="connect-prompt-icon">🔐</div>
        <h2>Yêu cầu kết nối MetaMask</h2>
        <p>Trang này yêu cầu kết nối ví MetaMask của Trường học (Issuer) hoặc Sinh viên (Holder).</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={onConnect}
            disabled={isConnecting}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isConnecting ? 'Đang kết nối ví...' : '🔐 Kết nối ví MetaMask ngay'}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => navigate('/')}
          >
            ← Về Trang chủ chọn vai trò
          </button>
        </div>
      </div>
    );
  }
  return children;
}

// ── Navbar chung ────────────────────────────────────────────
function AppNavbar({ account, onLogout, onConnect, isConnecting }) {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = ROUTE_META[location.pathname];

  return (
    <nav className="navbar">
      {/* Left: Back button + Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => navigate('/')}
          style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          title="Quay lại trang chọn vai trò"
        >
          ← Quay lại
        </button>
        <div className="navbar-brand" style={{ cursor: 'default' }}>
          <div className="navbar-logo">D</div>
          <span className="navbar-title">DID System</span>
          {meta && (
            <span style={{ fontSize: 12, color: meta.color, fontWeight: 600, marginLeft: 6 }}>
              / {meta.icon} {meta.label}
            </span>
          )}
        </div>
      </div>

      {/* Right: Wallet */}
      <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {account ? (
          <>
            <div className="wallet-btn connected" title={account}>
              <div className="wallet-dot" />
              {shortAddr(account)}
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={onLogout}
              title="Đăng xuất ví"
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              🚪 Đăng xuất
            </button>
          </>
        ) : (
          <button
            className="wallet-btn"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Đang kết nối...' : '🔐 Kết nối ví'}
          </button>
        )}
      </div>
    </nav>
  );
}

// ── App root ─────────────────────────────────────────────────
export default function App() {
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  useEffect(() => {
    onAccountChange((newAccount) => setAccount(newAccount));
  }, []);

  async function handleConnectWallet() {
    if (isConnecting) return null;
    setIsConnecting(true);
    try {
      const { account: connectedAcc } = await connectWallet();
      setAccount(connectedAcc);
      return connectedAcc;
    } catch (err) {
      alert(err.message || 'Lỗi kết nối ví MetaMask');
      return null;
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSelectRole(targetPath) {
    if (targetPath === '/verifier') {
      navigate('/verifier');
      return;
    }

    if (account) {
      navigate(targetPath);
      return;
    }

    setIsConnecting(true);
    try {
      const { account: connectedAcc } = await connectWallet();
      setAccount(connectedAcc);
      navigate(targetPath);
    } catch (err) {
      alert(err.message || 'Vui lòng kết nối ví MetaMask để truy cập vai trò này!');
    } finally {
      setIsConnecting(false);
    }
  }

  function handleLogout() {
    setAccount(null);
    navigate('/');
  }

  return (
    <div className="app-wrapper">
      {/* Navbar ẩn ở Landing page */}
      {!isHome && (
        <AppNavbar
          account={account}
          onLogout={handleLogout}
          onConnect={handleConnectWallet}
          isConnecting={isConnecting}
        />
      )}

      <main className={isHome ? '' : 'main-content'}>
        <Routes>
          {/* Trang chủ — chọn vai trò */}
          <Route
            path="/"
            element={
              <LandingPage
                account={account}
                isConnecting={isConnecting}
                onSelectRole={handleSelectRole}
                onConnect={handleConnectWallet}
                onLogout={handleLogout}
              />
            }
          />

          {/* /issuer — yêu cầu ví */}
          <Route
            path="/issuer"
            element={
              <WalletGuard
                account={account}
                onConnect={handleConnectWallet}
                isConnecting={isConnecting}
              >
                <IssuerPage key={account} account={account} />
              </WalletGuard>
            }
          />

          {/* /holder — yêu cầu ví */}
          <Route
            path="/holder"
            element={
              <WalletGuard
                account={account}
                onConnect={handleConnectWallet}
                isConnecting={isConnecting}
              >
                <HolderPage key={account} account={account} />
              </WalletGuard>
            }
          />

          {/* /verifier — không cần ví (guest ok) */}
          <Route
            path="/verifier"
            element={<VerifierPage account={account} />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
