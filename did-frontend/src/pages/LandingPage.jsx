import { useState } from 'react';

export default function LandingPage({ onConnect, isConnecting, onGuestVerifier }) {

  return (
    <div className="landing-root">
      {/* Animated background orbs */}
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />
      <div className="landing-grid" />

      <div className="landing-content">

        {/* Top brand */}
        <div className="landing-logo-wrap">
          <div className="landing-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L28 8.5V23.5L16 30L4 23.5V8.5L16 2Z"
                stroke="url(#g1)" strokeWidth="1.5" fill="rgba(99,179,237,0.08)" />
              <path d="M16 8L22 11.5V18.5L16 22L10 18.5V11.5L16 8Z"
                fill="url(#g1)" opacity="0.7" />
              <circle cx="16" cy="15" r="2.5" fill="white" />
              <defs>
                <linearGradient id="g1" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#63b3ed" /><stop offset="1" stopColor="#b794f4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="landing-brand-name">DID System</span>
        </div>

        {/* Tag */}
        <div className="landing-tag">🔬 NCKH · Blockchain · W3C DID Standard</div>

        {/* Headline */}
        <h1 className="landing-headline">
          Hệ thống Quản lý<br />
          <span className="landing-headline-gradient">Danh tính Phi tập trung</span>
        </h1>

        <p className="landing-description">
          Nền tảng cấp phát và xác thực <strong>Verifiable Credentials</strong> dựa trên
          Blockchain Ethereum — bảo mật, chống giả mạo bằng cấp, không cần trung gian.
        </p>

        {/* Feature pills */}
        <div className="landing-features">
          {[
            ['🔗', 'On-chain Anchoring'],
            ['🛡️', 'Chống giả mạo bằng cấp'],
            ['📱', 'QR Verifiable Presentation'],
            ['📋', 'Audit Trail trên chuỗi'],
          ].map(([icon, label]) => (
            <div key={label} className="landing-feature-pill">
              <span>{icon}</span> {label}
            </div>
          ))}
        </div>

        {/* Role Cards — explain who uses what */}
        <div className="landing-roles">
          <div className="landing-role-card role-issuer">
            <div className="role-icon">🏛️</div>
            <div className="role-name">Issuer</div>
            <div className="role-desc">Trường / Tổ chức</div>
            <div className="role-auth-badge auth-required">🔐 Cần đăng nhập</div>
          </div>
          <div className="landing-role-card role-holder">
            <div className="role-icon">🎓</div>
            <div className="role-name">Holder</div>
            <div className="role-desc">Sinh viên</div>
            <div className="role-auth-badge auth-required">🔐 Cần đăng nhập</div>
          </div>
          <div className="landing-role-card role-verifier">
            <div className="role-icon">🔎</div>
            <div className="role-name">Verifier</div>
            <div className="role-desc">Doanh nghiệp</div>
            <div className="role-auth-badge auth-guest">✅ Không cần đăng nhập</div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="landing-cta-group">
          {/* Primary: Connect MetaMask */}
          <button
            id="btn-connect-metamask"
            className={`landing-cta-btn ${isConnecting ? 'loading' : ''}`}
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <><span className="landing-spinner" /> Đang kết nối ví...</>
            ) : (
              <><MetaMaskIcon /> Kết nối MetaMask — Trường / Sinh viên</>
            )}
          </button>

          {/* Secondary: Guest Verifier */}
          <button
            id="btn-guest-verifier"
            className="landing-guest-btn"
            onClick={onGuestVerifier}
          >
            <span>🔎</span>
            Xác thực bằng cấp <span className="guest-btn-sub">(Doanh nghiệp · Không cần đăng nhập)</span>
          </button>
        </div>

        <p className="landing-cta-hint">
          MetaMask cần cấu hình mạng Ganache · <code>localhost:7545</code> · Chain ID <code>1337</code>
        </p>

        <p className="landing-footer-note">
          Dự án Nghiên cứu Khoa học · Khoa Công nghệ Thông tin · 2025–2026
        </p>
      </div>
    </div>
  );
}

function MetaMaskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 318.6 318.6" style={{ flexShrink: 0 }}>
      <polygon points="274.1,35.5 174.6,109.4 193,65.8" fill="#E2761B" />
      <polygon points="44.4,35.5 143.1,110.1 125.6,65.8" fill="#E4761B" />
      <polygon points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7" fill="#E4761B" />
      <polygon points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8" fill="#E4761B" />
      <polygon points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1" fill="#E4761B" />
      <polygon points="214.9,138.2 175.9,103.4 174.6,164.6 230.8,162.1" fill="#E4761B" />
      <polygon points="106.8,247.4 140.6,230.9 111.4,208.1" fill="#E4761B" />
      <polygon points="177.9,230.9 211.8,247.4 207.1,208.1" fill="#E4761B" />
    </svg>
  );
}
