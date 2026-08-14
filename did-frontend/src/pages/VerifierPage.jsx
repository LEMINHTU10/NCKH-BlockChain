import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getSigner, getAccount, shortAddr, formatTimestamp } from "../utils/web3";
import {
  CONTRACT_ADDRESSES,
  CREDENTIAL_REGISTRY_ABI,
  DID_REGISTRY_ABI,
  IDENTITY_VERIFIER_ABI,
} from "../utils/contracts";

const GANACHE_RPC = import.meta.env.VITE_GANACHE_URL || "http://localhost:7545";
const getReadProvider = () => new ethers.JsonRpcProvider(GANACHE_RPC);

export default function VerifierPage({ account: propAccount }) {
  const account = propAccount !== undefined ? propAccount : getAccount();

  /* ── Verify state ──────────────────────────────────── */
  const [vpInput, setVpInput]       = useState("");
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [loading, setLoading]       = useState(false);

  /* ── Audit log state ───────────────────────────────── */
  const [auditLog, setAuditLog]     = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit]   = useState(false);

  /* ─────────────────────────────────────────────────────
     Xác thực VP
  ───────────────────────────────────────────────────── */
  async function handleVerify() {
    if (!vpInput.trim()) { alert("Vui lòng nhập JSON của VP!"); return; }
    setLoading(true); setVerifyStatus(null);

    try {
      /* Bước 1: Parse JSON */
      let parsed;
      try { parsed = JSON.parse(vpInput); }
      catch { throw new Error("Định dạng JSON không hợp lệ."); }

      let vcHash = "", holderAddr = "", signature = "", payloadToVerify = "";

      if (parsed.proof?.payload) {
        /* Full VP JSON-LD */
        signature       = parsed.proof.proofValue;
        payloadToVerify = parsed.proof.payload;
        const obj       = JSON.parse(payloadToVerify);
        vcHash          = obj.vcHash;
        holderAddr      = obj.holder;
      } else if (parsed.sig && parsed.vcHash) {
        /* Compact VP từ QR code */
        signature       = parsed.sig;
        vcHash          = parsed.vcHash;
        holderAddr      = parsed.holder;
        payloadToVerify = JSON.stringify({ vcHash: parsed.vcHash, holder: parsed.holder, timestamp: parsed.ts });
      } else {
        throw new Error("Cấu trúc VP không chứa thông tin chữ ký hợp lệ.");
      }

      if (!vcHash || !holderAddr) throw new Error("Thiếu vcHash hoặc địa chỉ holder.");

      /* Bước 2: Xác thực chữ ký số (off-chain) */
      const recoveredAddr = ethers.verifyMessage(payloadToVerify, signature);
      if (recoveredAddr.toLowerCase() !== holderAddr.toLowerCase()) {
        throw new Error("❌ Chữ ký số không hợp lệ — VP này đã bị giả mạo hoặc chỉnh sửa.");
      }

      /* Bước 3: Xác thực on-chain
         ─ Nếu có ví MetaMask → gọi verifyIdentity() (ghi audit log)
         ─ Nếu khách          → gọi view functions trực tiếp (không cần gas)  */
      let isValid = false, reason = "", steps;

      if (account) {
        /* === Chế độ có ví: dùng IdentityVerifier.verifyIdentity() === */
        const signer   = getSigner();
        const ivContract = new ethers.Contract(
          CONTRACT_ADDRESSES.IDENTITY_VERIFIER, IDENTITY_VERIFIER_ABI, signer
        );
        const tx      = await ivContract.verifyIdentity(holderAddr, vcHash);
        const receipt = await tx.wait();

        const event = receipt.logs.find(log => log.fragment?.name === "IdentityVerified");
        if (event) {
          isValid = event.args[3];
          reason  = event.args[4];
        } else {
          /* Fallback: staticCall */
          const [v, r] = await ivContract.verifyIdentity.staticCall(holderAddr, vcHash);
          isValid = v; reason = r;
        }
        steps = buildSteps(true, isValid, isValid, isValid);

      } else {
        /* === Chế độ khách: view functions ===
           ① DID active?  ② VC valid?  ③ holder match? */
        const provider = getReadProvider();
        const didContract  = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY,    DID_REGISTRY_ABI,    provider);
        const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider);

        const didDoc = await didContract.resolveDID(holderAddr);
        if (!didDoc.isActive || didDoc.owner === ethers.ZeroAddress) {
          reason  = "DID của Holder không tồn tại hoặc đã bị vô hiệu hóa.";
          steps   = buildSteps(true, false, false, false);
          setVerifyStatus({ valid: false, reason, details: parsed, steps });
          setLoading(false); return;
        }

        const [vcValid, vcReason] = await credContract.verifyCredential(vcHash);
        if (!vcValid) {
          steps = buildSteps(true, true, false, false);
          setVerifyStatus({ valid: false, reason: vcReason, details: parsed, steps });
          setLoading(false); return;
        }

        const cred = await credContract.getCredential(vcHash);
        if (cred.holder.toLowerCase() !== holderAddr.toLowerCase()) {
          reason  = "VC này không thuộc về Holder được khai báo trong VP.";
          steps   = buildSteps(true, true, true, false);
          setVerifyStatus({ valid: false, reason, details: parsed, steps });
          setLoading(false); return;
        }

        isValid = true;
        reason  = "Danh tính hợp lệ.";
        steps   = buildSteps(true, true, true, true);
      }

      setVerifyStatus({ valid: isValid, reason, details: parsed, steps, withWallet: !!account });
    } catch (e) {
      setVerifyStatus({ valid: false, reason: e.reason || e.message, details: null, steps: null });
    }
    setLoading(false);
  }

  /* ─────────────────────────────────────────────────────
     Audit log (chỉ khi có ví, đọc từ IdentityVerifier)
  ───────────────────────────────────────────────────── */
  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const provider   = getReadProvider();
      const ivContract = new ethers.Contract(
        CONTRACT_ADDRESSES.IDENTITY_VERIFIER, IDENTITY_VERIFIER_ABI, provider
      );
      const count = await ivContract.getAuditLogCount();
      const total = Number(count);
      const records = [];
      /* Lấy 20 bản ghi gần nhất */
      for (let i = Math.max(0, total - 20); i < total; i++) {
        const r = await ivContract.getAuditRecord(i);
        records.unshift({
          verifier:  r.verifier,
          holder:    r.holder,
          hash:      r.credentialHash,
          result:    r.result,
          reason:    r.reason,
          timestamp: r.timestamp,
        });
      }
      setAuditLog(records);
      setShowAudit(true);
    } catch (e) { console.error("loadAuditLog:", e); }
    setAuditLoading(false);
  }

  function buildSteps(sig, did, vc, holder) {
    return [
      { label: "① Xác thực chữ ký số (off-chain)", ok: sig },
      { label: "② DID Holder đang hoạt động (on-chain)", ok: did },
      { label: "③ VC hợp lệ, chưa hết hạn / thu hồi (on-chain)", ok: vc },
      { label: "④ VC thuộc đúng Holder", ok: holder },
    ];
  }

  /* ─────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────── */
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-badge badge-verifier">🔎 VERIFIER — Doanh nghiệp</div>
        <h1 className="page-title">Xác thực Bằng cấp</h1>
        <p className="page-subtitle">
          Dán Verifiable Presentation (VP) do ứng viên cung cấp để kiểm tra tính hợp lệ.
          <br />
          {account ? (
            <span style={{ color: "var(--green)", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
              🔐 Đã kết nối ví · {shortAddr(account)} · Kết quả được ghi audit log on-chain
            </span>
          ) : (
            <span style={{ color: "var(--green)", fontSize: 13 }}>
              ✅ Chế độ khách · Không cần ví MetaMask · Đọc dữ liệu blockchain trực tiếp
            </span>
          )}
        </p>
      </div>

      <div className="card-grid">
        {/* ── Cột trái: Input VP ────────────────────────── */}
        <div className="card">
          <div className="card-title">📄 Nhập Verifiable Presentation</div>

          <div className="form-group">
            <label className="form-label">Dán VP JSON hoặc Compact VP (từ mã QR)</label>
            <textarea
              id="vp-input"
              className="form-textarea"
              placeholder={'{\n  "@context": [...],\n  "type": "VerifiablePresentation",\n  "verifiableCredential": [...],\n  "proof": { ... }\n}'}
              value={vpInput}
              onChange={(e) => setVpInput(e.target.value)}
              style={{ minHeight: 260, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            />
          </div>

          <button
            id="btn-verify"
            className="btn btn-success btn-full"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner" /> Đang đối chiếu trên Blockchain...</>
              : "🔍 Xác thực Danh tính"}
          </button>

          {/* Quy trình xác thực */}
          <div style={{ marginTop: 20, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <p className="form-label" style={{ marginBottom: 10 }}>Quy trình xác thực (4 bước)</p>
            {[
              "① Xác thực chữ ký số — off-chain, tức thì",
              "② Kiểm tra DID Holder — on-chain (DIDRegistry)",
              "③ Kiểm tra VC hợp lệ — on-chain (CredentialRegistry)",
              "④ Đối chiếu VC ↔ Holder",
            ].map(s => (
              <div key={s} style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{s}</div>
            ))}
            {account && (
              <div style={{ fontSize: 11, color: "var(--green)", marginTop: 8 }}>
                + Kết quả được ghi vào Audit Log on-chain (IdentityVerifier)
              </div>
            )}
          </div>
        </div>

        {/* ── Cột phải: Kết quả ─────────────────────────── */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title">🧾 Kết quả Kiểm định</div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {!verifyStatus && !loading && (
              <div className="empty-state">
                <div className="empty-state-icon">🔎</div>
                Nhập VP và nhấn Xác thực để xem kết quả.
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                <span className="spinner" style={{ width: 30, height: 30, borderWidth: 3, marginBottom: 16 }} />
                <p>Đang đối chiếu Hash với Smart Contract...</p>
              </div>
            )}

            {verifyStatus && !loading && (
              <div>
                {/* Kết quả tổng hợp */}
                <div className={`verify-result ${verifyStatus.valid ? "valid" : "invalid"}`}>
                  <div className="verify-icon">{verifyStatus.valid ? "✅" : "❌"}</div>
                  <h3 className="verify-title" style={{ color: verifyStatus.valid ? "var(--green)" : "var(--red)" }}>
                    {verifyStatus.valid ? "HỢP LỆ" : "KHÔNG HỢP LỆ"}
                  </h3>
                  <p className="verify-reason">{verifyStatus.reason}</p>
                  {verifyStatus.withWallet && verifyStatus.valid && (
                    <p style={{ fontSize: 11, color: "var(--green)", marginTop: 6, opacity: 0.8 }}>
                      ✍ Kết quả đã được ghi vào Audit Log on-chain
                    </p>
                  )}
                </div>

                {/* Step breakdown */}
                {verifyStatus.steps && (
                  <div className="verify-steps">
                    {verifyStatus.steps.map(step => (
                      <div key={step.label} className={`verify-step ${step.ok ? "step-ok" : "step-fail"}`}>
                        <span className="step-icon">{step.ok ? "✔" : "✗"}</span>
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* SSO Simulation Banner */}
                {verifyStatus.valid && verifyStatus.details?.verifiableCredential?.[0] && (
                  <SSOBanner vc={verifyStatus.details.verifiableCredential[0]} />
                )}

                {/* Thông tin chi tiết từ VP JSON */}
                {verifyStatus.valid && verifyStatus.details?.verifiableCredential?.[0] && (
                  <div className="verify-details-box">
                    <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 12 }}>
                      Thông tin Bằng cấp
                    </h4>
                    {(() => {
                      const vc   = verifyStatus.details.verifiableCredential[0];
                      const subj = vc.credentialSubject;
                      return (
                        <>
                          {[
                            ["Loại bằng",  vc.type?.[1] || vc.type?.[0]],
                            ["Họ tên",     subj?.studentName],
                            ["MSSV",       subj?.studentId],
                            ["Ngành học",  subj?.major],
                            ["Năm TN",     subj?.graduationYear],
                            ["DID",        subj?.id],
                          ].filter(([, v]) => v).map(([label, value]) => (
                            <div key={label} className="info-row" style={{ padding: "6px 0", border: "none" }}>
                              <span className="info-label">{label}:</span>
                              <span className={`info-value ${label === "DID" ? "info-mono" : ""}`} style={{ fontSize: label === "DID" ? 11 : 14 }}>
                                {value}
                              </span>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}

                {verifyStatus.valid && !verifyStatus.details?.verifiableCredential && (
                  <div style={{ marginTop: 16, textAlign: "center", padding: 16, background: "rgba(104,211,145,0.06)", borderRadius: 10, border: "1px solid rgba(104,211,145,0.2)" }}>
                    <p style={{ fontSize: 13, color: "var(--green)" }}>✅ Xác thực thành công qua Compact VP (QR Code)</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════ AUDIT LOG ════════════════════════════ */}
      <div className="section card" style={{ marginTop: 20 }}>
        <div className="card-title" style={{ userSelect: "none" }}>
          📋 Nhật ký Kiểm định On-chain (Audit Log)
          <button
            className="btn btn-outline btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={showAudit ? () => setShowAudit(false) : loadAuditLog}
            disabled={auditLoading}
          >
            {auditLoading ? <><span className="spinner" /> Đang tải...</> : showAudit ? "▲ Thu gọn" : "▼ Xem Audit Log"}
          </button>
        </div>

        {showAudit && (
          auditLog.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px 0" }}>
              <div className="empty-state-icon">📭</div>
              Chưa có lần xác thực nào được ghi lại.
            </div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Verifier</th>
                    <th>Holder</th>
                    <th>Kết quả</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(r.timestamp)}</td>
                      <td><code className="info-mono" style={{ fontSize: 11 }}>{shortAddr(r.verifier)}</code></td>
                      <td><code className="info-mono" style={{ fontSize: 11 }}>{shortAddr(r.holder)}</code></td>
                      <td>
                        <span className={`status-badge ${r.result ? "status-active" : "status-inactive"}`}>
                          {r.result ? "✅ Hợp lệ" : "❌ Từ chối"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SSO Simulation Banner
══════════════════════════════════════════════════════════ */
function SSOBanner({ vc }) {
  const subj = vc?.credentialSubject;
  if (!subj?.studentName) return null;
  return (
    <div className="sso-banner">
      <div className="sso-banner-icon">🎓</div>
      <div className="sso-banner-body">
        <div className="sso-banner-title">Đăng nhập thành công!</div>
        <div className="sso-banner-name">{subj.studentName}</div>
        <div className="sso-banner-meta">
          {subj.studentId && <span>MSSV: {subj.studentId}</span>}
          {subj.major && <span> · {subj.major}</span>}
          {subj.graduationYear && <span> · Khóa {subj.graduationYear}</span>}
        </div>
        <div className="sso-banner-footer">
          Danh tính xác thực qua Blockchain DID System · {new Date().toLocaleString("vi-VN")}
        </div>
      </div>
      <div className="sso-banner-badge">✓</div>
    </div>
  );
}
