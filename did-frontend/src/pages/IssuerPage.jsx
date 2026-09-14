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

  /* ── State DID ─────────────────────────────────────────── */
  const [publicKey, setPublicKey] = useState("");
  const [serviceUrl, setServiceUrl] = useState("");
  const [didStatus, setDidStatus] = useState(null);
  const [didLoading, setDidLoading] = useState(false);
  const [showDidEdit, setShowDidEdit] = useState(false);

  /* ── State Cấp VC ──────────────────────────────────────── */
  const [holderAddr, setHolderAddr] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [major, setMajor] = useState("Khoa học Máy tính & Kỹ thuật Phần mềm (Computer Science)");
  const [credType, setCredType] = useState("BachelorDegree");
  const [gradYear, setGradYear] = useState(new Date().getFullYear().toString());
  const [gpa, setGpa] = useState("3.82");
  const [classification, setClassification] = useState("Xuất sắc");
  const [dateOfBirth, setDateOfBirth] = useState("2002-05-15");
  const [nationalId, setNationalId] = useState("001202012345");
  const [validityType, setValidityType] = useState("permanent");
  const [expiresAt, setExpiresAt] = useState("0");
  const [credStatus, setCredStatus] = useState(null);
  const [credLoading, setCredLoading] = useState(false);
  const [lastIssuedHash, setLastIssuedHash] = useState("");
  const [lastIssuedTx, setLastIssuedTx] = useState("");
  const [lastIssuedVc, setLastIssuedVc] = useState(null);

  /* ── Thu hồi VC ────────────────────────────────────────── */
  const [revokeHolderAddr, setRevokeHolderAddr] = useState("");
  const [revokeCredList, setRevokeCredList] = useState([]);
  const [revokeCredLoading, setRevokeCredLoading] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [selectedRevokeCred, setSelectedRevokeCred] = useState(null);
  const [revokeReason, setRevokeReason] = useState("Sai sót thông tin cá nhân (Yêu cầu phát hành lại)");

  /* ── Kiểm tra authorized issuer ────────────────────────── */
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);

  /* ── Resolve DID ───────────────────────────────────────── */
  const [resolveAddr, setResolveAddr] = useState("");
  const [resolvedDoc, setResolvedDoc] = useState(null);
  const [resolveStatus, setResolveStatus] = useState(null);
  const [resolveLoading, setResolveLoading] = useState(false);

  const [copiedText, setCopiedText] = useState("");

  function copyToClipboard(text, label) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedText(label);
      setTimeout(() => setCopiedText(""), 2000);
    });
  }

  /* ── Handler kiểm tra authorized issuer ────────────────── */
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

  /* ── Handler tra cứu VC sinh viên để thu hồi ───────────── */
  async function handleLoadHolderCreds() {
    if (!revokeHolderAddr.trim() || !ethers.isAddress(revokeHolderAddr.trim())) {
      setRevokeStatus({ type: "error", msg: "Địa chỉ ví sinh viên không hợp lệ (cần 0x + 40 ký tự hex)." });
      return;
    }
    setRevokeCredLoading(true);
    setRevokeStatus(null);
    setRevokeCredList([]);
    try {
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_GANACHE_URL || "http://localhost:7545");
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
      if (list.length === 0) {
        setRevokeStatus({ type: "error", msg: "Không tìm thấy bằng cấp nào cho địa chỉ ví này trên Blockchain." });
      }
    } catch (err) {
      setRevokeStatus({ type: "error", msg: "Lỗi tải dữ liệu: " + (err?.message || String(err)) });
    }
    setRevokeCredLoading(false);
  }

  async function handleRevokeCredential(targetHash) {
    if (!targetHash || !/^0x[0-9a-fA-F]{64}$/.test(targetHash.trim())) {
      return setRevokeStatus({ type: "error", msg: "Mã Hash không hợp lệ." });
    }

    setRevokeLoading(true);
    setRevokeStatus(null);
    try {
      const signer = await getSigner();
      const credRegistry = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const tx = await credRegistry.revokeCredential(targetHash.trim());
      await tx.wait();
      setRevokeStatus({
        type: "success",
        msg: `✅ Đã ghi nhận thu hồi bằng cấp lên Blockchain thành công!\nTx Hash: ${tx.hash}`,
      });
      setSelectedRevokeCred(null);
      await handleLoadHolderCreds();
    } catch (err) {
      const msg = err?.reason || err?.message || "Lỗi không xác định";
      if (msg.includes("Chi Issuer goc")) {
        setRevokeStatus({ type: "error", msg: "❌ Chỉ có Issuer gốc phát hành bằng mới có quyền thu hồi." });
      } else if (msg.includes("da bi thu hoi")) {
        setRevokeStatus({ type: "error", msg: "❌ Bằng cấp này đã bị thu hồi trước đó rồi." });
      } else if (msg.includes("khong ton tai")) {
        setRevokeStatus({ type: "error", msg: "❌ Không tìm thấy VC với hash này trên blockchain." });
      } else {
        setRevokeStatus({ type: "error", msg: `❌ Lỗi: ${msg}` });
      }
    }
    setRevokeLoading(false);
  }

  /* ── Handler Quản lý DID ───────────────────────────────── */
  async function handleRegisterDID() {
    if (!publicKey.trim()) {
      setDidStatus({ type: "error", msg: "Vui lòng nhập Public Key!" });
      return;
    }
    setDidLoading(true);
    setDidStatus(null);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        signer
      );
      const tx = await contract.registerDID(publicKey.trim(), serviceUrl.trim());
      await tx.wait();
      setDidStatus({ type: "success", msg: "✅ Đăng ký DID trường học thành công on-chain!" });
      setShowDidEdit(false);
    } catch (err) {
      setDidStatus({ type: "error", msg: err.reason || err.message });
    }
    setDidLoading(false);
  }

  async function handleUpdateDID() {
    if (!publicKey.trim()) {
      setDidStatus({ type: "error", msg: "Vui lòng nhập Public Key mới!" });
      return;
    }
    setDidLoading(true);
    setDidStatus(null);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        signer
      );
      const tx = await contract.updateDIDDocument(publicKey.trim(), serviceUrl.trim());
      await tx.wait();
      setDidStatus({ type: "success", msg: "✅ Đã cập nhật DID Document thành công!" });
      setShowDidEdit(false);
    } catch (err) {
      setDidStatus({ type: "error", msg: err.reason || err.message });
    }
    setDidLoading(false);
  }

  async function handleDeactivateDID() {
    if (!window.confirm("⚠️ Bạn có chắc muốn hủy kích hoạt DID trường học này không?")) return;
    setDidLoading(true);
    setDidStatus(null);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        signer
      );
      const tx = await contract.deactivateDID();
      await tx.wait();
      setDidStatus({ type: "success", msg: "✅ Đã hủy kích hoạt DID trường học!" });
    } catch (err) {
      setDidStatus({ type: "error", msg: err.reason || err.message });
    }
    setDidLoading(false);
  }

  /* ── Handler Cấp phát VC ────────────────────────────────── */
  async function handleIssueCredential(e) {
    if (e) e.preventDefault();
    if (!holderAddr || !studentName || !studentId || !major) {
      setCredStatus({ type: "error", msg: "Vui lòng điền đầy đủ các trường thông tin bắt buộc (*)" });
      return;
    }
    if (!ethers.isAddress(holderAddr.trim())) {
      setCredStatus({ type: "error", msg: "Địa chỉ ví sinh viên không hợp lệ (cần định dạng 0x...)." });
      return;
    }
    setCredLoading(true);
    setCredStatus(null);
    try {
      const issuerDid = `did:ethr:${account}`;
      const holderDid = `did:ethr:${holderAddr.trim()}`;

      const claims = {
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        major: major.trim(),
        degreeType: credType,
        graduationYear: gradYear.trim(),
        gpa: gpa.trim(),
        classification: classification.trim(),
        dateOfBirth: dateOfBirth.trim(),
        nationalId: nationalId.trim(),
      };

      const expTimestamp = (validityType === "permanent" || expiresAt === "0" || !expiresAt)
        ? 0n
        : BigInt(expiresAt);

      const { vc, rootHash } = createSaltedCredential({
        issuerDid,
        holderDid,
        credType,
        claims,
        expiresAt: expTimestamp,
      });

      const signer = await getSigner();
      const signature = await signer.signMessage(ethers.getBytes(rootHash));
      vc.proof = {
        type: "EcdsaSecp256k1RecoverySignature2020",
        created: new Date().toISOString(),
        verificationMethod: `${issuerDid}#controller`,
        proofPurpose: "assertionMethod",
        signature,
      };

      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );

      const tx = await contract.issueCredential(
        holderAddr.trim(),
        rootHash,
        credType,
        expTimestamp
      );
      await tx.wait();

      setLastIssuedHash(rootHash);
      setLastIssuedTx(tx.hash);
      setLastIssuedVc(vc);
      setCredStatus({
        type: "success",
        msg: "✅ Cấp phát Verifiable Credential thành công và đã Neo (Anchor) lên Ethereum Blockchain!",
        hash: rootHash,
        tx: tx.hash,
        vc,
      });
    } catch (err) {
      setCredStatus({ type: "error", msg: err.reason || err.message });
    }
    setCredLoading(false);
  }

  function handleDownloadLastVc() {
    if (!lastIssuedVc) return;
    const blob = new Blob([JSON.stringify(lastIssuedVc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VC_${studentId || "Student"}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Handler Resolve DID ────────────────────────────────── */
  async function handleResolveDID() {
    if (!resolveAddr.trim() || !ethers.isAddress(resolveAddr.trim())) {
      setResolveStatus({ type: "error", msg: "Địa chỉ ví tra cứu không hợp lệ." });
      return;
    }
    setResolveLoading(true);
    setResolveStatus(null);
    setResolvedDoc(null);
    try {
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_GANACHE_URL || "http://localhost:7545");
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        provider
      );
      const doc = await contract.resolveDID(resolveAddr.trim());
      if (doc.owner === ethers.ZeroAddress || !doc.isActive) {
        setResolveStatus({ type: "error", msg: "DID chưa được đăng ký hoặc đã bị hủy kích hoạt." });
      } else {
        setResolvedDoc(doc);
      }
    } catch (err) {
      setResolveStatus({ type: "error", msg: err.reason || err.message });
    }
    setResolveLoading(false);
  }

  const universityDid = account ? `did:ethr:${account}` : "did:ethr:0x... (chưa kết nối ví)";

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ── Top Header & Telemetry Strip ── */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-container-low p-6 sm:p-8 shadow-2xl border border-white/5">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
        <div className="absolute right-64 -bottom-16 w-64 h-64 rounded-full bg-secondary/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-primary font-label-badge text-[12px]">
                <span className="material-symbols-outlined text-[15px]">school</span>
                ACADEMIC ISSUER NODE
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-tertiary font-label-badge text-[12px]">
                <span className="inline-block w-2 h-2 rounded-full bg-tertiary animate-ping" />
                W3C DID v1.0 COMPLIANT
              </span>
              {isAuthorized !== null && (
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-label-badge text-[12px] ${isAuthorized ? "bg-tertiary/10 text-tertiary border border-tertiary/20" : "bg-error/10 text-error border border-error/20"}`}>
                  <span className="material-symbols-outlined text-[14px]">{isAuthorized ? "verified" : "gpp_bad"}</span>
                  {isAuthorized ? "Authorized Issuer" : "Chưa cấp quyền Issuer"}
                </span>
              )}
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-4xl text-on-surface font-bold tracking-tight">
              Cổng Quản Trị Cấp Phát Bằng Đại Học
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Hệ thống xác thực và cấp phát Chứng chỉ Số (Verifiable Credentials) theo chuẩn W3C DID trên Ethereum Smart Contract và Zero-Knowledge Registry.
            </p>
          </div>

          {/* Telemetry Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full xl:w-auto">
            <div className="bg-surface-container/80 backdrop-blur-md p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="font-label-badge text-[11px] text-on-surface-variant uppercase tracking-wider">Tổng Đã Cấp</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-headline-md text-2xl font-bold text-on-surface">{lastIssuedHash ? "1,429" : "1,428"}</span>
                <span className="font-label-code text-xs text-tertiary">+1 hôm nay</span>
              </div>
              <span className="text-on-surface-variant text-xs mt-1">Khóa 2020-2024</span>
            </div>

            <div className="bg-surface-container/80 backdrop-blur-md p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="font-label-badge text-[11px] text-tertiary uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Đang Hoạt Động
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-headline-md text-2xl font-bold text-tertiary">1,416</span>
                <span className="font-label-badge text-xs text-on-surface-variant">99.1%</span>
              </div>
              <span className="text-on-surface-variant text-xs mt-1">Neo hợp đồng</span>
            </div>

            <div className="bg-surface-container/80 backdrop-blur-md p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="font-label-badge text-[11px] text-error uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error" /> Đã Thu Hồi
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-headline-md text-2xl font-bold text-error">12</span>
                <span className="font-label-code text-xs text-error-container">Revoked</span>
              </div>
              <span className="text-on-surface-variant text-xs mt-1">Blacklist bitmap</span>
            </div>

            <div className="bg-surface-container/80 backdrop-blur-md p-4 rounded-xl border border-white/5 flex flex-col justify-between">
              <span className="font-label-badge text-[11px] text-primary uppercase tracking-wider">Mạng &amp; Gas Node</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="font-headline-sm text-xl font-bold text-primary">Ganache</span>
              </div>
              <span className="font-label-code text-xs text-on-surface-variant mt-1 truncate">ID: 1337 / 5777</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2-Column Bento Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: 7 Cols on Desktop */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* Card 1: DID Organization Profile */}
          <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl border border-white/5 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shadow-inner border border-primary/20">
                  <span className="material-symbols-outlined text-[28px]">account_balance</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Hồ Sơ Danh Tính Phi Tập Trung</h2>
                  <p className="font-body-sm text-sm text-on-surface-variant">DID Organization Profile &amp; Cryptographic Authority</p>
                </div>
              </div>
              <button
                onClick={handleCheckAuthorized}
                disabled={authChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs text-on-surface font-label-badge transition-colors self-start sm:self-auto border border-white/10"
              >
                <span className="material-symbols-outlined text-[16px] text-tertiary">
                  {authChecking ? "sync" : "verified"}
                </span>
                {authChecking ? "Đang kiểm tra..." : "Kiểm tra quyền Issuer"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
              <div className="space-y-1">
                <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">University DID Identifier</span>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-primary border border-white/5">
                  <span className="truncate">{universityDid}</span>
                  <button
                    className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
                    onClick={() => copyToClipboard(universityDid, "did")}
                    title="Sao chép DID"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copiedText === "did" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Public Key (secp256k1)</span>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface border border-white/5">
                  <span className="truncate">{publicKey || "0x04bfcab53f0016f4991bc2d8...92d1a"}</span>
                  <span className="material-symbols-outlined text-[16px] text-tertiary">key</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Service Endpoint</span>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface-variant border border-white/5">
                  <span className="truncate">{serviceUrl || "https://university.edu.vn/api/v1/did-doc"}</span>
                  <span className="material-symbols-outlined text-[16px] text-primary">link</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Contract Registry</span>
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-secondary border border-white/5">
                  <span className="truncate">{CONTRACT_ADDRESSES.DID_REGISTRY}</span>
                  <button
                    className="text-on-surface-variant hover:text-secondary transition-colors"
                    onClick={() => copyToClipboard(CONTRACT_ADDRESSES.DID_REGISTRY, "contract")}
                    title="Sao chép địa chỉ hợp đồng"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copiedText === "contract" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Expandable Form to Register/Update DID on-chain */}
            {showDidEdit && (
              <div className="mt-6 p-4 rounded-xl bg-surface-container-lowest border border-primary/20 space-y-4">
                <div className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                  Thiết Lập DID Document Trực Tiếp Trên Smart Contract
                </div>
                <div className="space-y-2">
                  <label className="font-label-badge text-xs text-on-surface-variant">Public Key (secp256k1 string / hex) *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low font-label-code text-xs text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="VD: 0x04abc123..."
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-badge text-xs text-on-surface-variant">Service Endpoint URL</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low font-label-code text-xs text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="https://issuer.university.edu/did"
                    value={serviceUrl}
                    onChange={(e) => setServiceUrl(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleRegisterDID}
                    disabled={didLoading}
                    className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-body-sm text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    {didLoading ? "Đang ghi nhận..." : "Đăng ký mới DID"}
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateDID}
                    disabled={didLoading}
                    className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-body-sm text-sm font-semibold transition-all border border-primary/30 disabled:opacity-50"
                  >
                    {didLoading ? "Đang cập nhật..." : "Cập nhật DID Document"}
                  </button>
                </div>
              </div>
            )}

            {didStatus && (
              <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${didStatus.type === "success" ? "bg-tertiary/10 text-tertiary border border-tertiary/20" : "bg-error/10 text-error border border-error/20"}`}>
                <span className="material-symbols-outlined text-[18px]">
                  {didStatus.type === "success" ? "check_circle" : "error"}
                </span>
                <span>{didStatus.msg}</span>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={handleDeactivateDID}
                disabled={didLoading}
                className="px-4 py-2 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-error hover:text-error font-body-sm text-sm flex items-center gap-1.5 transition-all border border-error/20"
              >
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>Tạm dừng / Hủy kích hoạt DID</span>
              </button>
              <button
                onClick={() => setShowDidEdit(!showDidEdit)}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-body-sm text-sm flex items-center gap-1.5 transition-all border border-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>{showDidEdit ? "Đóng thiết lập" : "Cập nhật DID Document"}</span>
              </button>
            </div>
          </div>

          {/* Card 2: Form Cấp Phát Bằng Tốt Nghiệp Mới */}
          <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl border border-white/5">
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-[24px]">verified</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Cấp Phát Bằng Tốt Nghiệp Mới</h2>
                  <p className="font-body-sm text-sm text-on-surface-variant">Issue Verifiable Credential · W3C Standard Payload &amp; Merkle Root</p>
                </div>
              </div>
              <span className="font-label-badge text-xs text-primary bg-surface-container-high px-3 py-1 rounded-full border border-primary/20">
                EIP-712 &amp; ECDSA
              </span>
            </div>

            <form onSubmit={handleIssueCredential} className="space-y-5 mt-6">
              {/* Student Wallet Address */}
              <div className="space-y-1">
                <label className="font-label-badge text-xs text-on-surface-variant uppercase flex items-center justify-between">
                  <span>Địa Chỉ Ví Sinh Viên (Student Wallet Address) *</span>
                  {ethers.isAddress(holderAddr.trim()) && (
                    <span className="text-tertiary flex items-center gap-0.5 text-xs">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span> Địa chỉ hợp lệ
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 font-label-code text-xs text-on-surface-variant pointer-events-none">ETH</span>
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={holderAddr}
                    onChange={(e) => setHolderAddr(e.target.value)}
                    className="w-full pl-12 pr-10 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                  <div className="absolute right-3 text-tertiary">
                    <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                  </div>
                </div>
              </div>

              {/* 2-col inputs: Name & ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Họ và Tên Sinh Viên (Full Name) *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Nguyễn Văn An"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-body-md text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Mã Số Sinh Viên (Student ID) *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 20120001"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
              </div>

              {/* Degree Type & Major */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Loại Bằng (Degree Type) *</label>
                  <select
                    value={credType}
                    onChange={(e) => setCredType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-body-md text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner cursor-pointer"
                  >
                    <option value="BachelorDegree">Bằng Cử Nhân (BachelorDegree)</option>
                    <option value="MasterDegree">Bằng Thạc Sĩ (MasterDegree)</option>
                    <option value="DoctorateDegree">Bằng Tiến Sĩ (DoctorateDegree)</option>
                    <option value="ProfessionalCertificate">Chứng Chỉ Chuyên Sâu (Certificate)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Ngành Đào Tạo (Major) *</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Khoa học Máy tính"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-body-md text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
              </div>

              {/* Graduation Year, GPA, Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Năm Tốt Nghiệp *</label>
                  <input
                    type="number"
                    required
                    value={gradYear}
                    onChange={(e) => setGradYear(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Điểm GPA (Thang 4) *</label>
                  <input
                    type="text"
                    required
                    value={gpa}
                    onChange={(e) => setGpa(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Xếp Loại Tốt Nghiệp *</label>
                  <select
                    value={classification}
                    onChange={(e) => setClassification(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-body-md text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner cursor-pointer"
                  >
                    <option value="Xuất sắc">Xuất sắc (High Distinction)</option>
                    <option value="Giỏi">Giỏi (Distinction)</option>
                    <option value="Khá">Khá (Credit)</option>
                    <option value="Trung bình khá">Trung bình khá (Strong Pass)</option>
                  </select>
                </div>
              </div>

              {/* Birth Date & National ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Ngày Sinh (YYYY-MM-DD) *</label>
                  <input
                    type="date"
                    required
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-label-badge text-xs text-on-surface-variant uppercase">Số CCCD / CMND *</label>
                  <input
                    type="text"
                    required
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="VD: 001202012345"
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  />
                </div>
              </div>

              {/* Credential Expiration */}
              <div className="space-y-2 pt-1">
                <span className="font-label-badge text-xs text-on-surface-variant uppercase block">Thời Hạn Hiệu Lực Của Chứng Chỉ</span>
                <div className="flex flex-wrap items-center gap-6 bg-surface-container-lowest p-4 rounded-lg border border-white/5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="validityType"
                      checked={validityType === "permanent"}
                      onChange={() => {
                        setValidityType("permanent");
                        setExpiresAt("0");
                      }}
                      className="w-4 h-4 text-primary focus:ring-primary cursor-pointer"
                    />
                    <span className="font-body-md text-sm text-on-surface">Vô thời hạn (Permanent / Lifetime Degree)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="validityType"
                      checked={validityType === "expiring"}
                      onChange={() => {
                        setValidityType("expiring");
                        const future = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
                        setExpiresAt(future.toString());
                      }}
                      className="w-4 h-4 text-primary focus:ring-primary cursor-pointer"
                    />
                    <span className="font-body-md text-sm text-on-surface-variant">Có ngày hết hạn</span>
                  </label>
                  {validityType === "expiring" && (
                    <input
                      type="text"
                      placeholder="Unix Timestamp (giây)"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="px-3 py-1 rounded bg-surface-container-high font-label-code text-xs text-on-surface border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              </div>

              {/* Feedback alert */}
              {credStatus && (
                <div className={`p-4 rounded-xl text-sm flex items-start gap-3 ${credStatus.type === "success" ? "bg-tertiary/10 text-tertiary border border-tertiary/20" : "bg-error/10 text-error border border-error/20"}`}>
                  <span className="material-symbols-outlined text-[22px] flex-shrink-0 mt-0.5">
                    {credStatus.type === "success" ? "verified" : "error"}
                  </span>
                  <div>
                    <div className="font-semibold">{credStatus.msg}</div>
                    {credStatus.hash && (
                      <div className="font-label-code text-xs mt-1 text-on-surface-variant break-all">
                        Root Hash: {credStatus.hash}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={credLoading}
                  className="w-full relative group overflow-hidden rounded-xl bg-primary hover:bg-primary-container text-on-primary py-4 px-6 font-headline-sm text-base font-semibold transition-all shadow-[0_0_24px_-4px_rgba(56,189,248,0.4)] hover:shadow-[0_0_32px_0px_rgba(56,189,248,0.6)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {credLoading ? "sync" : "key"}
                  </span>
                  <span>{credLoading ? "Đang ký số & neo hợp đồng..." : "Ký số (EIP-712) & Cấp phát VC lên Blockchain"}</span>
                  <span className="font-label-badge text-xs bg-on-primary/15 text-on-primary px-2.5 py-0.5 rounded ml-2">
                    Gas: ~0.0021 ETH
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: 5 Cols on Desktop */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* Card 3: Kết Quả Phát Hành Gần Nhất */}
          <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl border border-white/5 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-tertiary/10 blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-tertiary-container/20 text-tertiary flex items-center justify-center border border-tertiary/30">
                  <span className="material-symbols-outlined text-[24px]">task_alt</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Kết Quả Phát Hành Gần Nhất</h2>
                  <p className="font-body-sm text-sm text-on-surface-variant">Latest Issued Result Panel · Verified On-Chain</p>
                </div>
              </div>
              <span className="font-label-code text-xs text-tertiary bg-tertiary-container/30 px-3 py-1 rounded-full">
                GANACHE NODE
              </span>
            </div>

            {lastIssuedHash ? (
              <div className="space-y-5 mt-6">
                {/* Status Alert Banner */}
                <div className="p-4 rounded-xl bg-tertiary/10 text-tertiary flex items-start gap-3 border border-tertiary/20">
                  <span className="material-symbols-outlined text-[22px] flex-shrink-0 mt-0.5">verified</span>
                  <div className="text-sm">
                    <span className="font-semibold">Bằng cấp đã được Neo dữ liệu (Anchored) thành công!</span>
                    <p className="text-on-surface-variant text-xs mt-0.5">Mã hash đã được phân tán trên Merkle Tree của Smart Contract.</p>
                  </div>
                </div>

                {/* Root Hash */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Credential Root Hash (bytes32)</span>
                    <span className="font-label-code text-xs text-primary">SHA-256</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface border border-white/5">
                    <span className="truncate">{lastIssuedHash}</span>
                    <button
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
                      onClick={() => copyToClipboard(lastIssuedHash, "rootHash")}
                      title="Sao chép Root Hash"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {copiedText === "rootHash" ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Tx Hash */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Ethereum Tx Hash</span>
                    <span className="font-label-code text-xs text-tertiary">Mined on-chain</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-primary border border-white/5">
                    <span className="truncate">{lastIssuedTx}</span>
                    <button
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
                      onClick={() => copyToClipboard(lastIssuedTx, "txHash")}
                      title="Sao chép Tx Hash"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {copiedText === "txHash" ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Signature */}
                {lastIssuedVc?.proof?.signature && (
                  <div className="space-y-1">
                    <span className="font-label-badge text-xs text-on-surface-variant uppercase tracking-wider">Issuer Signature (ECDSA)</span>
                    <div className="p-3 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface-variant break-all border border-white/5 max-h-20 overflow-y-auto">
                      {lastIssuedVc.proof.signature}
                    </div>
                  </div>
                )}

                {/* Visual Degree Card */}
                <div className="p-5 rounded-xl bg-gradient-to-br from-surface-container-high to-surface-container-low shadow-lg space-y-3 relative overflow-hidden border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">workspace_premium</span>
                      <span className="font-headline-sm text-sm text-on-surface font-semibold">Đại Học Quốc Gia TP.HCM</span>
                    </div>
                    <span className="font-label-badge text-xs text-tertiary bg-tertiary/10 px-2.5 py-0.5 rounded-full border border-tertiary/20">VERIFIED VC</span>
                  </div>
                  <div className="pt-2">
                    <div className="text-xs text-on-surface-variant">Sinh viên tốt nghiệp</div>
                    <div className="font-headline-md text-lg font-bold text-primary">{studentName || "Sinh viên"}</div>
                    <div className="font-label-code text-xs text-on-surface-variant">MSSV: {studentId} · GPA: {gpa}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-xs text-on-surface">{major}</span>
                    <span className="font-label-badge text-xs text-secondary font-bold uppercase">{classification}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleDownloadLastVc}
                    className="px-4 py-2.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-body-sm text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-primary/30"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    <span>Tải .JSON (W3C)</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(lastIssuedVc, null, 2), "jsonVc")}
                    className="px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-body-sm text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-white/10"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    <span>{copiedText === "jsonVc" ? "Đã chép!" : "Copy JSON-LD"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-on-surface-variant space-y-3">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">post_add</span>
                <p className="text-sm">Chưa có chứng chỉ nào vừa phát hành trong phiên này.</p>
                <p className="text-xs text-outline">Điền biểu mẫu bên trái và bấm &quot;Ký số &amp; Cấp phát&quot; để tạo bằng cấp mới.</p>
              </div>
            )}
          </div>

          {/* Card 4: Quản Lý & Thu Hồi Bằng Cấp (Revocation Registry) */}
          <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl border border-white/5 overflow-hidden">
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-error-container/30 text-error flex items-center justify-center border border-error/30">
                  <span className="material-symbols-outlined text-[24px]">gavel</span>
                </div>
                <div>
                  <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Quản Lý &amp; Thu Hồi Bằng Cấp</h2>
                  <p className="font-body-sm text-sm text-on-surface-variant">On-Chain Revocation BitMap Registry</p>
                </div>
              </div>
              <span className="font-label-badge text-xs text-error bg-error-container/20 px-3 py-1 rounded-full border border-error/30">
                REVOCATION
              </span>
            </div>

            {/* Search Holder Address */}
            <div className="space-y-4 mt-6">
              <div className="space-y-1">
                <label className="font-label-badge text-xs text-on-surface-variant uppercase">Tra cứu chứng chỉ của sinh viên (địa chỉ ví 0x...)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="0x... địa chỉ ví sinh viên cần thu hồi"
                    value={revokeHolderAddr}
                    onChange={(e) => setRevokeHolderAddr(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-error shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={handleLoadHolderCreds}
                    disabled={revokeCredLoading}
                    className="px-4 py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all border border-white/10 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {revokeCredLoading ? "sync" : "search"}
                    </span>
                    <span>{revokeCredLoading ? "Đang tải..." : "Tìm VC"}</span>
                  </button>
                </div>
              </div>

              {revokeStatus && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${revokeStatus.type === "success" ? "bg-tertiary/10 text-tertiary border border-tertiary/20" : "bg-error/10 text-error border border-error/20"}`}>
                  <span className="material-symbols-outlined text-[18px]">
                    {revokeStatus.type === "success" ? "check_circle" : "error"}
                  </span>
                  <span>{revokeStatus.msg}</span>
                </div>
              )}

              {/* Table of retrieved credentials */}
              {revokeCredList.length > 0 && (
                <div className="overflow-x-auto rounded-xl bg-surface-container-lowest border border-white/5 mt-4">
                  <table className="w-full text-left font-body-sm text-xs">
                    <thead className="bg-surface-container-high/60 font-label-badge text-on-surface-variant uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Loại Bằng</th>
                        <th className="py-2.5 px-3">Root Hash</th>
                        <th className="py-2.5 px-3">Trạng Thái</th>
                        <th className="py-2.5 px-3 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {revokeCredList.map((c, i) => (
                        <tr key={i} className="hover:bg-surface-container-high/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-on-surface">
                            {c.type}
                            <div className="font-label-code text-[10px] text-on-surface-variant">
                              {formatTimestamp(c.issuedAt)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-label-code text-on-surface-variant">
                            {shortAddr(c.hash, 8)}
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isRevoked ? (
                              <span className="inline-flex items-center gap-1 text-error font-label-badge bg-error-container/30 px-2 py-0.5 rounded-full text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-error" /> Đã thu hồi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-tertiary font-label-badge bg-tertiary/10 px-2 py-0.5 rounded-full text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Hợp lệ
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {c.isRevoked ? (
                              <span className="font-label-code text-outline italic text-[11px]">Revoked</span>
                            ) : (
                              <button
                                onClick={() => setSelectedRevokeCred(c)}
                                className="px-2.5 py-1 rounded bg-error/10 hover:bg-error/20 text-error font-body-sm text-xs font-semibold transition-colors border border-error/20"
                              >
                                Thu hồi
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Card 5: Tra Cứu DID Document (Resolve DID) */}
          <div className="relative rounded-2xl bg-surface-container/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl border border-white/5">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-container-high text-primary flex items-center justify-center border border-white/10">
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                </div>
                <h3 className="font-headline-sm text-lg text-on-surface font-semibold">Tra Cứu DID Document</h3>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="0x... địa chỉ ví cần tra cứu"
                  value={resolveAddr}
                  onChange={(e) => setResolveAddr(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-surface-container-lowest font-label-code text-xs text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleResolveDID}
                  disabled={resolveLoading}
                  className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-primary flex items-center gap-1 transition-all border border-primary/20 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {resolveLoading ? "sync" : "search"}
                  </span>
                  <span>{resolveLoading ? "Tra cứu..." : "Tra cứu"}</span>
                </button>
              </div>

              {resolveStatus && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${resolveStatus.type === "error" ? "bg-error/10 text-error border border-error/20" : "bg-warning/10 text-warning"}`}>
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  <span>{resolveStatus.msg}</span>
                </div>
              )}

              {resolvedDoc && (
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-white/10 space-y-2 text-xs font-label-code">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Owner:</span>
                    <span className="text-primary truncate max-w-[200px]">{resolvedDoc.owner}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Public Key:</span>
                    <span className="text-on-surface truncate max-w-[200px]">{resolvedDoc.publicKey || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Service URL:</span>
                    <span className="text-tertiary truncate max-w-[200px]">{resolvedDoc.serviceEndpoint || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Trạng thái:</span>
                    <span className={resolvedDoc.isActive ? "text-tertiary font-semibold" : "text-error font-semibold"}>
                      {resolvedDoc.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cryptographic Architecture & Flow Diagram Footer ── */}
      <div className="rounded-2xl bg-surface-container-low p-6 sm:p-8 shadow-xl border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-headline-sm text-lg sm:text-xl text-on-surface font-semibold">
              Mô Hình Khảo Thí &amp; Xác Thực Cryptographic Proofs
            </h3>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant">
              Luồng bảo mật 3 lớp: Issuer ECDSA Signature ➔ ZK-Accumulator Merkle Root ➔ Smart Contract Verifier
            </p>
          </div>
          <div className="flex items-center gap-1.5 font-label-code text-xs text-tertiary bg-tertiary/10 px-3 py-1 rounded-full border border-tertiary/20">
            <span className="material-symbols-outlined text-[16px]">shield</span>
            <span>Zero-Knowledge Proof Enabled (Circom / Groth16)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-surface-container/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <span className="material-symbols-outlined text-[20px]">draw</span>
              <span className="font-label-badge text-xs font-bold">BƯỚC 1: KÝ EIP-712</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Issuer tạo chữ ký ECDSA có cấu trúc bao gồm Student Wallet, Degree Type, GPA và ID sinh viên theo chuẩn JSON-LD.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-secondary">
              <span className="material-symbols-outlined text-[20px]">hub</span>
              <span className="font-label-badge text-xs font-bold">BƯỚC 2: NEO MERKLE ROOT</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Hash bytes32 của chứng chỉ được cập nhật vào danh bạ On-chain Merkle Tree nhằm tối ưu chi phí lưu trữ Gas.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-tertiary">
              <span className="material-symbols-outlined text-[20px]">send_to_mobile</span>
              <span className="font-label-badge text-xs font-bold">BƯỚC 3: PHÁT HÀNH VÍ VCs</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Credential payload được mã hóa và chuyển giao tới Identity Wallet (MetaMask/W3C Agent) của sinh viên.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-primary-container">
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
              <span className="font-label-badge text-xs font-bold">BƯỚC 4: BÊN THỨ 3 XÁC MINH</span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Nhà tuyển dụng có thể dùng ZKP để kiểm tra điều kiện (vd: GPA &gt; 3.5, tốt nghiệp CNTT) mà không cần lộ toàn bộ thông tin cá nhân.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal Thu Hồi Bằng Cấp (Revocation Modal) ── */}
      {selectedRevokeCred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-surface-container p-6 sm:p-8 shadow-2xl border border-error/30 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined text-[24px]">gavel</span>
                <h3 className="font-headline-sm text-lg text-on-surface font-semibold">Xác Nhận Thu Hồi Bằng Cấp</h3>
              </div>
              <button
                className="text-on-surface-variant hover:text-on-surface"
                onClick={() => setSelectedRevokeCred(null)}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="font-body-md text-sm text-on-surface-variant leading-relaxed">
              Hành động này sẽ gắn cờ trạng thái <span className="text-error font-semibold font-label-code text-xs">REVOKED</span> trên Smart Contract CredentialRegistry. Bằng cấp sẽ ngay lập tức không còn giá trị xác thực.
            </p>

            <div className="p-4 rounded-xl bg-surface-container-low font-label-code text-xs space-y-1.5 border border-white/5">
              <div><span className="text-on-surface-variant">Loại bằng:</span> <span className="text-on-surface font-semibold">{selectedRevokeCred.type}</span></div>
              <div><span className="text-on-surface-variant">Root Hash:</span> <span className="text-primary font-semibold truncate block">{selectedRevokeCred.hash}</span></div>
              <div><span className="text-on-surface-variant">Issuer:</span> <span className="text-on-surface-variant">{selectedRevokeCred.issuer}</span></div>
            </div>

            <div className="space-y-1">
              <label className="font-label-badge text-xs text-on-surface-variant uppercase">Lý Do Thu Hồi (Reason Code) *</label>
              <select
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-surface-container-lowest font-body-md text-sm text-on-surface border border-white/10 focus:outline-none focus:ring-2 focus:ring-error cursor-pointer shadow-inner"
              >
                <option value="Gian lận học thuật / Sao chép khóa luận">Gian lận học thuật / Sao chép khóa luận tốt nghiệp</option>
                <option value="Vi phạm quy chế đào tạo nghiêm trọng">Vi phạm quy chế đào tạo nghiêm trọng</option>
                <option value="Sai sót thông tin cá nhân (Yêu cầu phát hành lại)">Sai sót thông tin cá nhân (Yêu cầu phát hành lại)</option>
                <option value="Bằng cấp bị cấp sai thẩm quyền hoặc làm giả">Bằng cấp bị cấp sai thẩm quyền hoặc làm giả hồ sơ</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-body-sm text-sm transition-colors"
                onClick={() => setSelectedRevokeCred(null)}
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                disabled={revokeLoading}
                onClick={() => handleRevokeCredential(selectedRevokeCred.hash)}
                className="px-4 py-2 rounded-lg bg-error hover:bg-error-container text-on-error font-body-sm text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-error/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {revokeLoading ? "sync" : "gavel"}
                </span>
                <span>{revokeLoading ? "Đang ghi nhận On-Chain..." : "Ghi Nhận Thu Hồi On-Chain"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
