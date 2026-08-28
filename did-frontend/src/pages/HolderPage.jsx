import { createSelectivePresentation } from "../utils/selectiveDisclosure";
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
  const [disclosedKeys, setDisclosedKeys] = useState([
    "studentName", "major", "classification", "graduationYear"
  ]);
  const [ttlMinutes, setTtlMinutes] = useState("15");
  const [audienceTarget, setAudienceTarget] = useState("");

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
    if (vc.vcData?.credentialSubject?.saltedClaims) {
      const allK = Object.keys(vc.vcData.credentialSubject.saltedClaims);
      // Mặc định chọn các trường thông dụng
      setDisclosedKeys(["studentName", "major", "classification", "graduationYear"].filter(k => allK.includes(k)));
    }
  }

  function handleToggleKey(k) {
    setDisclosedKeys(prev => 
      prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    );
  }

  function handleApplyPreset(presetType) {
    if (!selectedVc?.vcData?.credentialSubject?.saltedClaims) return;
    const allK = Object.keys(selectedVc.vcData.credentialSubject.saltedClaims);
    if (presetType === "all") {
      setDisclosedKeys(allK);
    } else if (presetType === "job") {
      setDisclosedKeys(["studentName", "major", "classification", "graduationYear"].filter(k => allK.includes(k)));
    } else if (presetType === "minimal") {
      setDisclosedKeys(["studentName", "major", "classification"].filter(k => allK.includes(k)));
    }
  }

  async function handleGenerateVP() {
    if (!selectedVc) return;
    setVpLoading(true);
    setVpJson("");
    setQrDataUrl("");

    try {
      if (selectedVc.isRevoked) throw new Error("VC đã bị thu hồi trên Blockchain, không thể tạo VP.");
      if (selectedVc.health === "expired") throw new Error("VC đã hết hạn, không thể tạo VP.");

      const signer = getSigner();
      if (!signer) throw new Error("Chưa kết nối ví MetaMask. Vui lòng kết nối ví trước!");

      let vp = null;
      let qrPayload = null;
      const now = Date.now();
      const ttl = Number(ttlMinutes) || 15;
      const expirationTimestamp = now + ttl * 60 * 1000;
      const audience = audienceTarget.trim() || "PUBLIC_VERIFIER";

      // 1. Nếu VC là chuẩn Salted Claims (Selective Disclosure)
      if (selectedVc.vcData?.credentialSubject?.saltedClaims) {
        const {
          presentationPayload,
          presentedClaims,
          blindedHashes,
          allKeys,
          nonce,
        } = createSelectivePresentation(selectedVc.vcData, disclosedKeys, {
          expiresInMinutes: ttl,
          audience: audience,
        });

        const messageToSign = JSON.stringify(presentationPayload);
        const signature = await signer.signMessage(messageToSign);

        vp = {
          "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1"
          ],
          type: ["VerifiablePresentation", "SelectiveDisclosurePresentation"],
          presentationPayload,
          presentedClaims,
          blindedHashes,
          allKeys,
          proof: {
            type: "EthereumPersonalSignature2021",
            created: new Date().toISOString(),
            verificationMethod: `did:ethr:${account}#controller`,
            proofPurpose: "authentication",
            proofValue: signature,
            payload: messageToSign,
          },
        };

        qrPayload = {
          selective: true,
          holder: account,
          vcHash: selectedVc.hash,
          sig: signature,
          ts: presentationPayload.timestamp,
          exp: expirationTimestamp,
          nonce,
          aud: audience,
          disclosed: presentedClaims,
          blinded: blindedHashes,
          keys: allKeys,
        };

      } else {
        // 2. Chuẩn Legacy thông thường (kể cả khi không có saltedClaims)
        const nonce = ethers.hexlify(ethers.randomBytes(16));
        const payload = {
          vcHash: selectedVc.hash,
          holder: account,
          timestamp: now,
          expiresAt: expirationTimestamp,
          nonce,
          audience,
        };
        const messageToSign = JSON.stringify(payload);
        const signature = await signer.signMessage(messageToSign);

        vp = {
          "@context": ["https://www.w3.org/2018/credentials/v1"],
          type: ["VerifiablePresentation"],
          verifiableCredential: selectedVc.vcData ? [selectedVc.vcData] : [],
          payload,
          proof: {
            type: "EthereumPersonalSignature2021",
            created: new Date().toISOString(),
            verificationMethod: `did:ethr:${account}#controller`,
            proofPurpose: "authentication",
            proofValue: signature,
            payload: messageToSign,
          },
        };

        qrPayload = {
          holder: account,
          vcHash: selectedVc.hash,
          sig: signature,
          ts: payload.timestamp,
          exp: payload.expiresAt,
          nonce,
          aud: audience,
        };
      }

      const vpString = JSON.stringify(vp, null, 2);
      setVpJson(vpString);

      // Render QR Code
      const qrUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
        width: 280,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setQrDataUrl(qrUrl);

      // Lưu lịch sử chia sẻ
      saveToHistory(selectedVc.hash, selectedVc.type);

    } catch (e) {
      console.error("handleGenerateVP error:", e);
      alert("Lỗi khi tạo VP: " + (e.reason || e.message));
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

        {/* Tạo VP + QR với Tiết lộ có chọn lọc */}
        <div className="card">
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>🔐 Tạo VP & Chia sẻ Quyền riêng tư</span>
            {selectedVc && (
              <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "rgba(0, 229, 255, 0.1)", color: "var(--cyan)", border: "1px solid rgba(0, 229, 255, 0.2)" }}>
                {selectedVc.type}
              </span>
            )}
          </div>

          {!selectedVc ? (
            <div className="empty-state" style={{ padding: "50px 20px" }}>
              <div className="empty-state-icon" style={{ fontSize: 36, marginBottom: 10 }}>👈</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
                Chưa chọn bằng cấp nào
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Vui lòng bấm vào một bằng cấp trong danh sách bên trái để cấu hình quyền riêng tư và tạo mã QR.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              
              {/* Header thông tin bằng đã chọn */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Bằng cấp đang chọn:</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{selectedVc.type}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Mã băm on-chain (vcHash):</div>
                  <div className="info-mono" style={{ fontSize: 11, color: "var(--cyan)" }}>{shortAddr(selectedVc.hash)}</div>
                </div>
              </div>

              {/* 1. BẢNG TIẾT LỘ CÓ CHỌN LỌC (SELECTIVE DISCLOSURE) */}
              {selectedVc.vcData?.credentialSubject?.saltedClaims ? (
                <div style={{
                  background: "rgba(16, 185, 129, 0.04)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>🛡️</span> TIẾT LỘ CÓ CHỌN LỌC (SELECTIVE DISCLOSURE)
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Đã chọn mở: <strong style={{ color: "var(--green)" }}>{disclosedKeys.length}</strong> / {Object.keys(selectedVc.vcData.credentialSubject.saltedClaims).length} trường
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.4 }}>
                    Tích chọn các trường muốn <strong>công khai</strong> cho nhà tuyển dụng. Các trường không tích sẽ được <strong>ẩn hoàn toàn (Blind Hash)</strong>:
                  </div>

                  {/* Nút Preset cấu hình nhanh */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6 }}
                      onClick={() => handleApplyPreset("all")}
                    >
                      🎯 Mở tất cả
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, borderColor: "rgba(16, 185, 129, 0.4)", color: "var(--green)" }}
                      onClick={() => handleApplyPreset("job")}
                    >
                      💼 Ứng tuyển việc làm (Ẩn GPA & CCCD)
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6 }}
                      onClick={() => handleApplyPreset("minimal")}
                    >
                      🛡️ Tối giản (Chỉ Tên & Ngành)
                    </button>
                  </div>

                  {/* Danh sách Checkbox các thuộc tính */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Object.keys(selectedVc.vcData.credentialSubject.saltedClaims).map((k) => {
                      const val = selectedVc.vcData.credentialSubject.saltedClaims[k].value;
                      const labels = {
                        studentName: "Họ và tên",
                        studentId: "Mã sinh viên",
                        major: "Chuyên ngành",
                        gpa: "Điểm GPA",
                        classification: "Xếp loại",
                        graduationYear: "Năm TN",
                        dateOfBirth: "Ngày sinh",
                        nationalId: "Số CCCD",
                      };
                      const isChecked = disclosedKeys.includes(k);
                      return (
                        <div
                          key={k}
                          onClick={() => handleToggleKey(k)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            background: isChecked ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 255, 255, 0.02)",
                            border: isChecked ? "1px solid var(--green)" : "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 6,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ cursor: "pointer" }}
                          />
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{labels[k] || k}: </span>
                            <span style={{ fontWeight: 600, color: isChecked ? "var(--text-primary)" : "var(--text-muted)" }}>
                              {isChecked ? val : "🔒 [Ẩn an toàn]"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="alert alert-info" style={{ fontSize: 12, margin: 0 }}>
                  ℹ️ Bằng cấp này được lưu theo chuẩn cơ bản. Hệ thống sẽ ký số chứng minh quyền sở hữu toàn phần.
                </div>
              )}

              {/* 2. BẢO MẬT CHỐNG PHÁT LẠI (TIME-BOUND & AUDIENCE) */}
              <div style={{
                background: "rgba(59, 130, 246, 0.04)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                borderRadius: 10,
                padding: "14px 16px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⏱️</span> BẢO MẬT CHỐNG PHÁT LẠI (ANTI-REPLAY)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Thời hạn sống mã QR:</label>
                    <select
                      className="form-select"
                      style={{ padding: "7px 10px", fontSize: 12, borderRadius: 6 }}
                      value={ttlMinutes}
                      onChange={(e) => setTtlMinutes(e.target.value)}
                    >
                      <option value="5">⚡ 5 Phút (Siêu an toàn / Quét tại chỗ)</option>
                      <option value="15">⏱️ 15 Phút (Khuyên dùng)</option>
                      <option value="60">⏳ 1 Giờ</option>
                      <option value="1440">📅 24 Giờ</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Khóa đơn vị nhận (Audience):</label>
                    <input
                      className="form-input"
                      style={{ padding: "7px 10px", fontSize: 12, borderRadius: 6 }}
                      placeholder="VD: FPT Software, Viettel..."
                      value={audienceTarget}
                      onChange={(e) => setAudienceTarget(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 3. NÚT KÝ SỐ METAMASK */}
              <button
                id="btn-generate-vp"
                className="btn btn-primary"
                onClick={handleGenerateVP}
                disabled={vpLoading}
                style={{
                  padding: "12px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 4px 16px rgba(0, 229, 255, 0.25)",
                }}
              >
                {vpLoading ? (
                  <>
                    <span className="spinner" /> Đang yêu cầu ký số ví MetaMask...
                  </>
                ) : (
                  <>
                    <span>🚀</span> Ký số & Xuất trình Mã QR (VP)
                  </>
                )}
              </button>

              {/* 4. KẾT QUẢ MÃ QR & VP JSON */}
              {vpJson && !vpLoading && (
                <div style={{
                  background: "rgba(0, 229, 255, 0.03)",
                  border: "1px solid rgba(0, 229, 255, 0.25)",
                  borderRadius: 12,
                  padding: 16,
                  textAlign: "center",
                  marginTop: 6,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>
                    ✅ MÃ QR XÁC THỰC ĐÃ SẴN SÀNG
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                    Thời hạn: {ttlMinutes} phút | Đơn vị: {audienceTarget.trim() || "Công khai"}
                  </div>

                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Mã QR Xác thực"
                      style={{
                        width: 220,
                        height: 220,
                        borderRadius: 12,
                        display: "block",
                        margin: "0 auto 14px auto",
                        border: "3px solid #ffffff",
                        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
                      }}
                    />
                  ) : (
                    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="spinner" />
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                    Đưa mã QR này cho nhà tuyển dụng (Verifier) để quét xác thực mà không làm lộ thông tin cá nhân.
                  </p>

                  <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ flex: 1, fontSize: 12, padding: "8px" }}
                      onClick={() => {
                        navigator.clipboard.writeText(vpJson);
                        alert("Đã sao chép chuỗi JSON Verifiable Presentation!");
                      }}
                    >
                      📋 Copy VP JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ flex: 1, fontSize: 12, padding: "8px" }}
                      onClick={() => {
                        const blob = new Blob([vpJson], { type: "application/json" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `vp-${selectedVc.type}-${Date.now()}.json`;
                        a.click();
                      }}
                    >
                      💾 Tải File VP
                    </button>
                  </div>

                  <details style={{ textAlign: "left", marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--cyan)", fontWeight: 600 }}>
                      🔍 Xem chi tiết chuỗi Verifiable Presentation (JSON-LD)
                    </summary>
                    <div className="vp-display" style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", fontSize: 11 }}>
                      {vpJson}
                    </div>
                  </details>
                </div>
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
