import { useState } from "react";
import { ethers } from "ethers";
import {
  getSigner,
  getAccount,
  shortAddr,
  formatTimestamp,
} from "../utils/web3";
import {
  CONTRACT_ADDRESSES,
  DID_REGISTRY_ABI,
  CREDENTIAL_REGISTRY_ABI,
} from "../utils/contracts";

export default function IssuerPage() {
  const account = getAccount();

  // ── State: Register DID ──────────────────────────────────
  const [studentAddr, setStudentAddr] = useState("");
  const [publicKey, setPublicKey]     = useState("");
  const [serviceUrl, setServiceUrl]   = useState("");
  const [didStatus, setDidStatus]     = useState(null); // {type, msg}
  const [didLoading, setDidLoading]   = useState(false);

  // ── State: Issue Credential ──────────────────────────────
  const [holderAddr, setHolderAddr]   = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId]     = useState("");
  const [major, setMajor]             = useState("");
  const [credType, setCredType]       = useState("BachelorDegree");
  const [gradYear, setGradYear]       = useState(new Date().getFullYear().toString());
  const [expiresAt, setExpiresAt]     = useState("0");
  const [credStatus, setCredStatus]   = useState(null);
  const [credLoading, setCredLoading] = useState(false);
  const [lastIssuedHash, setLastIssuedHash] = useState("");

  // ── State: Resolve DID ───────────────────────────────────
  const [resolveAddr, setResolveAddr] = useState("");
  const [resolvedDoc, setResolvedDoc] = useState(null);
  const [resolveStatus, setResolveStatus] = useState(null);
  const [resolveLoading, setResolveLoading] = useState(false);

  if (!account) {
    return (
      <div className="connect-prompt">
        <div className="connect-prompt-icon">🔐</div>
        <h2>Kết nối ví MetaMask</h2>
        <p>Vui lòng kết nối ví MetaMask để sử dụng giao diện Issuer. Chọn tài khoản Issuer (Account #1) trong MetaMask.</p>
      </div>
    );
  }

  // ── Handlers ─────────────────────────────────────────────

  async function handleRegisterDID() {
    if (!studentAddr || !ethers.isAddress(studentAddr))
      return setDidStatus({ type: "error", msg: "Địa chỉ ví sinh viên không hợp lệ." });
    setDidLoading(true);
    setDidStatus(null);
    try {
      const signer   = getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);
      // Issuer đăng ký DID giúp sinh viên: sinh viên phải tự gọi hàm này
      // Ở đây demo: gọi registerDID từ tài khoản sinh viên thông qua provider
      // Thực tế sinh viên tự đăng ký; issuer kiểm tra DID có tồn tại không
      const pk  = publicKey  || `pubkey-${studentAddr.slice(2,10)}`;
      const svc = serviceUrl || `https://did.service/${studentAddr.slice(2,10)}`;
      const tx  = await contract.registerDID(pk, svc);
      await tx.wait();
      setDidStatus({ type: "success", msg: `✅ DID đã được đăng ký!\nTx: ${tx.hash}` });
    } catch (e) {
      setDidStatus({ type: "error", msg: e.reason || e.message });
    }
    setDidLoading(false);
  }

  async function handleIssueCredential() {
    if (!holderAddr || !ethers.isAddress(holderAddr))
      return setCredStatus({ type: "error", msg: "Địa chỉ ví sinh viên không hợp lệ." });
    if (!studentName || !studentId || !major)
      return setCredStatus({ type: "error", msg: "Vui lòng điền đầy đủ thông tin sinh viên." });
    setCredLoading(true);
    setCredStatus(null);
    try {
      const signer   = getSigner();

      // 1. Tạo VC JSON theo chuẩn W3C
      const vcJson = JSON.stringify({
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        type: ["VerifiableCredential", credType],
        issuer: `did:ethr:${account}`,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: `did:ethr:${holderAddr}`,
          studentName,
          studentId,
          major,
          graduationYear: gradYear,
          degree: { type: credType },
        },
      });

      // 2. Hash VC
      const vcHash = ethers.keccak256(ethers.toUtf8Bytes(vcJson));

      // 3. Tính expiresAt (0 = không hết hạn)
      const expiry = expiresAt === "0" ? 0n
        : BigInt(Math.floor(new Date(expiresAt).getTime() / 1000));

      // 4. Gọi smart contract
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, signer
      );
      const tx = await contract.issueCredential(holderAddr, vcHash, credType, expiry);
      await tx.wait();

      setLastIssuedHash(vcHash);
      setCredStatus({
        type: "success",
        msg: `✅ VC đã được phát hành!\nHash: ${vcHash.slice(0, 20)}...\nTx: ${tx.hash}`,
      });

      // Lưu VC vào localStorage để Holder có thể xem
      const normalizedHolder = holderAddr.toLowerCase();
      const existing = JSON.parse(localStorage.getItem(`vcs_${normalizedHolder}`) || "[]");
      existing.push({ vcJson, vcHash, issuedAt: Date.now() });
      localStorage.setItem(`vcs_${normalizedHolder}`, JSON.stringify(existing));
    } catch (e) {
      setCredStatus({ type: "error", msg: e.reason || e.message });
    }
    setCredLoading(false);
  }

  async function handleResolveDID() {
    if (!resolveAddr || !ethers.isAddress(resolveAddr))
      return setResolveStatus({ type: "error", msg: "Địa chỉ ví không hợp lệ." });
    setResolveLoading(true);
    setResolveStatus(null);
    setResolvedDoc(null);
    try {
      const signer   = getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);
      const doc      = await contract.resolveDID(resolveAddr);
      if (!doc.isActive && doc.owner === ethers.ZeroAddress) {
        setResolveStatus({ type: "warning", msg: "Địa chỉ này chưa đăng ký DID." });
      } else {
        setResolvedDoc(doc);
      }
    } catch (e) {
      setResolveStatus({ type: "error", msg: e.reason || e.message });
    }
    setResolveLoading(false);
  }

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-badge badge-issuer">🏛️ ISSUER</div>
        <h1 className="page-title">Cấp phát Định danh</h1>
        <p className="page-subtitle">
          Đăng ký DID cho sinh viên và phát hành Verifiable Credential (bằng cấp, chứng chỉ).
          <br />
          <span style={{ color: "var(--cyan)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Đang dùng: {shortAddr(account)}
          </span>
        </p>
      </div>

      {/* ── Phần 1: Đăng ký DID ── */}
      <div className="section card">
        <div className="card-title">🆔 Đăng ký DID cho sinh viên</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
          Gọi <code style={{ color: "var(--cyan)" }}>registerDID()</code> — DID sẽ được tạo dưới dạng{" "}
          <code style={{ color: "var(--purple)" }}>did:ethr:&lt;address&gt;</code> và lưu on-chain.
        </p>

        <div className="card-grid">
          <div className="form-group">
            <label className="form-label">Địa chỉ ví sinh viên *</label>
            <input
              id="did-student-addr"
              className="form-input"
              placeholder="0x..."
              value={studentAddr}
              onChange={e => setStudentAddr(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Service Endpoint (tuỳ chọn)</label>
            <input
              id="did-service-url"
              className="form-input"
              placeholder="https://service.example.com"
              value={serviceUrl}
              onChange={e => setServiceUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Public Key (tuỳ chọn – để trống sẽ tự tạo)</label>
          <input
            id="did-public-key"
            className="form-input"
            placeholder="VD: pubkey-abc123 hoặc base64 encoded key"
            value={publicKey}
            onChange={e => setPublicKey(e.target.value)}
          />
        </div>

        {didStatus && (
          <div className={`alert alert-${didStatus.type === "success" ? "success" : "error"}`} style={{ whiteSpace: "pre-wrap" }}>
            {didStatus.type === "success" ? "✅" : "❌"} {didStatus.msg}
          </div>
        )}

        <button
          id="btn-register-did"
          className="btn btn-primary"
          onClick={handleRegisterDID}
          disabled={didLoading}
        >
          {didLoading ? <><span className="spinner" /> Đang xử lý...</> : "🆔 Đăng ký DID"}
        </button>
      </div>

      {/* ── Phần 2: Tra cứu DID ── */}
      <div className="section card">
        <div className="card-title">🔍 Tra cứu DID Document</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label className="form-label">Địa chỉ ví cần tra cứu</label>
            <input
              id="resolve-addr"
              className="form-input"
              placeholder="0x..."
              value={resolveAddr}
              onChange={e => setResolveAddr(e.target.value)}
            />
          </div>
          <button
            id="btn-resolve-did"
            className="btn btn-outline"
            onClick={handleResolveDID}
            disabled={resolveLoading}
            style={{ flexShrink: 0 }}
          >
            {resolveLoading ? <><span className="spinner" /> Đang tìm...</> : "🔍 Tra cứu"}
          </button>
        </div>

        {resolveStatus && (
          <div className={`alert alert-${resolveStatus.type === "error" ? "error" : "warning"}`} style={{ marginTop: 14 }}>
            {resolveStatus.msg}
          </div>
        )}

        {resolvedDoc && (
          <div style={{ marginTop: 16 }}>
            <div className="info-row">
              <span className="info-label">DID</span>
              <span className="info-value info-mono">{resolvedDoc.did}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Owner</span>
              <span className="info-value info-mono">{resolvedDoc.owner}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Trạng thái</span>
              <span className={`status-badge ${resolvedDoc.isActive ? "status-active" : "status-inactive"}`}>
                {resolvedDoc.isActive ? "● Active" : "● Inactive"}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Tạo lúc</span>
              <span className="info-value">{formatTimestamp(resolvedDoc.createdAt)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Cập nhật</span>
              <span className="info-value">{formatTimestamp(resolvedDoc.updatedAt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Phần 3: Phát hành VC ── */}
      <div className="section card">
        <div className="card-title">🎓 Phát hành Verifiable Credential</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
          Hash của VC JSON sẽ được ghi lên blockchain qua{" "}
          <code style={{ color: "var(--cyan)" }}>issueCredential()</code>. Nội dung VC lưu off-chain (localStorage).
        </p>

        <div className="card-grid">
          <div className="form-group">
            <label className="form-label">Địa chỉ ví sinh viên (Holder) *</label>
            <input id="vc-holder-addr" className="form-input" placeholder="0x..." value={holderAddr} onChange={e => setHolderAddr(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Loại chứng chỉ *</label>
            <select id="vc-type" className="form-select" value={credType} onChange={e => setCredType(e.target.value)}>
              <option value="BachelorDegree">Bằng Đại học (Bachelor)</option>
              <option value="MasterDegree">Bằng Thạc sĩ (Master)</option>
              <option value="DoctorateDegree">Bằng Tiến sĩ (Doctorate)</option>
              <option value="Certificate">Chứng chỉ kỹ năng</option>
              <option value="TranscriptRecord">Bảng điểm</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Họ và tên sinh viên *</label>
            <input id="vc-name" className="form-input" placeholder="Nguyễn Văn A" value={studentName} onChange={e => setStudentName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Mã số sinh viên *</label>
            <input id="vc-student-id" className="form-input" placeholder="21110000" value={studentId} onChange={e => setStudentId(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ngành học *</label>
            <input id="vc-major" className="form-input" placeholder="Công nghệ Thông tin" value={major} onChange={e => setMajor(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Năm tốt nghiệp</label>
            <input id="vc-grad-year" className="form-input" type="number" placeholder="2025" value={gradYear} onChange={e => setGradYear(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Ngày hết hạn (để "0" = không hết hạn)</label>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              id="vc-expires"
              className="form-input"
              type="date"
              style={{ flex: 1 }}
              onChange={e => setExpiresAt(e.target.value || "0")}
            />
            <button className="btn btn-outline btn-sm" onClick={() => setExpiresAt("0")} style={{ flexShrink: 0 }}>
              Không hết hạn
            </button>
          </div>
        </div>

        {credStatus && (
          <div className={`alert alert-${credStatus.type === "success" ? "success" : "error"}`} style={{ whiteSpace: "pre-wrap" }}>
            {credStatus.msg}
          </div>
        )}

        {lastIssuedHash && (
          <div className="alert alert-info" style={{ flexDirection: "column", gap: 4 }}>
            <strong>Hash VC (dùng để xác thực):</strong>
            <span className="info-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{lastIssuedHash}</span>
          </div>
        )}

        <button
          id="btn-issue-vc"
          className="btn btn-success btn-full"
          onClick={handleIssueCredential}
          disabled={credLoading}
        >
          {credLoading ? <><span className="spinner" /> Đang phát hành...</> : "🎓 Phát hành VC lên Blockchain"}
        </button>
      </div>
    </div>
  );
}
