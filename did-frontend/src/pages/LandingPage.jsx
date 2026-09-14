import { useState } from 'react';
import { shortAddr } from '../utils/web3';
import { CONTRACT_ADDRESSES } from '../utils/contracts';

export default function LandingPage({ account, isConnecting, onSelectRole, onConnect, onLogout }) {
  const [copied, setCopied] = useState(false);

  function handleCopyContract() {
    navigator.clipboard?.writeText(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-surface-container-lowest font-body-md text-on-surface antialiased min-h-screen">
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <header class="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-white/5">
        <div class="h-20 max-w-[1280px] mx-auto px-4 md:px-8 lg:px-12 flex items-center justify-between gap-6">
          {/* Brand */}
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-container to-surface-tint flex items-center justify-center font-bold text-on-primary shadow-[0_0_16px_rgba(56,189,248,0.3)]">
              D
            </div>
            <span class="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
              DID System
            </span>
            <div class="hidden xl:flex items-center px-3 py-1 rounded-full bg-primary-container/10 border border-primary/30 shadow-[0_0_12px_rgba(56,189,248,0.15)]">
              <span class="font-label-badge text-label-badge text-primary uppercase tracking-wider text-[11px]">
                NCKH · Blockchain · W3C Standard
              </span>
            </div>
          </div>

          {/* Nav links */}
          <nav class="hidden lg:flex items-center gap-6">
            <a href="#roles-section" class="text-sm text-on-surface-variant hover:text-on-surface transition-colors">
              Chọn vai trò
            </a>
            <a href="#architecture-section" class="text-sm text-on-surface-variant hover:text-on-surface transition-colors">
              Mô hình bảo mật
            </a>
            <span class="text-xs text-outline font-mono px-2 py-0.5 rounded bg-surface-container-high">
              Ganache: 7545
            </span>
          </nav>

          {/* Right actions */}
          <div class="flex items-center gap-3">
            {account ? (
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-2 bg-surface-container-low px-3.5 py-1.5 rounded-full border border-white/10" title={account}>
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-tertiary"></span>
                  </span>
                  <span class="font-label-code text-label-code text-tertiary font-semibold">
                    {shortAddr(account)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-error text-xs transition-colors cursor-pointer"
                  title="Đăng xuất ví"
                >
                  <span class="material-symbols-outlined text-[16px]">logout</span>
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                disabled={isConnecting}
                class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary-container font-semibold text-sm shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all cursor-pointer"
              >
                <span class="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                <span>{isConnecting ? 'Đang kết nối...' : 'Kết nối Ví MetaMask'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────── */}
      <main class="w-full pt-24 min-h-screen relative overflow-hidden">
        {/* Dynamic Ambient Backplane Orbs */}
        <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[340px] bg-gradient-to-r from-primary/15 via-secondary/15 to-transparent blur-[120px] pointer-events-none rounded-full"></div>
        <div class="absolute top-[520px] -left-48 w-[480px] h-[480px] bg-primary-container/10 blur-[140px] pointer-events-none rounded-full"></div>
        <div class="absolute top-[780px] -right-48 w-[520px] h-[520px] bg-secondary/10 blur-[150px] pointer-events-none rounded-full"></div>
        <div class="absolute bottom-0 left-1/3 w-[600px] h-[300px] bg-tertiary/10 blur-[130px] pointer-events-none rounded-full"></div>

        {/* Decorative Grid Texture */}
        <div class="absolute inset-0 bg-[radial-gradient(#38bdf8_0.6px,transparent_0.6px)] [background-size:24px_24px] opacity-[0.06] pointer-events-none"></div>

        <div class="relative z-10 max-w-[1280px] mx-auto w-full px-4 md:px-8 lg:px-12 py-10 flex flex-col gap-16">

          {/* ── HERO SECTION ────────────────────────────────────────── */}
          <section class="flex flex-col items-center text-center max-w-4xl mx-auto pt-6">
            {/* Academic Spec Badge */}
            <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container/80 border border-primary/25 backdrop-blur-md shadow-[0_0_16px_rgba(56,189,248,0.15)] mb-6">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-tertiary shadow-[0_0_8px_#34d399]"></span>
              </span>
              <span class="font-label-badge text-label-badge text-primary uppercase tracking-widest text-xs">
                NCKH · Blockchain · W3C Standard
              </span>
              <span class="text-outline text-xs">|</span>
              <span class="font-label-code text-label-code text-on-surface-variant text-xs">
                ERC-725 / ERC-735
              </span>
            </div>

            {/* Main Headline */}
            <h1 class="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-on-surface mb-3">
              Hệ thống Quản lý Danh tính Phi tập trung
            </h1>

            {/* Subtitle */}
            <p class="text-xl md:text-2xl font-semibold bg-gradient-to-r from-primary via-surface-tint to-secondary bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(142,213,255,0.35)] mb-4">
              Bảo vệ toàn vẹn văn bằng &amp; chứng chỉ số trên mạng lưới Ethereum
            </p>

            {/* Description */}
            <p class="text-base md:text-lg text-on-surface-variant max-w-3xl leading-relaxed mb-8">
              Giải pháp cấp phát và chứng thực văn bằng số dựa trên công nghệ <span class="text-primary font-medium">Decentralized Identifiers (DID)</span> và <span class="text-secondary font-medium">Verifiable Credentials (W3C)</span>. Toàn bộ bằng cấp được neo dữ liệu (<span class="text-tertiary font-mono">on-chain anchoring</span>) trên Smart Contract, loại bỏ hoàn toàn nguy cơ làm giả và hỗ trợ xác thực tức thì không cần qua bên trung gian.
            </p>

            {/* 4 Feature Pills */}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl">
              <div class="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container-high/80 border border-white/10 hover:border-primary/40 backdrop-blur-md transition-all duration-300 shadow-sm">
                <span class="text-base">🔗</span>
                <span class="font-label-code text-xs text-on-surface group-hover:text-primary transition-colors">On-chain Anchoring</span>
              </div>
              <div class="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container-high/80 border border-white/10 hover:border-secondary/40 backdrop-blur-md transition-all duration-300 shadow-sm">
                <span class="text-base">🛡️</span>
                <span class="font-label-code text-xs text-on-surface group-hover:text-secondary transition-colors">Chống giả mạo bằng cấp</span>
              </div>
              <div class="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container-high/80 border border-white/10 hover:border-tertiary/40 backdrop-blur-md transition-all duration-300 shadow-sm">
                <span class="text-base">📱</span>
                <span class="font-label-code text-xs text-on-surface group-hover:text-tertiary transition-colors">QR Presentation</span>
              </div>
              <div class="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container/60 hover:bg-surface-container-high/80 border border-white/10 hover:border-primary/40 backdrop-blur-md transition-all duration-300 shadow-sm">
                <span class="text-base">📋</span>
                <span class="font-label-code text-xs text-on-surface group-hover:text-primary transition-colors">Audit Trail On-Chain</span>
              </div>
            </div>
          </section>

          {/* ── LIVE TELEMETRY STRIP ─────────────────────────────────── */}
          <div class="w-full bg-surface-container-low/70 border border-white/5 rounded-xl p-3 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div class="flex items-center gap-4 flex-wrap">
              <div class="flex items-center gap-2 text-tertiary">
                <span class="material-symbols-outlined text-[18px]">hub</span>
                <span class="font-label-code text-xs text-on-surface font-semibold">Mạng Ganache Testnet</span>
              </div>
              <span class="text-outline-variant font-mono text-xs">/</span>
              <div class="flex items-center gap-1.5 font-label-code text-xs text-on-surface-variant">
                <span class="text-outline">RPC:</span>
                <span class="text-primary font-semibold">127.0.0.1:7545</span>
              </div>
              <span class="text-outline-variant font-mono text-xs">/</span>
              <div class="flex items-center gap-1.5 font-label-code text-xs text-on-surface-variant">
                <span class="text-outline">Chain ID:</span>
                <span class="text-on-surface font-semibold">1337 / 5777</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-tertiary/10 border border-tertiary/30 text-tertiary font-label-badge text-[11px] uppercase">
                <span class="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                Node Synchronized
              </span>
            </div>
          </div>

          {/* ── CORE SELECTION GRID: 3 INTERACTIVE ROLE CARDS ────────── */}
          <section id="roles-section" class="flex flex-col gap-6">
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-2 border-b border-white/5 pb-3">
              <div>
                <span class="font-label-code text-xs text-primary uppercase tracking-wider font-semibold">
                  Hệ thống Định danh Ba tác nhân (W3C Triangle of Trust)
                </span>
                <h2 class="text-2xl md:text-3xl font-bold text-on-surface tracking-tight mt-1">
                  Chọn vai trò truy cập hệ sinh thái
                </h2>
              </div>
              <p class="text-sm text-on-surface-variant max-w-sm">
                Thiết kế chuẩn mực tách rời người cấp, người giữ và người thẩm định mà không lưu giữ dữ liệu tập trung.
              </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* CARD 1: ISSUER (TRƯỜNG HỌC) */}
              <div
                onClick={() => onSelectRole('/issuer')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRole('/issuer')}
                class="group relative rounded-2xl bg-surface-container/70 border border-white/10 hover:border-primary/60 backdrop-blur-xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_0_30px_rgba(56,189,248,0.22)] hover:-translate-y-1.5 cursor-pointer text-left"
              >
                <div class="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 group-hover:opacity-100 transition-opacity"></div>
                <div>
                  <div class="flex items-start justify-between gap-3 mb-4">
                    <div class="w-14 h-14 rounded-2xl bg-primary-container/15 border border-primary/30 flex items-center justify-center text-2xl shadow-[0_0_16px_rgba(56,189,248,0.2)] group-hover:scale-105 transition-transform">
                      🏛️
                    </div>
                    <div class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-label-badge ${account ? 'bg-tertiary/10 border border-tertiary/30 text-tertiary' : 'bg-surface-container-high/80 border border-primary/30 text-primary'}`}>
                      <span class="material-symbols-outlined text-[14px]">{account ? 'check_circle' : 'lock'}</span>
                      <span>{account ? 'Ví đã sẵn sàng' : 'Cần ví MetaMask'}</span>
                    </div>
                  </div>
                  <div class="mb-2">
                    <span class="font-label-code text-xs text-primary font-semibold tracking-wider uppercase">Tác nhân phát hành</span>
                    <h3 class="text-2xl font-bold text-on-surface group-hover:text-primary transition-colors">Issuer</h3>
                    <p class="text-sm text-on-surface-variant mt-0.5">Trường / Viện / Tổ chức cấp bằng</p>
                  </div>
                  <p class="text-sm text-on-surface-variant/90 mb-5">
                    Ký số mật mã lên bảng điểm &amp; chứng nhận tốt nghiệp, phát hành trực tiếp vào định danh của sinh viên.
                  </p>
                  <div class="space-y-2 border-t border-white/5 pt-3.5 mb-6">
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">verified_user</span>
                      <span>Ký số &amp; ban hành Verifiable Credential chuẩn W3C</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">deployed_code</span>
                      <span>Ghi mã băm (Root Hash) lên Ethereum Smart Contract</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">event_busy</span>
                      <span>Quản trị danh sách thu hồi (<span class="font-mono text-xs text-primary">Revocation Registry</span>)</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-container/20 group-hover:bg-primary-container border border-primary/50 group-hover:border-primary text-primary group-hover:text-on-primary-container font-semibold text-sm transition-all duration-300 shadow-[0_0_16px_rgba(56,189,248,0.15)] group-hover:shadow-[0_0_24px_rgba(56,189,248,0.4)] cursor-pointer"
                >
                  <span>Truy cập Issuer</span>
                  <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>

              {/* CARD 2: HOLDER (SINH VIÊN) */}
              <div
                onClick={() => onSelectRole('/holder')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRole('/holder')}
                class="group relative rounded-2xl bg-surface-container/70 border border-white/10 hover:border-secondary/60 backdrop-blur-xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_0_30px_rgba(221,183,255,0.22)] hover:-translate-y-1.5 cursor-pointer text-left"
              >
                <div class="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-secondary to-transparent opacity-60 group-hover:opacity-100 transition-opacity"></div>
                <div>
                  <div class="flex items-start justify-between gap-3 mb-4">
                    <div class="w-14 h-14 rounded-2xl bg-secondary-container/30 border border-secondary/40 flex items-center justify-center text-2xl shadow-[0_0_16px_rgba(221,183,255,0.2)] group-hover:scale-105 transition-transform">
                      🎓
                    </div>
                    <div class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-label-badge ${account ? 'bg-tertiary/10 border border-tertiary/30 text-tertiary' : 'bg-surface-container-high/80 border border-secondary/30 text-secondary'}`}>
                      <span class="material-symbols-outlined text-[14px]">{account ? 'check_circle' : 'lock'}</span>
                      <span>{account ? 'Ví đã sẵn sàng' : 'Cần ví MetaMask'}</span>
                    </div>
                  </div>
                  <div class="mb-2">
                    <span class="font-label-code text-xs text-secondary font-semibold tracking-wider uppercase">Chủ thể sở hữu</span>
                    <h3 class="text-2xl font-bold text-on-surface group-hover:text-secondary transition-colors">Holder</h3>
                    <p class="text-sm text-on-surface-variant mt-0.5">Sinh viên nhận, lưu &amp; chia sẻ bằng</p>
                  </div>
                  <p class="text-sm text-on-surface-variant/90 mb-5">
                    Toàn quyền nắm giữ khóa riêng tư, kiểm soát hồ sơ học thuật trọn đời không phụ thuộc hệ thống máy chủ trường.
                  </p>
                  <div class="space-y-2 border-t border-white/5 pt-3.5 mb-6">
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">account_balance_wallet</span>
                      <span>Lưu trữ bằng cấp trong ví cá nhân an toàn tuyệt đối</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">qr_code_2</span>
                      <span>Xuất mã QR xác thực Verifiable Presentation tức thời</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">visibility_off</span>
                      <span>Bảo vệ quyền riêng tư (<span class="font-mono text-xs text-secondary">Selective Disclosure</span>)</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary/15 group-hover:bg-secondary border border-secondary/40 group-hover:border-secondary text-secondary group-hover:text-on-secondary font-semibold text-sm transition-all duration-300 shadow-[0_0_16px_rgba(221,183,255,0.12)] group-hover:shadow-[0_0_24px_rgba(221,183,255,0.35)] cursor-pointer"
                >
                  <span>Truy cập Holder</span>
                  <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>

              {/* CARD 3: VERIFIER (DOANH NGHIỆP) */}
              <div
                onClick={() => onSelectRole('/verifier')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRole('/verifier')}
                class="group relative rounded-2xl bg-surface-container/70 border border-white/10 hover:border-tertiary/60 backdrop-blur-xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-[0_0_30px_rgba(78,230,170,0.22)] hover:-translate-y-1.5 cursor-pointer text-left"
              >
                <div class="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-tertiary to-transparent opacity-60 group-hover:opacity-100 transition-opacity"></div>
                <div>
                  <div class="flex items-start justify-between gap-3 mb-4">
                    <div class="w-14 h-14 rounded-2xl bg-tertiary/15 border border-tertiary/30 flex items-center justify-center text-2xl shadow-[0_0_16px_rgba(78,230,170,0.2)] group-hover:scale-105 transition-transform">
                      🔎
                    </div>
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary/10 border border-tertiary/30 text-tertiary font-label-badge text-xs">
                      <span class="material-symbols-outlined text-[14px]">check_circle</span>
                      <span>Không cần đăng nhập</span>
                    </div>
                  </div>
                  <div class="mb-2">
                    <span class="font-label-code text-xs text-tertiary font-semibold tracking-wider uppercase">Tác nhân thẩm định</span>
                    <h3 class="text-2xl font-bold text-on-surface group-hover:text-tertiary transition-colors">Verifier</h3>
                    <p class="text-sm text-on-surface-variant mt-0.5">Doanh nghiệp kiểm tra &amp; tuyển dụng</p>
                  </div>
                  <p class="text-sm text-on-surface-variant/90 mb-5">
                    Đối soát trực tiếp chữ ký gốc của trường trên Blockchain Ethereum trong vài mili-giây, không cần gọi điện xác minh.
                  </p>
                  <div class="space-y-2 border-t border-white/5 pt-3.5 mb-6">
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5">document_scanner</span>
                      <span>Quét mã QR hoặc tải file JSON Credential trực tiếp</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5">key</span>
                      <span>Kiểm tra chữ ký mật mã &amp; tính toàn vẹn tức thì</span>
                    </div>
                    <div class="flex items-start gap-2 text-on-surface-variant text-sm">
                      <span class="material-symbols-outlined text-tertiary text-[18px] shrink-0 mt-0.5">sync_alt</span>
                      <span>Tra cứu trạng thái on-chain thời gian thực (Revoked / Active)</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-tertiary/15 group-hover:bg-tertiary border border-tertiary/40 group-hover:border-tertiary text-tertiary group-hover:text-on-tertiary font-semibold text-sm transition-all duration-300 shadow-[0_0_16px_rgba(78,230,170,0.12)] group-hover:shadow-[0_0_24px_rgba(78,230,170,0.35)] cursor-pointer"
                >
                  <span>Truy cập Verifier</span>
                  <span class="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>
            </div>
          </section>

          {/* ── ARCHITECTURE PROTOCOL DIAGRAM SECTION ────────────────── */}
          <section id="architecture-section" class="rounded-3xl bg-surface-container-low/80 border border-white/10 p-6 md:p-8 backdrop-blur-xl relative overflow-hidden">
            <div class="absolute -right-24 -bottom-24 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="flex flex-col lg:flex-row items-center justify-between gap-8">
              <div class="flex flex-col max-w-lg">
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-label-code text-xs text-primary uppercase font-semibold">Cơ chế bảo mật W3C</span>
                  <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span class="font-label-code text-xs text-outline">Ethereum Smart Contract</span>
                </div>
                <h3 class="text-2xl font-bold text-on-surface mb-3">Tam giác Niềm tin Mật mã học</h3>
                <p class="text-sm text-on-surface-variant leading-relaxed mb-5">
                  Khác biệt với kiến trúc máy chủ truyền thống, hệ thống triển khai chu trình xác minh 3 chiều: Trường học (Issuer) phát hành bằng cho Sinh viên (Holder) kèm chữ ký ECDSA secp256k1; Doanh nghiệp (Verifier) đối soát Root Hash trên mạng Ganache mà không cần gọi API máy chủ trường.
                </p>
                <div class="grid grid-cols-2 gap-3">
                  <div class="p-3 rounded-xl bg-surface-container/60 border border-white/5">
                    <span class="font-label-code text-xs text-on-surface-variant block">Thuật toán chữ ký</span>
                    <span class="text-base font-bold text-primary">ECDSA / EIP-712</span>
                  </div>
                  <div class="p-3 rounded-xl bg-surface-container/60 border border-white/5">
                    <span class="font-label-code text-xs text-on-surface-variant block">Độ trễ đối soát</span>
                    <span class="text-base font-bold text-tertiary">&lt; 0.25 giây</span>
                  </div>
                </div>
              </div>

              {/* Inline Visual Protocol Diagram (SVG) */}
              <div class="w-full lg:w-[460px] p-4 rounded-2xl bg-surface-container/80 border border-white/10 shadow-xl">
                <svg class="w-full h-auto" fill="none" viewBox="0 0 440 260" xmlns="http://www.w3.org/2000/svg">
                  <rect fill="#151b2b" height="60" rx="10" stroke="#38bdf8" stroke-width="1.5" width="110" x="20" y="20"></rect>
                  <text fill="#dde2f8" font-family="Inter" font-size="12" font-weight="600" text-anchor="middle" x="75" y="46">🏛️ ISSUER</text>
                  <text fill="#87929a" font-family="JetBrains Mono" font-size="9" text-anchor="middle" x="75" y="64">Trường ĐH</text>

                  <rect fill="#151b2b" height="60" rx="10" stroke="#ddb7ff" stroke-width="1.5" width="110" x="310" y="20"></rect>
                  <text fill="#dde2f8" font-family="Inter" font-size="12" font-weight="600" text-anchor="middle" x="365" y="46">🎓 HOLDER</text>
                  <text fill="#87929a" font-family="JetBrains Mono" font-size="9" text-anchor="middle" x="365" y="64">Ví cá nhân</text>

                  <rect fill="#151b2b" height="60" rx="10" stroke="#4ee6aa" stroke-width="1.5" width="110" x="165" y="170"></rect>
                  <text fill="#dde2f8" font-family="Inter" font-size="12" font-weight="600" text-anchor="middle" x="220" y="196">🔎 VERIFIER</text>
                  <text fill="#87929a" font-family="JetBrains Mono" font-size="9" text-anchor="middle" x="220" y="214">Doanh nghiệp</text>

                  <path d="M130 50 L310 50" stroke="#38bdf8" stroke-dasharray="3 3" stroke-width="1.5"></path>
                  <circle cx="220" cy="50" fill="#080e1d" r="14" stroke="#38bdf8" stroke-width="1"></circle>
                  <text fill="#38bdf8" font-family="JetBrains Mono" font-size="8" text-anchor="middle" x="220" y="53">VC</text>

                  <path d="M335 80 L250 170" stroke="#ddb7ff" stroke-dasharray="3 3" stroke-width="1.5"></path>
                  <circle cx="292" cy="125" fill="#080e1d" r="14" stroke="#ddb7ff" stroke-width="1"></circle>
                  <text fill="#ddb7ff" font-family="JetBrains Mono" font-size="8" text-anchor="middle" x="292" y="128">VP</text>

                  <path d="M190 170 L105 80" stroke="#4ee6aa" stroke-width="1.5"></path>
                  <circle cx="147" cy="125" fill="#080e1d" r="14" stroke="#4ee6aa" stroke-width="1"></circle>
                  <text fill="#4ee6aa" font-family="JetBrains Mono" font-size="8" text-anchor="middle" x="147" y="128">ETH</text>

                  <circle cx="220" cy="105" fill="#191f2f" r="16" stroke="#87929a" stroke-width="1"></circle>
                  <path d="M220 96 L227 107 L220 110 L213 107 Z" fill="#38bdf8"></path>
                  <path d="M220 111 L227 108 L220 117 L213 108 Z" fill="#8ed5ff"></path>
                </svg>
                <div class="mt-2 text-center">
                  <span class="font-label-code text-outline text-[11px]">W3C Verifiable Credentials · Ethereum Smart Contract On-Chain</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── BOTTOM CTA AREA ──────────────────────────────────────── */}
          <section class="relative rounded-3xl bg-gradient-to-b from-surface-container/90 to-surface-container-low/90 border border-white/15 p-6 md:p-12 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"></div>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-primary/10 blur-[90px] pointer-events-none"></div>

            <div class="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
              <div class="w-16 h-16 rounded-2xl bg-surface-container-highest/60 border border-white/15 flex items-center justify-center mb-4 shadow-[0_0_24px_rgba(246,133,27,0.2)]">
                <span class="text-3xl">🦊</span>
              </div>
              <h3 class="text-2xl md:text-3xl font-bold text-on-surface mb-2">Sẵn sàng trải nghiệm xác thực số?</h3>
              <p class="text-sm md:text-base text-on-surface-variant max-w-xl mb-6">
                Kết nối ví Web3 với quyền hạn Trường hoặc Sinh viên để ký số văn bằng; hoặc truy cập trực tiếp chế độ Khách kiểm tra không rào cản.
              </p>

              {/* CTA Buttons */}
              <div class="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mb-8">
                {account ? (
                  <div class="flex flex-col sm:flex-row items-center gap-3 bg-surface-container-high/60 border border-tertiary/30 px-6 py-3 rounded-xl">
                    <span class="text-tertiary font-medium text-sm">
                      ✅ Ví đã kết nối: <strong class="font-mono">{shortAddr(account)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectRole('/issuer')}
                      class="px-4 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold cursor-pointer"
                    >
                      🏛️ Vào Issuer
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectRole('/holder')}
                      class="px-4 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-semibold cursor-pointer"
                    >
                      🎓 Vào Holder
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onConnect}
                    disabled={isConnecting}
                    class="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary-container to-surface-tint hover:opacity-95 text-on-primary font-bold text-sm shadow-[0_0_28px_rgba(56,189,248,0.45)] transition-all cursor-pointer"
                  >
                    <span class="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                    <span>{isConnecting ? 'Đang kết nối...' : 'Kết nối MetaMask — Trường / Sinh viên'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onSelectRole('/verifier')}
                  class="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 hover:border-tertiary/50 text-on-surface font-semibold text-sm backdrop-blur-md transition-all cursor-pointer shadow-sm"
                >
                  <span class="material-symbols-outlined text-tertiary text-[20px]">qr_code_scanner</span>
                  <span>Xác thực bằng cấp (Khách / Doanh nghiệp)</span>
                </button>
              </div>

              {/* Web3 Info Strip */}
              <div class="w-full max-w-2xl bg-surface-container-lowest/80 border border-white/10 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 font-label-code text-xs text-on-surface-variant backdrop-blur-md">
                <div class="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                  <span class="inline-block w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#34d399]"></span>
                  <span class="text-on-surface font-medium">Ganache RPC:</span>
                  <span class="text-primary">http://127.0.0.1:7545</span>
                  <span class="text-outline">|</span>
                  <span>Chain ID: <strong class="text-on-surface">1337</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyContract}
                  class="group flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-high border border-white/10 hover:border-primary/50 text-on-surface hover:text-primary transition-colors cursor-pointer"
                  title="Sao chép địa chỉ Smart Contract"
                >
                  <span class="text-[11px]">Contract: <code class="text-primary font-mono">{shortAddr(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY)}</code></span>
                  <span class="text-[10px] px-1 rounded bg-tertiary/20 text-tertiary font-bold">
                    {copied ? 'Đã chép!' : 'Verified'}
                  </span>
                  <span class="material-symbols-outlined text-[14px] text-outline group-hover:text-primary transition-colors">
                    {copied ? 'done' : 'content_copy'}
                  </span>
                </button>
              </div>

              <div class="mt-4 flex items-center gap-1.5 text-on-surface-variant text-[11px]">
                <span class="material-symbols-outlined text-[14px] text-primary">school</span>
                <span>Đề tài Nghiên cứu Khoa học (NCKH) · Xây dựng trên chuẩn W3C DID Core &amp; Ethereum Smart Contracts</span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer class="w-full bg-surface-container-low border-t border-white/5 mt-16 py-8">
        <div class="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4 text-on-surface-variant text-sm">
          <div class="flex items-center gap-2">
            <span class="font-label-code text-xs text-primary uppercase">DID Registry Node: Ganache 1337</span>
            <span class="inline-block w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#34d399]"></span>
          </div>
          <div class="flex items-center gap-6 font-label-code text-xs">
            <span class="text-on-surface-variant">EIP-712</span>
            <span class="text-on-surface-variant">W3C DID v1.0</span>
            <span class="text-on-surface-variant">Selective Disclosure</span>
            <span class="text-on-surface-variant">© 2025–2026 NCKH Blockchain</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
