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
} from "../utils/contracts";

export default function HolderPage() {
  const account = getAccount();

  // ── State ────────────────────────────────────────────────
  const [vcs, setVcs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVc, setSelectedVc] = useState(null);
  
  const [vpJson, setVpJson] = useState("");
  const [vpLoading, setVpLoading] = useState(false);
  
  const canvasRef = useRef(null);

  // ── Load VCs ─────────────────────────────────────────────
  useEffect(() => {
    if (account) loadVCs();
  }, [account]);

  async function loadVCs() {
    setLoading(true);
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        provider
      );

      // Lấy danh sách hash VC on-chain của Holder
      const hashesOnChain = await contract.getHolderCredentials(account);
      
      // Lấy danh sách VC chi tiết từ localStorage
      const normalizedAccount = account.toLowerCase();
      const localVCs = JSON.parse(localStorage.getItem(`vcs_${normalizedAccount}`) || "[]");

      const combined = [];
      for (let i = 0; i < hashesOnChain.length; i++) {
        const hash = hashesOnChain[i];
        const details = await contract.getCredential(hash);
        
        // Tìm thông tin off-chain tương ứng
        const local = localVCs.find((vc) => vc.vcHash === hash);
        let vcData = null;
        if (local) {
          vcData = JSON.parse(local.vcJson);
        }

        combined.push({
          hash,
          issuer: details.issuer,
          type: details.credentialType,
          issuedAt: details.issuedAt,
          expiresAt: details.expiresAt,
          isRevoked: details.isRevoked,
          vcData, // Thông tin chi tiết (nếu có trong localStorage)
        });
      }

      setVcs(combined.reverse()); // Mới nhất lên đầu
    } catch (e) {
      console.error("Lỗi khi tải VC:", e);
    }
    setLoading(false);
  }

  // ── Generate VP ──────────────────────────────────────────
  async function handleGenerateVP(vc) {
    setSelectedVc(vc);
    setVpLoading(true);
    setVpJson("");
    
    // Clear QR code cũ
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    try {
      if (!vc.vcData) throw new Error("Không có dữ liệu chi tiết của VC này (Off-chain data missing).");
      if (vc.isRevoked) throw new Error("VC này đã bị thu hồi, không thể tạo VP.");

      const signer = getSigner();
      
      // Tạo Payload cho VP
      const payload = {
        vcHash: vc.hash,
        holder: account,
        timestamp: Date.now(),
        // Thực tế VP có thể chứa toàn bộ vcData, ở đây ta gom lại
        vcDetails: vc.vcData
      };

      const messageToSign = JSON.stringify(payload);
      const signature = await signer.signMessage(messageToSign);

      const vp = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiablePresentation"],
        verifiableCredential: [vc.vcData],
        proof: {
          type: "EthereumPersonalSignature2021",
          created: new Date().toISOString(),
          verificationMethod: `did:ethr:${account}#controller`,
          proofPurpose: "authentication",
          proofValue: signature,
          payload: messageToSign // Để Verifier có thể parse dễ dàng trong demo
        }
      };

      const vpString = JSON.stringify(vp, null, 2);
      setVpJson(vpString);

      // Tạo QR Code
      if (canvasRef.current) {
        // Thu gọn JSON để vừa QR (QR có giới hạn dung lượng)
        const compactVp = JSON.stringify({
          holder: account,
          vcHash: vc.hash,
          sig: signature,
          ts: payload.timestamp
        });
        
        await QRCode.toCanvas(canvasRef.current, compactVp, {
          width: 250,
          margin: 2,
          color: { dark: "#1A202C", light: "#FFFFFF" }
        });
      }

    } catch (e) {
      alert("Lỗi tạo VP: " + (e.reason || e.message));
    }
    setVpLoading(false);
  }

  if (!account) {
    return (
      <div className="connect-prompt">
        <div className="connect-prompt-icon">🎓</div>
        <h2>Kết nối ví MetaMask</h2>
        <p>Vui lòng kết nối ví MetaMask để sử dụng giao diện Holder (Sinh viên). Chọn tài khoản Holder (Account #2).</p>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div className="page-header">
        <div className="page-badge badge-holder">🎓 HOLDER</div>
        <h1 className="page-title">Quản lý Định danh</h1>
        <p className="page-subtitle">
          Xem danh sách bằng cấp/chứng chỉ (VC) và tạo Verifiable Presentation (VP) để chia sẻ.
          <br />
          <span style={{ color: "var(--purple)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Ví hiện tại: {shortAddr(account)}
          </span>
        </p>
      </div>

      <div className="card-grid">
        {/* Cột trái: Danh sách VC */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title">
            📚 Bằng cấp / Chứng chỉ của bạn
            <button className="btn btn-outline btn-sm" onClick={loadVCs} style={{ marginLeft: "auto", padding: "4px 8px" }}>
              🔄 Tải lại
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /> Đang tải...</div>
          ) : vcs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              Bạn chưa có chứng chỉ nào.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: "500px", paddingRight: 4 }}>
              {vcs.map((vc) => (
                <div 
                  key={vc.hash} 
                  className={`vc-card ${selectedVc?.hash === vc.hash ? "selected" : ""}`}
                  onClick={() => handleGenerateVP(vc)}
                >
                  <div className="vc-card-header">
                    <span className="vc-type">{vc.type}</span>
                    {vc.isRevoked ? (
                      <span className="status-badge status-inactive">Đã thu hồi</span>
                    ) : (
                      <span className="status-badge status-active">Hợp lệ</span>
                    )}
                  </div>
                  <div className="info-row" style={{ padding: "4px 0", border: "none" }}>
                    <span className="info-label" style={{ fontSize: 12 }}>Issuer:</span>
                    <span className="info-value info-mono">{shortAddr(vc.issuer)}</span>
                  </div>
                  <div className="info-row" style={{ padding: "4px 0", border: "none" }}>
                    <span className="info-label" style={{ fontSize: 12 }}>Cấp lúc:</span>
                    <span className="info-value" style={{ fontSize: 12 }}>{formatTimestamp(vc.issuedAt)}</span>
                  </div>
                  <div className="vc-hash" title={vc.hash}>{shortAddr(vc.hash)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cột phải: Chi tiết & Tạo VP */}
        <div className="card">
          <div className="card-title">🔗 Chia sẻ thông tin (Tạo VP)</div>
          
          {!selectedVc ? (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <div className="empty-state-icon">👆</div>
              Chọn một chứng chỉ bên trái để tạo Verifiable Presentation.
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
                Bạn đang tạo VP cho chứng chỉ <strong>{selectedVc.type}</strong>. 
                Hệ thống sẽ yêu cầu bạn ký xác nhận bằng MetaMask để chứng minh quyền sở hữu.
              </p>

              {vpLoading && <div style={{ textAlign: "center", padding: 20 }}><span className="spinner" /> Đang tạo chữ ký...</div>}
              
              <div className="qr-container" style={{ display: vpJson && !vpLoading ? "flex" : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Mã QR Xác thực</span>
                <canvas ref={canvasRef}></canvas>
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                  Đưa mã QR này cho nhà tuyển dụng (Verifier) hoặc gửi mã JSON bên dưới.
                </p>
              </div>

              {vpJson && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--cyan)" }}>Verifiable Presentation (JSON):</div>
                  <div className="vp-display">{vpJson}</div>
                  <button 
                    className="btn btn-outline btn-full" 
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      navigator.clipboard.writeText(vpJson);
                      alert("Đã copy JSON!");
                    }}
                  >
                    📋 Copy JSON
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
