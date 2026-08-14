import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import QRCode from "qrcode";
import {
  getSigner,
  getAccount,
  getProvider,
  shortAddr,
  formatTimestamp,
} from "../utils/web3";
import {
  CONTRACT_ADDRESSES,
  CREDENTIAL_REGISTRY_ABI,
  DID_REGISTRY_ABI,
} from "../utils/contracts";

const VP_HISTORY_KEY = (addr) => `vp_history_${addr.toLowerCase()}`;
const MAX_HISTORY = 20;

export default function HolderPage({ account: propAccount }) {
  const account = propAccount || getAccount();

  /* ── DID state ─────────────────────────────────────── */
  const [myDid, setMyDid]               = useState(null);
  const [didLoading, setDidLoading]     = useState(false);
  const [didRegLoading, setDidRegLoading] = useState(false);
  const [didStatus, setDidStatus]       = useState(null);

  /* ── VC state ──────────────────────────────────────── */
  const [vcs, setVcs]           = useState([]);
  const [vcLoading, setVcLoading] = useState(false);
  const [selectedVc, setSelectedVc] = useState(null);

  /* ── VP state ──────────────────────────────────────── */
  const [vpJson, setVpJson]       = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [vpLoading, setVpLoading] = useState(false);

  /* ── Share history ─────────────────────────────────── */
  const [shareHistory, setShareHistory] = useState([]);
  const [showHistory, setShowHistory]   = useState(false);

  useEffect(() => {
    if (account) {
      loadMyDID();
      loadVCs();
      loadShareHistory();
    }
  }, [account]);

  /* ─────────────────────────────────────────────────────
     DID
  ───────────────────────────────────────────────────── */
  async function loadMyDID() {
    setDidLoading(true);
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, provider
      );
      const doc = await contract.resolveDID(account);
      setMyDid(doc.isActive && doc.owner !== ethers.ZeroAddress ? doc : null);
    } catch (e) { console.error("loadMyDID:", e); }
    setDidLoading(false);
  }

  async function handleRegisterDID() {
    setDidRegLoading(true); setDidStatus(null);
    try {
      const signer  = getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer
      );
      const pk  = `pubkey-${account.slice(2, 10)}`;
      const svc = `https://holder.did.service/${account.slice(2, 10)}`;
      const tx  = await contract.registerDID(pk, svc);
      await tx.wait();
      setDidStatus({ type: "success", msg: "✅ DID đã đăng ký thành công trên blockchain!" });
      await loadMyDID();
    } catch (e) {
      setDidStatus({ type: "error", msg: e.reason || e.message });
    }
    setDidRegLoading(false);
  }

  /* ─────────────────────────────────────────────────────
     Verifiable Credentials
  ───────────────────────────────────────────────────── */
  async function loadVCs() {
    setVcLoading(true);
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider
      );
      const hashesOnChain = await contract.getHolderCredentials(account);
      const normalizedAddr = account.toLowerCase();
      const localVCs = JSON.parse(localStorage.getItem(`vcs_${normalizedAddr}`) || "[]");
      const now = Math.floor(Date.now() / 1000);

      const combined = [];
      for (const hash of hashesOnChain) {
        const d = await contract.getCredential(hash);
        const local = localVCs.find((v) => v.vcHash === hash);
        let vcData = null;
        if (local) vcData = JSON.parse(local.vcJson);

        /* Health status */
        let health = "valid";
        if (d.isRevoked) {
          health = "revoked";
        } else if (d.expiresAt > 0n) {
          const exp = Number(d.expiresAt);
          if (exp < now) health = "expired";
          else if (exp - now < 30 * 86400) health = "expiring";
        }

        combined.push({
          hash,
          issuer:    d.issuer,
          type:      d.credentialType,
          issuedAt:  d.issuedAt,
          expiresAt: d.expiresAt,
          isRevoked: d.isRevoked,
          vcData,
          health,
        });
      }
      setVcs(combined.reverse());
    } catch (e) { console.error("loadVCs:", e); }
    setVcLoading(false);
  }

  /* ─────────────────────────────────────────────────────
     Verifiable Presentation
  ───────────────────────────────────────────────────── */
  async function handleSelectVc(vc) {
    setSelectedVc(vc);
    setVpJson("");
    setQrDataUrl("");
    setVpLoading(true);
    try {
      if (!vc.vcData) throw new Error("Thiếu dữ liệu chi tiết VC (off-chain data missing).");
      if (vc.isRevoked)  throw new Error("VC đã bị thu hồi, không thể tạo VP.");
      if (vc.health === "expired") throw new Error("VC đã hết hạn, không thể tạo VP.");

      const signer = getSigner();
      const payload = {
        vcHash:    vc.hash,
        holder:    account,
        timestamp: Date.now(),
      };
      const messageToSign = JSON.stringify(payload);
      const signature     = await signer.signMessage(messageToSign);

      const vp = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiablePresentation"],
        verifiableCredential: [vc.vcData],
        proof: {
          type:               "EthereumPersonalSignature2021",
          created:            new Date().toISOString(),
          verificationMethod: `did:ethr:${account}#controller`,
          proofPurpose:       "authentication",
          proofValue:         signature,
          payload:            messageToSign,
        },
      };
      const vpString = JSON.stringify(vp, null, 2);
      setVpJson(vpString);

      /* QR code — compact VP (tạo data URL ảnh để render trực tiếp vào thẻ img) */
      const compactVp = {
        holder: account,
        vcHash: vc.hash,
        sig:    signature,
        ts:     payload.timestamp,
      };
      const qrUrl = await QRCode.toDataURL(JSON.stringify(compactVp), {
        width: 260,
        margin: 2,
        color: { dark: "#1A202C", light: "#FFFFFF" },
      });
      setQrDataUrl(qrUrl);

      /* Lưu lịch sử */
      saveToHistory(vc.hash, vc.type);
    } catch (e) {
      alert("Lỗi tạo VP: " + (e.reason || e.message));
    }
    setVpLoading(false);
  }

  /* ─────────────────────────────────────────────────────
     Share history
  ───────────────────────────────────────────────────── */
  function loadShareHistory() {
    const h = JSON.parse(localStorage.getItem(VP_HISTORY_KEY(account)) || "[]");
    setShareHistory(h);
  }
  function saveToHistory(vcHash, credType) {
    const h = JSON.parse(localStorage.getItem(VP_HISTORY_KEY(account)) || "[]");
    h.unshift({ timestamp: Date.now(), vcHash, credType });
    if (h.length > MAX_HISTORY) h.pop();
    localStorage.setItem(VP_HISTORY_KEY(account), JSON.stringify(h));
    setShareHistory(h);
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  if (!account) return (
    <div className="connect-prompt">
      <div className="connect-prompt-icon">🎓</div>
      <h2>Kết nối ví MetaMask</h2>
      <p>Vui lòng kết nối ví MetaMask để quản lý danh tính sinh viên.</p>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-badge badge-holder">🎓 HOLDER — Sinh viên</div>
        <h1 className="page-title">Ví Danh tính Số</h1>
        <p className="page-subtitle">
          Quản lý danh tính phi tập trung, bằng cấp và chia sẻ VP với nhà tuyển dụng.
          <br />
          <span style={{ color: "var(--purple)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Ví: {shortAddr(account)}
          </span>
        </p>
      </div>

      {/* ══════════════ SECTION 1: DID Identity ══════════════ */}
      <div className="section card" style={{ marginBottom: 20 }}>
        <div className="card-title">🪪 Danh tính Phi tập trung (DID)</div>

        {didLoading ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <span className="spinner" /> Đang tải trạng thái DID...
          </div>
        ) : myDid ? (
          /* DID đã đăng ký → hiển thị campus card + thông tin */
          <div>
            <div className="did-active-row">
              <span className="did-badge did-active">✅ DID Đang hoạt động</span>
              <code className="did-code">{myDid.did}</code>
            </div>

            {/* Campus Card */}
            <CampusCard
              did={myDid}
              account={account}
              latestVc={vcs.find(v => v.health === "valid")}
            />

            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                📅 Tạo: <strong style={{ color: "var(--text-secondary)" }}>{formatTimestamp(myDid.createdAt)}</strong>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                🔄 Cập nhật: <strong style={{ color: "var(--text-secondary)" }}>{formatTimestamp(myDid.updatedAt)}</strong>
              </div>
            </div>
          </div>
        ) : (
          /* Chưa có DID → hiển thị nút đăng ký */
          <div>
            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              ⚠️ Bạn <strong>chưa có Danh tính số (DID)</strong>. Hãy đăng ký để:
              <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Nhà tuyển dụng xác thực được danh tính bạn</li>
                <li>Nhận và quản lý bằng cấp từ trường</li>
                <li>Tạo Verifiable Presentation có chữ ký</li>
              </ul>
            </div>
            {didStatus && (
              <div className={`alert alert-${didStatus.type === "success" ? "success" : "error"}`} style={{ marginBottom: 12 }}>
                {didStatus.msg}
              </div>
            )}
            <button
              id="btn-register-did-holder"
              className="btn btn-primary"
              onClick={handleRegisterDID}
              disabled={didRegLoading}
            >
              {didRegLoading ? <><span className="spinner" /> Đang đăng ký trên Blockchain...</> : "🪪 Đăng ký DID của tôi"}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════ SECTION 2: VCs + VP ══════════════════ */}
      <div className="card-grid">

        {/* Danh sách VC */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title">
            📜 Bằng cấp / Chứng chỉ của tôi
            <button
              className="btn btn-outline btn-sm"
              onClick={loadVCs}
              style={{ marginLeft: "auto", padding: "4px 10px" }}
            >
              ↻ Tải lại
            </button>
          </div>

          {vcLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /> Đang tải...</div>
          ) : vcs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              Chưa có chứng chỉ nào được cấp.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 480, paddingRight: 4 }}>
              {vcs.map((vc) => (
                <div
                  key={vc.hash}
                  className={`vc-card ${selectedVc?.hash === vc.hash ? "selected" : ""} ${vc.health}`}
                  onClick={() => handleSelectVc(vc)}
                >
                  <div className="vc-card-header">
                    <span className="vc-type">{vc.type}</span>
                    <HealthBadge health={vc.health} expiresAt={vc.expiresAt} />
                  </div>
                  <div className="info-row" style={{ padding: "4px 0", border: "none" }}>
                    <span className="info-label" style={{ fontSize: 12 }}>Issuer:</span>
                    <span className="info-value info-mono">{shortAddr(vc.issuer)}</span>
                  </div>
                  <div className="info-row" style={{ padding: "4px 0", border: "none" }}>
                    <span className="info-label" style={{ fontSize: 12 }}>Cấp lúc:</span>
                    <span className="info-value" style={{ fontSize: 12 }}>{formatTimestamp(vc.issuedAt)}</span>
                  </div>
                  {vc.expiresAt > 0n && (
                    <div className="info-row" style={{ padding: "4px 0", border: "none" }}>
                      <span className="info-label" style={{ fontSize: 12 }}>Hết hạn:</span>
                      <span className="info-value" style={{ fontSize: 12, color: vc.health === "expiring" ? "var(--yellow)" : "" }}>
                        {formatTimestamp(vc.expiresAt)}
                      </span>
                    </div>
                  )}
                  <div className="vc-hash" title={vc.hash}>{vc.hash.slice(0, 20)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tạo VP + QR */}
        <div className="card">
          <div className="card-title">🔐 Tạo VP & Chia sẻ</div>

          {!selectedVc ? (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <div className="empty-state-icon">👆</div>
              Chọn một chứng chỉ bên trái để tạo Verifiable Presentation.
            </div>
          ) : (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 13 }}>
                Đang tạo VP cho: <strong>{selectedVc.type}</strong>
                <br />MetaMask sẽ yêu cầu ký xác nhận quyền sở hữu.
              </div>

              {vpLoading && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <span className="spinner" /> Đang tạo chữ ký số...
                </div>
              )}

              {vpJson && !vpLoading && (
                <>
                  <div className="qr-container">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>🔳 Mã QR Xác thực</span>
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Mã QR Xác thực"
                        style={{
                          width: 220,
                          height: 220,
                          borderRadius: 12,
                          display: "block",
                          margin: "12px auto",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                        }}
                      />
                    ) : (
                      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="spinner" />
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                      Đưa mã QR này cho nhà tuyển dụng (Verifier) để xác thực danh tính.
                    </p>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--cyan)" }}>
                      Verifiable Presentation (JSON-LD):
                    </div>
                    <div className="vp-display">{vpJson}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className="btn btn-outline"
                        style={{ flex: 1 }}
                        onClick={() => { navigator.clipboard.writeText(vpJson); alert("Đã copy VP JSON!"); }}
                      >
                        📋 Copy JSON
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ flex: 1 }}
                        onClick={() => {
                          const blob = new Blob([vpJson], { type: "application/json" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `vp-${selectedVc.type}-${Date.now()}.json`;
                          a.click();
                        }}
                      >
                        ⬇ Tải VP
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════ SECTION 3: Lịch sử chia sẻ ══════════ */}
      {shareHistory.length > 0 && (
        <div className="section card" style={{ marginTop: 20 }}>
          <div
            className="card-title"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setShowHistory(!showHistory)}
          >
            📋 Lịch sử Chia sẻ VP
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
              {shareHistory.length} lần · {showHistory ? "▲ Thu gọn" : "▼ Xem"}
            </span>
          </div>
          {showHistory && (
            <div style={{ marginTop: 8 }}>
              {shareHistory.slice(0, 10).map((item, i) => (
                <div key={i} className="info-row" style={{ padding: "8px 0", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                    {new Date(item.timestamp).toLocaleString("vi-VN")}
                  </span>
                  <span className="vc-type" style={{ fontSize: 12 }}>{item.credType}</span>
                  <span className="info-mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                    {item.vcHash.slice(0, 18)}...
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Campus Card Component
══════════════════════════════════════════════════════════ */
function CampusCard({ did, account, latestVc }) {
  const subj = latestVc?.vcData?.credentialSubject;
  return (
    <div className="campus-card">
      <div className="campus-card-header">
        <div className="campus-card-logo">🏛️</div>
        <div style={{ flex: 1 }}>
          <div className="campus-card-university">Trường Đại học Xây dựng Hà Nội</div>
          <div className="campus-card-subtitle">Student Digital Identity Card</div>
        </div>
        <div className="campus-card-active-dot" title="Active" />
      </div>

      <div className="campus-card-body">
        <div className="campus-card-info">
          <div className="campus-card-name">{subj?.studentName || shortAddr(account)}</div>
          <div className="campus-card-field">
            <span className="campus-field-label">MSSV</span>
            <span className="campus-field-value">{subj?.studentId || "—"}</span>
          </div>
          <div className="campus-card-field">
            <span className="campus-field-label">Ngành</span>
            <span className="campus-field-value">{subj?.major || "—"}</span>
          </div>
          {latestVc && (
            <div className="campus-card-field">
              <span className="campus-field-label">Bằng cấp</span>
              <span className="campus-field-value">{latestVc.type}</span>
            </div>
          )}
          <div className="campus-card-field">
            <span className="campus-field-label">DID</span>
            <span className="campus-field-value" style={{ fontSize: 10, fontFamily: "monospace", wordBreak: "break-all" }}>
              {did.did.length > 36 ? did.did.slice(0, 36) + "..." : did.did}
            </span>
          </div>
        </div>

        <div className="campus-card-badge-col">
          <div className="campus-card-type-badge">
            {latestVc ? latestVc.type.replace("Degree", "").replace("Certificate", "Cert") : "ID"}
          </div>
          <div className="campus-card-chain-icon">⬡</div>
        </div>
      </div>

      <div className="campus-card-footer">
        <span>🔗 Blockchain Verified · Ganache 1337</span>
        <span style={{ opacity: 0.7 }}>DID System NCKH 2026</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Health Badge Component
══════════════════════════════════════════════════════════ */
function HealthBadge({ health, expiresAt }) {
  const now = Math.floor(Date.now() / 1000);
  switch (health) {
    case "revoked":  return <span className="status-badge status-inactive">⛔ Thu hồi</span>;
    case "expired":  return <span className="status-badge status-inactive">⏰ Hết hạn</span>;
    case "expiring": {
      const days = Math.ceil((Number(expiresAt) - now) / 86400);
      return <span className="status-badge status-pending">⚠️ Còn {days} ngày</span>;
    }
    default: return <span className="status-badge status-active">✅ Hợp lệ</span>;
  }
}
