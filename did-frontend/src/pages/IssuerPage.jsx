import { createSaltedCredential } from "../utils/selectiveDisclosure";
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

export default function IssuerPage({ account: propAccount }) {
  const account = propAccount || getAccount();


  const [publicKey, setPublicKey] = useState("");
  const [serviceUrl, setServiceUrl] = useState("");
  const [didStatus, setDidStatus] = useState(null);
  const [didLoading, setDidLoading] = useState(false);


  const [holderAddr, setHolderAddr] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [major, setMajor] = useState("");
  const [credType, setCredType] = useState("BachelorDegree");
    const [gradYear, setGradYear] = useState(new Date().getFullYear().toString());
  const [gpa, setGpa] = useState("3.80");
  const [classification, setClassification] = useState("Xuất sắc");
  const [dateOfBirth, setDateOfBirth] = useState("2002-05-15");
  const [nationalId, setNationalId] = useState("001202012345");
  const [expiresAt, setExpiresAt] = useState("0");
  const [credStatus, setCredStatus] = useState(null);
  const [credLoading, setCredLoading] = useState(false);
  const [lastIssuedHash, setLastIssuedHash] = useState("");
  const [lastIssuedVc, setLastIssuedVc] = useState(null);
  // ── Thu hồi VC ──────────────────────────────────────────
  const [revokeHolderAddr, setRevokeHolderAddr] = useState("");
  const [revokeCredList, setRevokeCredList] = useState([]);
  const [revokeCredLoading, setRevokeCredLoading] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // ── Kiểm tra authorized issuer ──────────────────────────
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);


  const [resolveAddr, setResolveAddr] = useState("");
  const [resolvedDoc, setResolvedDoc] = useState(null);
  const [resolveStatus, setResolveStatus] = useState(null);
  const [resolveLoading, setResolveLoading] = useState(false);

  if (!account) {
    return (
      <div className="connect-prompt">
        <div className="connect-prompt-icon">🔐</div>
        <h2>Kết nối ví MetaMask</h2>
        <p>Vui lòng kết nối ví MetaMask để sử dụng giao diện Issuer.</p>
      </div>
    );
  }



  // ── Handler kiểm tra authorized issuer ──────────────────
  async function handleCheckAuthorized() {
    setAuthChecking(true);
    try {
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_GANACHE_URL || "http://localhost:7545");
      const credRegistry = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        provider
      );
      const result = await credRegistry.authorizedIssuers(account);
      setIsAuthorized(result);
    } catch (e) {
      setIsAuthorized(false);
    }
    setAuthChecking(false);
  }

  // ── Handler thu hồi VC ──────────────────────────────────
  async function handleLoadHolderCreds() {
    if (!revokeHolderAddr.trim() || !/^0x[0-9a-fA-F]{40}$/.test(revokeHolderAddr.trim())) {
      setRevokeStatus({ type: 'error', msg: 'Dia chi vi khong hop le (can 0x + 40 ky tu hex).' });
      return;
    }
    setRevokeCredLoading(true);
    setRevokeStatus(null);
    setRevokeCredList([]);
    try {
      const provider = new ethers.JsonRpcProvider(
        import.meta.env.VITE_GANACHE_URL || 'http://localhost:7545'
      );
      const credRegistry = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        provider
      );
      const hashes = await credRegistry.getHolderCredentials(revokeHolderAddr.trim());
      const list = [];
      for (const h of hashes) {
        const d = await credRegistry.getCredential(h);
        list.push({
          hash: h,
          type: d.credentialType,
          issuedAt: Number(d.issuedAt),
          isRevoked: d.isRevoked,
          issuer: d.issuer,
        });
      }
      setRevokeCredList(list);
      if (list.length === 0)
        setRevokeStatus({ type: 'error', msg: 'Khong tim thay bang cap nao cho dia chi nay tren blockchain.' });
    } catch (err) {
      setRevokeStatus({ type: 'error', msg: 'Loi tai du lieu: ' + (err?.message || String(err)) });
    }
    setRevokeCredLoading(false);
  }

  async function handleRevokeCredential(hashParam) {
    const targetHash = hashParam || "";
    if (!targetHash || !/^0x[0-9a-fA-F]{64}$/.test(targetHash.trim()))
      return setRevokeStatus({ type: "error", msg: "Hash khong hop le." });

    const confirmed = window.confirm(
      `⚠️ Thu hồi bằng cấp?\n\nHash: ${targetHash}\n\nKhông thể hoàn tác!`
    );
    if (!confirmed) return;

    setRevokeLoading(true);
    setRevokeStatus(null);
    try {
      const signer = getSigner();
      const credRegistry = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const tx = await credRegistry.revokeCredential(targetHash.trim());
      await tx.wait();
      setRevokeStatus({ type: "success", msg: `✅ Đã thu hồi thành công!\nTx: ${tx.hash}` });
      // refresh list after revoke
      await handleLoadHolderCreds();
    } catch (err) {
      const msg = err?.reason || err?.message || "Lỗi không xác định";
      if (msg.includes("Chi Issuer goc"))
        setRevokeStatus({ type: "error", msg: "❌ Bạn không phải Issuer đã cấp bằng này." });
      else if (msg.includes("da bi thu hoi"))
        setRevokeStatus({ type: "error", msg: "❌ Bằng này đã bị thu hồi trước đó rồi." });
      else if (msg.includes("khong ton tai"))
        setRevokeStatus({ type: "error", msg: "❌ Không tìm thấy VC với hash này trên blockchain." });
      else
        setRevokeStatus({ type: "error", msg: `❌ Lỗi: ${msg}` });
    }
    setRevokeLoading(false);
  }
  async function handleRegisterDID() {
    if (!account || !ethers.isAddress(account))
      return setDidStatus({ type: "error", msg: "Địa chỉ ví không hợp lệ." });
    setDidLoading(true);
    setDidStatus(null);
    try {
      const signer = getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);



      const pk = publicKey || `pubkey-${account.slice(2, 10)}`;
      const svc = serviceUrl || `https://did.service/${account.slice(2, 10)}`;
      const tx = await contract.registerDID(pk, svc);
      await tx.wait();
      setDidStatus({ type: "success", msg: ` DID đã được đăng ký!\nTx: ${tx.hash}` });
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
      const signer = getSigner();

      // Sử dụng chuẩn Salted Claims (Selective Disclosure)
      const claims = {
        studentName,
        studentId,
        major,
        gpa: gpa || "3.80",
        classification: classification || "Xuất sắc",
        graduationYear: gradYear,
        dateOfBirth: dateOfBirth || "2002-05-15",
        nationalId: nationalId || "001202012345",
      };

      const expiry = expiresAt === "0" ? 0n : BigInt(Math.floor(new Date(expiresAt).getTime() / 1000));

      const { vc, rootHash } = createSaltedCredential({
        issuerDid: `did:ethr:${account}`,
        holderDid: `did:ethr:${holderAddr}`,
        credType,
        claims,
        expiresAt: expiresAt === "0" ? 0 : Number(expiry),
      });

      const vcHash = rootHash;

      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, signer
      );
      const tx = await contract.issueCredential(holderAddr, vcHash, credType, expiry);
      await tx.wait();

      setLastIssuedHash(vcHash);
      setLastIssuedVc(vc);
      setCredStatus({
        type: "success",
        msg: `🎉 Bằng cấp đã được phát hành lên Blockchain với mã bảo mật Salted Claims!
Hash: ${vcHash.slice(0, 20)}...
Tx: ${tx.hash}`,
      });

      // Lưu VC đầy đủ vào LocalStorage của sinh viên
      const vcJson = JSON.stringify(vc);
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
      const signer = getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);
      const doc = await contract.resolveDID(resolveAddr);
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
      { }
      <div className="page-header">
        <div className="page-badge badge-issuer">️ ISSUER</div>
        <h1 className="page-title">Cấp phát Định danh</h1>
        <p className="page-subtitle">
          Đăng ký DID cho sinh viên và phát hành Verifiable Credential (bằng cấp, chứng chỉ).
          <br />
          <span style={{ color: "var(--cyan)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Đang dùng: {shortAddr(account)}
          </span>
        </p>
      </div>

      {/* ── Đăng ký DID tổ chức ── */}
      <div className="section card">
        <div className="card-title">🏛️ Đăng ký DID Tổ chức</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
          Đăng ký Danh tính phi tập trung (DID) cho <strong>tổ chức này</strong> (ví đang kết nối).
          DID được tạo dưới dạng{" "}
          <code style={{ color: "var(--purple)" }}>did:ethr:{shortAddr(account)}</code> và lưu on-chain.
          <br />
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            💡 Sinh viên tự đăng ký DID của họ tại trang <strong>Holder</strong>.
          </span>
        </p>

        <div className="card-grid">
          <div className="form-group">
            <label className="form-label">Public Key (tuỳ chọn — để trống sẽ tự tạo)</label>
            <input
              id="did-public-key"
              className="form-input"
              placeholder="VD: pubkey-abc123 hoặc base64 encoded key"
              value={publicKey}
              onChange={e => setPublicKey(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Service Endpoint (tuỳ chọn)</label>
            <input
              id="did-service-url"
              className="form-input"
              placeholder="https://issuer.university.edu/did"
              value={serviceUrl}
              onChange={e => setServiceUrl(e.target.value)}
            />
          </div>
        </div>

        {didStatus && (
          <div className={`alert alert-${didStatus.type === "success" ? "success" : "error"}`} style={{ whiteSpace: "pre-wrap" }}>
            {didStatus.type === "success" ? "" : ""} {didStatus.msg}
          </div>
        )}

        <button
          id="btn-register-did"
          className="btn btn-primary"
          onClick={handleRegisterDID}
          disabled={didLoading}
        >
          {didLoading ? <><span className="spinner" /> Đang xử lý...</> : " Đăng ký DID"}
        </button>
      </div>

      { }
      <div className="section card">
        <div className="card-title"> Tra cứu DID Document</div>
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
            {resolveLoading ? <><span className="spinner" /> Đang tìm...</> : " Tra cứu"}
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

      { }
      <div className="section card">
        <div className="card-title"> Phát hành Verifiable Credential</div>
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

        {lastIssuedHash && lastIssuedVc && (
          <div className="alert alert-info" style={{ flexDirection: "column", gap: 8 }}>
            <strong>Hash VC (dùng để xác thực):</strong>
            <span className="info-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{lastIssuedHash}</span>
            <div style={{ marginTop: 4, padding: '8px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong>Quan trong:</strong> Hay tai file VC nay va gui cho sinh vien (qua email / USB). Sinh vien can file nay de tao VP.
            </div>
            <button
              id="btn-download-vc"
              className="btn btn-outline btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                const blob = new Blob([JSON.stringify(lastIssuedVc, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vc_${holderAddr.slice(2, 10)}_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Tai file VC cho Holder
            </button>
          </div>
        )}

        <button
          id="btn-issue-vc"
          className="btn btn-success btn-full"
          onClick={handleIssueCredential}
          disabled={credLoading}
        >
          {credLoading ? <><span className="spinner" /> Đang phát hành...</> : " Phát hành VC lên Blockchain"}
        </button>

      </div>

      {/* Kiem tra Quyen Issuer */}
      <div className="section card">
        <div className="card-title">🔐 Kiểm tra Quyền Issuer</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
          Kiểm tra xem địa chỉ ví của bạn có được Owner cấp phép phát hành bằng cấp hay không.
        </p>
        <button
          id="btn-check-authorized"
          className="btn btn-outline"
          onClick={handleCheckAuthorized}
          disabled={authChecking}
          style={{ marginBottom: 14 }}
        >
          {authChecking ? <><span className="spinner" /> Đang kiểm tra...</> : '🔍 Kiểm tra quyền Issuer'}
        </button>
        {isAuthorized !== null && (
          <div className={`alert alert-${isAuthorized ? 'success' : 'error'}`}>
            {isAuthorized
              ? '✅ Địa chỉ của bạn ĐÃ được cấp phép — có thể phát hành bằng cấp.'
              : '❌ Địa chỉ CHƯA được cấp phép.'}
          </div>
        )}
      </div>

      {/* Thu hoi Credential */}
      <div className="section card">
        <div className="card-title" style={{ color: '#ef4444' }}>🚫 Thu hồi Bằng cấp (Revoke VC)</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          Nhập địa chỉ ví sinh viên để xem danh sách bằng cấp, sau đó chọn bằng cần thu hồi.
          <strong> Hành động không thể hoàn tác!</strong>
        </p>

        {/* Buoc 1: tim sinh vien */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label className="form-label">Địa chỉ ví Sinh viên (Holder) *</label>
            <input
              id="revoke-holder-addr"
              className="form-input"
              placeholder="0x..."
              value={revokeHolderAddr}
              onChange={e => setRevokeHolderAddr(e.target.value)}
            />
          </div>
          <button
            id="btn-load-holder-creds"
            className="btn btn-outline"
            onClick={handleLoadHolderCreds}
            disabled={revokeCredLoading}
            style={{ flexShrink: 0 }}
          >
            {revokeCredLoading
              ? <><span className="spinner" /> Đang tải...</>
              : '🔍 Tải danh sách'}
          </button>
        </div>

        {revokeStatus && (
          <div
            className={`alert alert-${revokeStatus.type === 'success' ? 'success' : 'error'}`}
            style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}
          >
            {revokeStatus.msg}
          </div>
        )}

        {/* Buoc 2: danh sach bang cap */}
        {revokeCredList.length > 0 && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Tìm thấy <strong>{revokeCredList.length}</strong> bằng cấp — chọn để thu hồi:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {revokeCredList.map((cred) => (
                <div
                  key={cred.hash}
                  style={{
                    background: cred.isRevoked
                      ? 'rgba(239,68,68,0.07)'
                      : 'rgba(255,255,255,0.03)',
                    border: cred.isRevoked
                      ? '1px solid rgba(239,68,68,0.35)'
                      : '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      🎓 {cred.type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {cred.hash}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Cấp lúc: {new Date(cred.issuedAt * 1000).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {cred.isRevoked ? (
                      <span className="status-badge status-inactive">⛔ Đã thu hồi</span>
                    ) : (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleRevokeCredential(cred.hash)}
                        disabled={revokeLoading}
                        style={{ background: '#ef4444', color: '#fff', padding: '6px 16px', fontSize: 13 }}
                      >
                        {revokeLoading ? <span className="spinner" /> : '🚫 Thu hồi'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
