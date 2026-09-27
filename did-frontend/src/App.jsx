import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import IssuerPage from './pages/IssuerPage';
import HolderPage from './pages/HolderPage';
import VerifierPage from './pages/VerifierPage';
import LandingPage from './pages/LandingPage';
import { connectWallet, onAccountChange, shortAddr } from './utils/web3';
import './index.css';

// ── Route definitions ─────────────────────────────────────────
const ROUTES = [
  { path: '/issuer', label: 'Quản lý Cấp Bằng', icon: 'verified_user' },
  { path: '/holder', label: 'Ví Văn Bằng Sinh Viên', icon: 'school' },
  { path: '/verifier', label: 'Tra Cứu Văn Bằng', icon: 'verified' },
];

// ── Guard: redirect to / nếu chưa có ví (cho issuer/holder) ──
function WalletGuard({ account, onConnect, isConnecting, children }) {
  const navigate = useNavigate();
  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-text-main">Yêu cầu kết nối MetaMask</h2>
        <p className="text-sm text-text-sub text-center max-w-md">Trang này yêu cầu kết nối ví MetaMask của Cơ sở đào tạo (Issuer) hoặc Chủ sở hữu (Holder).</p>
        <div className="flex gap-3 mt-4">
          <button
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
            onClick={onConnect}
            disabled={isConnecting}
          >
            <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
            {isConnecting ? 'Đang kết nối...' : 'Kết nối ví ngay'}
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-surface-subtle text-text-main font-medium hover:bg-border-ui transition-colors"
            onClick={() => navigate('/')}
          >
            Về Trang chủ
          </button>
        </div>
      </div>
    );
  }
  return children;
}

// ── Navbar chung ────────────────────────────────────────────
function AppNavbar({ account, onLogout, onConnect, isConnecting, sidebarOpen, onToggleSidebar }) {
  const navigate = useNavigate();
  
  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-50 bg-surface border-b border-border-ui shadow-sm">
      <div className="h-16 w-full px-4 lg:px-6 flex items-center justify-between gap-4">
        
        {/* Left: Toggle Button + Logo & Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-ui bg-slate-50 hover:bg-blue-50 text-text-main hover:text-primary transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
            title={sidebarOpen ? "Thu gọn thanh điều hướng (Sidebar)" : "Mở thanh điều hướng (Sidebar)"}
            aria-label="Toggle sidebar"
          >
            <span className="material-symbols-outlined text-[20px] text-primary">
              {sidebarOpen ? 'menu_open' : 'menu'}
            </span>
            <span className="text-xs font-semibold text-text-main hidden sm:inline">
              {sidebarOpen ? 'Đóng Menu' : 'Mở Menu'}
            </span>
          </button>

          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white font-bold shadow-sm shrink-0 border border-blue-900">
              <div className="flex flex-col items-center leading-none tracking-tighter">
                <span className="material-symbols-outlined text-[24px]">verified</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[13px] sm:text-[14px] text-primary uppercase tracking-tight leading-tight">DID System</span>
              <span className="text-[11px] text-text-muted hidden sm:inline leading-none font-medium">Hệ Thống Xác Thực Danh Tính & Văn Bằng</span>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button onClick={() => navigate('/')} className="hidden xl:flex items-center gap-1.5 text-xs font-medium text-text-sub hover:text-primary transition-colors px-2 py-1">
            <span className="material-symbols-outlined text-[18px]">home</span>
            <span>Trang chủ</span>
          </button>
          
          <div className="h-6 w-px bg-border-ui hidden sm:block"></div>
          
          {account ? (
            <div className="flex items-center gap-3 pl-1 sm:pl-2">
              <span className="font-semibold text-xs text-text-main font-mono">{shortAddr(account)}</span>
              <div 
                className="w-8 h-8 rounded-full ring-2 ring-blue-100 bg-primary text-white flex items-center justify-center font-bold text-xs"
                title={account}
              >
                <span className="material-symbols-outlined text-[16px]">person</span>
              </div>
            </div>
          ) : (
            <button
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Đang kết nối...' : '🔐 Kết nối ví'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Sidebar chung với hiệu ứng trượt ────────────────────────
function AppSidebar({ isOpen, onToggle }) {
  const location = useLocation();
  
  return (
    <aside 
      className={`fixed left-0 top-16 bottom-0 w-64 bg-surface border-r border-border-ui z-40 flex flex-col py-4 shadow-sm transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex flex-col gap-2 px-3">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="font-bold text-[11px] text-text-muted uppercase tracking-wider">Hệ Thống Phân Tán</span>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-text-muted hover:text-primary hover:bg-slate-100 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
            title="Thu gọn thanh điều hướng"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            <span>Ẩn</span>
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {ROUTES.map((route) => {
            const isActive = location.pathname === route.path;
            return (
              <Link 
                key={route.path}
                to={route.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all font-medium ${
                  isActive 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-text-sub hover:bg-surface-subtle hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{route.icon}</span>
                <span>{route.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  );
}

// ── App root ─────────────────────────────────────────────────
export default function App() {
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
    <div className="min-h-screen bg-background font-sans text-text-main antialiased">
      {/* Navbar ẩn ở Landing page (hoặc hiện tuỳ layout) */}
      {!isHome && (
        <>
          <AppNavbar
            account={account}
            onLogout={handleLogout}
            onConnect={handleConnectWallet}
            isConnecting={isConnecting}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          />
          <AppSidebar 
            isOpen={sidebarOpen} 
            onToggle={() => setSidebarOpen(prev => !prev)} 
          />
          {sidebarOpen && (
            <div 
              onClick={() => setSidebarOpen(false)} 
              className="fixed inset-0 bg-slate-900/20 z-30 lg:hidden backdrop-blur-xs transition-opacity duration-300"
            />
          )}

          {/* Nút mở nhanh thanh điều hướng nổi ở mép trái khi sidebar đang ẩn */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="fixed left-0 top-20 z-40 bg-white hover:bg-blue-50 text-primary border border-border-ui border-l-0 rounded-r-lg py-2.5 px-1.5 shadow-md flex items-center justify-center cursor-pointer transition-all hover:pr-3 group"
              title="Mở thanh điều hướng"
            >
              <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">
                chevron_right
              </span>
            </button>
          )}
        </>
      )}

      <main className={!isHome ? `${sidebarOpen ? 'lg:pl-64' : 'pl-0'} pt-16 w-full transition-[padding] duration-300 ease-in-out` : 'w-full'}>
        <Routes>
          {/* Trang chủ */}
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

          {/* /issuer */}
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

          {/* /holder */}
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

          {/* /verifier */}
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
