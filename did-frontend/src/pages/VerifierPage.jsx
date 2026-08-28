import { verifySelectiveDisclosure } from "../utils/selectiveDisclosure";
import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import jsQR from "jsqr";
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

  /* ── Verify state ────────────────────────────────────────────────────────── */
  const [vpInput, setVpInput]           = useState("");
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [loading, setLoading]           = useState(false);

  /* ── Camera & File Scanner state ─────────────────────────────────────────── */
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError]       = useState(null);
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const fileInputRef  = useRef(null);
  const streamRef     = useRef(null);
  const animFrameId   = useRef(null);

  /* ── Audit log state ─────────────────────────────────────────────────────── */
  const [auditLog, setAuditLog]         = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit]       = useState(false);

  // Dọn dẹp camera khi component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  /* ── Camera Scanning Handlers ────────────────────────────────────────────── */
  async function startCamera() {
    setIsCameraActive(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        requestAnimationFrame(scanVideoFrame);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Không thể bật Camera: " + (err.message || "Bị từ chối quyền truy cập"));
      setIsCameraActive(false);
    }
  }

  function stopCamera() {
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  function scanVideoFrame() {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameId.current = requestAnimationFrame(scanVideoFrame);
      return;
    }
    const canvas = canvasRef.current || document.createElement("canvas");
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      stopCamera();
      setVpInput(code.data);
      handleVerify(code.data);
    } else {
      animFrameId.current = requestAnimationFrame(scanVideoFrame);
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          setVpInput(code.data);
          handleVerify(code.data);
        } else {
          alert("❌ Không tìm thấy mã QR trong hình ảnh. Vui lòng chọn ảnh chụp mã QR rõ nét hơn!");
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  /* ── Xác thực VP ─────────────────────────────────────────────────────────── */
  async function handleVerify(directInput = null) {
    const rawInput = typeof directInput === "string" ? directInput : vpInput;
    if (!rawInput.trim()) {
      alert("Vui lòng nhập JSON hoặc quét mã QR của VP!");
      return;
    }
    setLoading(true);
    setVerifyStatus(null);

    try {
      let parsed;
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        throw new Error("Định dạng JSON không hợp lệ.");
      }

      let vcHash = "", holderAddr = "", signature = "", payloadToVerify = "";
      let isSelective = false;
      let expiresAt = null;
      let audience = "PUBLIC_VERIFIER";
      let nonce = "";

      // 1. Nhận diện dạng Selective Disclosure VP
      if (parsed.type?.includes("SelectiveDisclosurePresentation") || parsed.presentationPayload) {
        isSelective = true;
        signature = parsed.proof?.proofValue;
        payloadToVerify = parsed.proof?.payload;
        const pObj = parsed.presentationPayload || JSON.parse(payloadToVerify);
        vcHash = pObj.vcHash;
        holderAddr = pObj.holder;
        expiresAt = pObj.expiresAt;
        audience = pObj.audience || "PUBLIC_VERIFIER";
        nonce = pObj.nonce;

      } else if (parsed.selective && parsed.sig) {
        // Compact Selective VP từ QR Code
        isSelective = true;
        signature = parsed.sig;
        vcHash = parsed.vcHash;
        holderAddr = parsed.holder;
        expiresAt = parsed.exp;
        audience = parsed.aud || "PUBLIC_VERIFIER";
        nonce = parsed.nonce;
        const pObj = {
          vcHash: parsed.vcHash,
          holder: parsed.holder,
          timestamp: parsed.ts,
          expiresAt: parsed.exp,
          nonce: parsed.nonce,
          audience: parsed.aud,
          disclosedKeys: Object.keys(parsed.disclosed || {}).sort(),
        };
        payloadToVerify = JSON.stringify(pObj);

      } else if (parsed.proof?.payload) {
        // Full VP Legacy
        signature = parsed.proof.proofValue;
        payloadToVerify = parsed.proof.payload;
        const obj = JSON.parse(payloadToVerify);
        vcHash = obj.vcHash;
        holderAddr = obj.holder;
        expiresAt = obj.expiresAt || null;

      } else if (parsed.sig && parsed.vcHash) {
        // Compact VP Legacy từ QR code
        signature = parsed.sig;
        vcHash = parsed.vcHash;
        holderAddr = parsed.holder;
        expiresAt = parsed.exp || null;
        payloadToVerify = JSON.stringify({ vcHash: parsed.vcHash, holder: parsed.holder, timestamp: parsed.ts });

      } else {
        throw new Error("Cấu trúc VP không chứa thông tin chữ ký hợp lệ.");
      }

      if (!vcHash || !holderAddr) throw new Error("Thiếu vcHash hoặc địa chỉ holder.");

      // 2. Kiểm tra Thời hạn sống (Time-Bound Expiration Check)
      if (expiresAt) {
        if (Date.now() > Number(expiresAt)) {
          const expiredDate = new Date(Number(expiresAt)).toLocaleString("vi-VN");
          throw new Error(`⚠️ MÃ XUẤT TRÌNH (VP) ĐÃ HẾT HẠN vào lúc ${expiredDate}!\n(Chống tấn công phát lại: Vui lòng yêu cầu sinh viên tạo mã mới).`);
        }
      }

      // 3. Xác thực chữ ký số (off-chain)
      let recoveredAddr = "";
      try {
        recoveredAddr = ethers.verifyMessage(payloadToVerify, signature);
      } catch (sigErr) {
        throw new Error("❌ Chữ ký số không hợp lệ hoặc đã bị chỉnh sửa (Signature corrupted).");
      }

      if (recoveredAddr.toLowerCase() !== holderAddr.toLowerCase()) {
        throw new Error("❌ Chữ ký số không khớp với Holder — VP này đã bị giả mạo hoặc chỉnh sửa.");
      }

      // 4. Xác thực Toán học Selective Disclosure (ZKP-lite)
      if (isSelective) {
        const selectiveData = {
          presentedClaims: parsed.presentedClaims || parsed.disclosed || {},
          blindedHashes: parsed.blindedHashes || parsed.blinded || {},
          allKeys: parsed.allKeys || parsed.keys || [],
          vcHash,
        };
        const selectiveCheck = verifySelectiveDisclosure(selectiveData);
        if (!selectiveCheck.isValid) {
          throw new Error("❌ Phát hiện giả mạo: Mã cam kết băm của thuộc tính không khớp với Root Hash trên Blockchain!");
        }
      } else if (parsed.verifiableCredential && parsed.verifiableCredential[0]) {
        const vcObj = parsed.verifiableCredential[0];
        const computedHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(vcObj)));
        if (computedHash.toLowerCase() !== vcHash.toLowerCase()) {
          throw new Error("❌ Phát hiện giả mạo: Nội dung Bằng cấp (VC) đã bị chỉnh sửa! Mã Hash không khớp với Blockchain.");
        }
      }

      // 5. Xác thực On-Chain trên Blockchain
      let isValid = false, reason = "", steps;

      if (account) {
        const signer = getSigner();
        const ivContract = new ethers.Contract(
          CONTRACT_ADDRESSES.IDENTITY_VERIFIER, IDENTITY_VERIFIER_ABI, signer
        );
        const tx = await ivContract.verifyIdentity(holderAddr, vcHash);
        const receipt = await tx.wait();

        const event = receipt.logs.find(log => log.fragment?.name === "IdentityVerified");
        if (event) {
          isValid = event.args[3];
          reason = event.args[4];
        } else {
          const [v, r] = await ivContract.verifyIdentity.staticCall(holderAddr, vcHash);
          isValid = v; reason = r;
        }
        steps = buildSteps(true, isValid, isValid, isValid);

      } else {
        const provider = getReadProvider();
        const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, provider);
        const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider);

        const didDoc = await didContract.resolveDID(holderAddr);
        if (!didDoc.isActive || didDoc.owner === ethers.ZeroAddress) {
          reason = "DID của Holder không tồn tại hoặc đã bị vô hiệu hóa.";
          steps = buildSteps(true, false, false, false);
          setVerifyStatus({ valid: false, reason, details: parsed, steps });
          setLoading(false);
          return;
        }

        const [vcValid, vcReason] = await credContract.verifyCredential(vcHash);
        if (!vcValid) {
          steps = buildSteps(true, true, false, false);
          setVerifyStatus({ valid: false, reason: vcReason, details: parsed, steps });
          setLoading(false);
          return;
        }

        const cred = await credContract.getCredential(vcHash);
        if (cred.holder.toLowerCase() !== holderAddr.toLowerCase()) {
          reason = "VC này không thuộc về Holder được khai báo trong VP.";
          steps = buildSteps(true, true, true, false);
          setVerifyStatus({ valid: false, reason, details: parsed, steps });
          setLoading(false);
          return;
        }

        isValid = true;
        reason = "Danh tính hợp lệ";
        steps = buildSteps(true, true, true, true);
      }

      setVerifyStatus({
        valid: isValid,
        reason,
        details: parsed,
        isSelective,
        expiresAt,
        audience,
        nonce,
        steps,
        withWallet: !!account,
      });

    } catch (e) {
      let msg = e.reason || e.message || "Lỗi xác thực không xác định.";
      if (msg.includes("CURVE") || msg.includes("signature") || msg.includes("invalid bytes") || msg.includes("must be") || msg.includes("bad signature")) {
        msg = "❌ Chữ ký số không hợp lệ — Chữ ký hoặc dữ liệu đã bị chỉnh sửa/làm giả.";
      } else if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        msg = "⚠️ Người dùng đã từ chối ký giao dịch trên MetaMask.";
      }
      setVerifyStatus({
        valid: false,
        reason: msg,
        details: null,
        steps: buildSteps(false, false, false, false),
        withWallet: !!account,
      });
    }
    setLoading(false);
  }

  /* ── Audit log ───────────────────────────────────────────────────────────── */
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
    } catch (e) {
      console.error("loadAuditLog:", e);
    }
    setAuditLoading(false);
  }

  function buildSteps(sig, did, vc, holder) {
    return [
      { label: "✅ Xác thực chữ ký số (off-chain)", ok: sig },
      { label: "✅ DID Holder đang hoạt động (on-chain)", ok: did },
      { label: "✅ VC hợp lệ, chưa hết hạn / thu hồi (on-chain)", ok: vc },
      { label: "✅ VC thuộc đúng Holder", ok: holder },
    ];
  }

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-badge badge-verifier">🏢 VERIFIER — Cổng Doanh nghiệp & Tuyển dụng</div>
        <h1 className="page-title">Xác thực Bằng cấp & Danh tính</h1>
        <p className="page-subtitle">
          Quét mã QR hoặc dán Verifiable Presentation (VP) của sinh viên để đối chiếu toàn vẹn với Blockchain.
          <br />
          {account ? (
            <span style={{ color: "var(--green)", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
              🔗 Đã kết nối ví: {shortAddr(account)} — Kết quả tự động ghi Audit Log on-chain
            </span>
          ) : (
            <span style={{ color: "var(--cyan)", fontSize: 13 }}>
              🌐 Chế độ Khách (Không cần ví / Không tốn Gas) — Đọc dữ liệu Blockchain trực tiếp
            </span>
          )}
        </p>
      </div>

      <div className="card-grid">
        {/* ── Cột trái: Nhập VP / Quét QR ───────────────────────────────────── */}
        <div className="card">
          <div className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>📥 Nhập Mã Xuất trình (VP)</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Hỗ trợ QR & JSON</span>
          </div>

          {/* Quick Action Buttons: Camera / Upload / Paste */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className={`btn btn-sm ${isCameraActive ? "btn-danger" : "btn-primary"}`}
              style={{ flex: 1, fontSize: 12, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              onClick={isCameraActive ? stopCamera : startCamera}
            >
              <span>{isCameraActive ? "⏹️" : "📷"}</span>
              {isCameraActive ? "Tắt Camera" : "Quét bằng Camera"}
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={{ flex: 1, fontSize: 12, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span>🖼️</span> Tải ảnh QR
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
          </div>

          {/* Camera Scanner Viewfinder */}
          {isCameraActive && (
            <div style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              border: "2px solid var(--cyan)",
              boxShadow: "0 0 20px rgba(0, 229, 255, 0.2)",
              background: "#000",
              marginBottom: 14,
              textAlign: "center",
            }}>
              <video
                ref={videoRef}
                style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }}
              />
              <div style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 160,
                height: 160,
                border: "2px dashed var(--cyan)",
                borderRadius: 12,
                pointerEvents: "none",
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.35)",
              }} />
              <div style={{
                position: "absolute",
                bottom: 8,
                left: 0,
                right: 0,
                fontSize: 11,
                color: "#ffffff",
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              }}>
                🎯 Hướng camera về phía mã QR của sinh viên
              </div>
            </div>
          )}

          {cameraError && (
            <div className="alert alert-error" style={{ fontSize: 12, marginBottom: 12 }}>
              {cameraError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Dán chuỗi VP JSON hoặc mã QR:</label>
            <textarea
              id="vp-input"
              className="form-textarea"
              placeholder={'{\n  "selective": true,\n  "holder": "0x1d71...",\n  "vcHash": "0x85e3...",\n  "sig": "0x...",\n  "exp": 1724833200000\n}'}
              value={vpInput}
              onChange={(e) => setVpInput(e.target.value)}
              style={{ minHeight: 200, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
            />
          </div>

          <button
            id="btn-verify"
            className="btn btn-success btn-full"
            onClick={() => handleVerify()}
            disabled={loading}
            style={{
              padding: "12px",
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <span className="spinner" /> Đang đối chiếu trên Blockchain...
              </>
            ) : (
              <>
                <span>🔍</span> Xác thực Danh tính & Bằng cấp
              </>
            )}
          </button>

          {/* Quy trình xác thực 4 bước */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <p className="form-label" style={{ marginBottom: 8, fontSize: 12 }}>4 Tầng Bảo mật Đối chiếu:</p>
            {[
              "1️⃣ Kiểm tra Thời hạn sống (Time-Bound) & Chống phát lại",
              "2️⃣ Xác thực Chữ ký số ECDSA (off-chain)",
              "3️⃣ Tái lập Root Hash Toán học (ZKP-lite)",
              "4️⃣ Kiểm tra DID & Trạng thái Thu hồi trên Smart Contract",
            ].map((s) => (
              <div key={s} style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{s}</div>
            ))}
          </div>
        </div>

        {/* ── Cột phải: Kết quả Kiểm định ───────────────────────────────────── */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title">📊 Kết quả Kiểm định Khoa học</div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {!verifyStatus && !loading && (
              <div className="empty-state">
                <div className="empty-state-icon">🛡️</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
                  Chưa có dữ liệu xác thực
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Bật camera quét mã QR, tải ảnh lên hoặc dán chuỗi VP để xem kết quả đối chiếu.
                </div>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>
                <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3, marginBottom: 16 }} />
                <p style={{ fontSize: 13 }}>Đang đối chiếu Root Hash và Smart Contract on-chain...</p>
              </div>
            )}

            {verifyStatus && !loading && (
              <div>
                {/* Kết quả tổng hợp */}
                <div className={`verify-result ${verifyStatus.valid ? "valid" : "invalid"}`}>
                  <div className="verify-icon">
                    {verifyStatus.valid ? "✅" : "❌"}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {verifyStatus.valid ? "BẰNG CẤP & DANH TÍNH HỢP LỆ" : "XÁC THỰC THẤT BẠI"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                      {verifyStatus.reason}
                    </div>
                  </div>
                </div>

                {/* Badges tính năng nâng cao */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {verifyStatus.isSelective && (
                    <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", color: "var(--green)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                      🛡️ Selective Disclosure (ZKP-lite)
                    </span>
                  )}
                  {verifyStatus.expiresAt && (
                    <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                      ⏱️ Time-Bound Anti-Replay
                    </span>
                  )}
                  {verifyStatus.audience && (
                    <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
                      🎯 Audience: {verifyStatus.audience}
                    </span>
                  )}
                </div>

                {/* BẢNG THUỘC TÍNH (TIẾT LỘ VS ẨN AN TOÀN) */}
                {verifyStatus.valid && verifyStatus.details && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text-primary)" }}>
                      📋 Dữ liệu thuộc tính nhận được:
                    </div>

                    {/* Dạng Selective Disclosure */}
                    {verifyStatus.isSelective ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {/* 1. Các trường được tiết lộ */}
                        {Object.entries(verifyStatus.details.presentedClaims || verifyStatus.details.disclosed || {}).map(([k, item]) => {
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
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "8px 10px",
                                background: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            >
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{labels[k] || k} (Được tiết lộ)</div>
                              <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{item.value || item}</div>
                            </div>
                          );
                        })}

                        {/* 2. Các trường bị ẩn an toàn */}
                        {Object.keys(verifyStatus.details.blindedHashes || verifyStatus.details.blinded || {}).map((k) => {
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
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "8px 10px",
                                background: "rgba(255, 255, 255, 0.02)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                            >
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{labels[k] || k}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic", marginTop: 2 }}>
                                🔒 Đã ẩn an toàn (Quyền riêng tư)
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Dạng Full Legacy VC */
                      verifyStatus.details.verifiableCredential?.[0] && (
                        <div style={{ padding: 12, background: "rgba(255, 255, 255, 0.02)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}>
                          {Object.entries(verifyStatus.details.verifiableCredential[0].credentialSubject || {}).map(([k, v]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                              <span style={{ color: "var(--text-muted)" }}>{k}:</span>
                              <span style={{ fontWeight: 600 }}>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Các bước kiểm tra */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>
                    Chi tiết các bước kiểm chứng:
                  </div>
                  {verifyStatus.steps?.map((st, i) => (
                    <div key={i} className={`verify-step ${st.ok ? "step-ok" : "step-fail"}`} style={{ fontSize: 12 }}>
                      <span className="step-icon">{st.ok ? "✓" : "✗"}</span>
                      <span>{st.label}</span>
                    </div>
                  ))}
                </div>

                {/* On-chain Audit Log notice */}
                {verifyStatus.withWallet && (
                  <div style={{ marginTop: 12, fontSize: 11, color: "var(--green)", textAlign: "center" }}>
                    📜 Bằng chứng xác minh đã được ghi bất biến vào Smart Contract Audit Log
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nút Xem Audit Log on-chain */}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button
              className="btn btn-outline btn-sm btn-full"
              onClick={loadAuditLog}
              disabled={auditLoading}
              style={{ fontSize: 12 }}
            >
              {auditLoading ? <><span className="spinner" /> Đang tải Audit Log...</> : "📜 Xem Nhật ký Xác thực On-Chain (Audit Log)"}
            </button>

            {showAudit && (
              <div style={{ marginTop: 12, maxHeight: 200, overflowY: "auto" }}>
                {auditLog.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: 10 }}>
                    Chưa có bản ghi xác thực nào on-chain.
                  </div>
                ) : (
                  auditLog.map((r, i) => (
                    <div key={i} className="info-row" style={{ padding: "6px 0", fontSize: 11, flexWrap: "wrap" }}>
                      <span style={{ color: r.result ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                        {r.result ? "✓ HỢP LỆ" : "✗ THẤT BẠI"}
                      </span>
                      <span className="info-mono" style={{ color: "var(--text-muted)" }}>
                        Verifier: {shortAddr(r.verifier)}
                      </span>
                      <span className="info-mono" style={{ color: "var(--cyan)" }}>
                        Holder: {shortAddr(r.holder)}
                      </span>
                      <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
                        {formatTimestamp(r.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}