import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import QRCodeLib from "qrcode";
import { getSigner, getProvider, shortAddr, formatTimestamp } from "../utils/web3";
import {
  CONTRACT_ADDRESSES,
  CREDENTIAL_REGISTRY_ABI,
  DID_REGISTRY_ABI,
} from "../utils/contracts";
import { createSelectivePresentation } from "../utils/selectiveDisclosure";

const VP_HISTORY_KEY = (addr) => `vp_history_${addr.toLowerCase()}`;

export default function HolderPage({ account }) {
  const [didDoc, setDidDoc] = useState(null);
  const [didLoading, setDidLoading] = useState(false);
  const [didRegLoading, setDidRegLoading] = useState(false);
  const [didStatus, setDidStatus] = useState(null);

  const [myCredentials, setMyCredentials] = useState([]);
  const [vcLoading, setVcLoading] = useState(false);
  const [selectedCred, setSelectedCred] = useState(null);

  // Selective Disclosure State
  const [disclosureOptions, setDisclosureOptions] = useState({
    studentName: true,
    studentId: true,
    major: true,
    classification: true,
    degreeType: true,
    graduationYear: true,
    gpa: false,
    dateOfBirth: false,
    nationalId: false,
  });

  const [ttlMinutes, setTtlMinutes] = useState("15");
  const [audienceTarget, setAudienceTarget] = useState("PUBLIC_VERIFIER");

  const [vpPayload, setVpPayload] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [vpLoading, setVpLoading] = useState(false);

  // History & Import
  const [shareHistory, setShareHistory] = useState([]);
  const [importStatus, setImportStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (account) {
      loadHolderInfo();
      loadMyCredentials();
      loadShareHistory();

      // Lắng nghe sự kiện thu hồi văn bằng (CredentialRevoked) trực tiếp từ Blockchain
      let credContract;
      try {
        const provider = getProvider();
        credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider);
        const onRevoked = (revokedHash) => {
          console.log("Phát hiện văn bằng bị thu hồi trên blockchain:", revokedHash);
          loadMyCredentials();
        };
        credContract.on("CredentialRevoked", onRevoked);
        return () => {
          credContract.off("CredentialRevoked", onRevoked);
        };
      } catch (e) {
        console.warn("Lỗi đăng ký lắng nghe sự kiện thu hồi:", e);
      }
    }
  }, [account]);

  // Tải thông tin DID
  async function loadHolderInfo() {
    setDidLoading(true);
    try {
      const provider = getProvider();
      const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, provider);
      const doc = await didContract.resolveDID(account);
      setDidDoc(doc && doc.isActive && doc.owner !== ethers.ZeroAddress ? doc : null);
    } catch (err) {
      console.error("Lỗi tải DID Holder:", err);
    } finally {
      setDidLoading(false);
    }
  }

  // Đăng ký DID cho Holder nếu chưa có
  async function handleRegisterDID() {
    setDidRegLoading(true);
    setDidStatus(null);
    try {
      const signer = await getSigner();
      const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);
      const pk = `pubkey-${account.slice(2, 10)}`;
      const svc = `https://did.student.portal/${account.slice(2, 10)}`;
      const tx = await didContract.registerDID(pk, svc);
      await tx.wait();
      setDidStatus({ type: "success", msg: "Đăng ký DID cá nhân thành công trên Blockchain!" });
      await loadHolderInfo();
    } catch (err) {
      setDidStatus({ type: "error", msg: "Lỗi đăng ký DID: " + (err?.reason || err?.message || String(err)) });
    } finally {
      setDidRegLoading(false);
    }
  }

  // Tải danh sách bằng cấp của Holder từ Blockchain & LocalStorage
  async function loadMyCredentials() {
    setVcLoading(true);
    try {
      const provider = getProvider();
      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider);
      const hashes = await credContract.getHolderCredentials(account);

      const normalized = account.toLowerCase();
      const localVCs = JSON.parse(localStorage.getItem(`vcs_${normalized}`) || "[]");

      // Hợp nhất danh sách hash từ blockchain và các tệp VC đã nạp cục bộ
      const allHashSet = new Set([
        ...hashes.map((h) => h.toLowerCase()),
        ...localVCs.map((v) => (v.vcHash || v.hash)?.toLowerCase()).filter(Boolean),
      ]);

      const list = [];
      for (const hashLower of allHashSet) {
        const hash = hashes.find(h => h.toLowerCase() === hashLower)
          || localVCs.find(v => (v.vcHash || v.hash)?.toLowerCase() === hashLower)?.vcHash
          || hashLower;
        try {
          const cred = await credContract.getCredential(hash);
          if (cred.issuer === ethers.ZeroAddress) continue;

          const localItem = localVCs.find((v) => (v.vcHash || v.hash)?.toLowerCase() === hash.toLowerCase());
          let vcData = null;
          if (localItem?.vcJson) {
            try {
              vcData = JSON.parse(localItem.vcJson);
            } catch (e) {}
          } else if (localItem?.vc) {
            vcData = localItem.vc;
          }

          // Nếu chưa tìm thấy trong ví cá nhân của Holder, tìm chéo trong các bản ghi cấp phát của Issuer trên máy này
          if (!vcData) {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && (k.startsWith("issuer_issued_vcs_") || k.startsWith("vcs_"))) {
                try {
                  const items = JSON.parse(localStorage.getItem(k) || "[]");
                  if (Array.isArray(items)) {
                    const found = items.find(x => (x.hash || x.vcHash)?.toLowerCase() === hash.toLowerCase());
                    if (found) {
                      vcData = found.vc || (found.vcJson ? JSON.parse(found.vcJson) : null);
                      if (vcData) {
                        // Tự động đồng bộ vào ví của sinh viên này
                        localVCs.push({ vcJson: JSON.stringify(vcData), vcHash: hash, issuedAt: Date.now() });
                        localStorage.setItem(`vcs_${normalized}`, JSON.stringify(localVCs));
                        break;
                      }
                    }
                  }
                } catch (e) {}
              }
            }
          }

          list.push({
            hash,
            issuer: cred.issuer,
            holder: cred.holder,
            type: cred.credentialType,
            issuedAt: Number(cred.issuedAt),
            expiresAt: Number(cred.expiresAt),
            isRevoked: cred.isRevoked,
            vcData,
          });
        } catch (e) {
          console.warn("Lỗi load credential:", hash, e);
        }
      }

      list.sort((a, b) => b.issuedAt - a.issuedAt);
      setMyCredentials(list);
      if (list.length > 0) {
        setSelectedCred((prev) => {
          if (!prev) return list[0];
          const fresh = list.find((c) => c.hash.toLowerCase() === prev.hash.toLowerCase());
          return fresh || list[0];
        });
      }
    } catch (err) {
      console.error("Lỗi tải danh sách bằng Holder:", err);
    } finally {
      setVcLoading(false);
    }
  }

  // Nhập file VC JSON từ máy tính (nếu nhận qua email/USB)
  function handleImportVcFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        const vcHash = parsed.credentialHash || parsed.id;
        if (!vcHash) {
          throw new Error("File JSON không chứa mã băm credentialHash hợp lệ.");
        }

        const normalized = account.toLowerCase();
        const existing = JSON.parse(localStorage.getItem(`vcs_${normalized}`) || "[]");
        const idx = existing.findIndex((v) => v.vcHash?.toLowerCase() === vcHash.toLowerCase());
        if (idx >= 0) {
          existing[idx] = { vcJson: JSON.stringify(parsed), vcHash, issuedAt: Date.now() };
        } else {
          existing.push({ vcJson: JSON.stringify(parsed), vcHash, issuedAt: Date.now() });
        }
        localStorage.setItem(`vcs_${normalized}`, JSON.stringify(existing));

        setImportStatus({ type: "success", msg: "Đã nạp file VC vào ví thành công!" });
        loadMyCredentials();
      } catch (err) {
        setImportStatus({ type: "error", msg: "Lỗi đọc file VC: " + err.message });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // Chọn preset minh bạch
  function handleApplyPreset(type) {
    if (type === "all") {
      setDisclosureOptions({
        studentName: true,
        studentId: true,
        major: true,
        classification: true,
        degreeType: true,
        graduationYear: true,
        gpa: true,
        dateOfBirth: true,
        nationalId: true,
      });
    } else if (type === "job") {
      setDisclosureOptions({
        studentName: true,
        studentId: true,
        major: true,
        classification: true,
        degreeType: true,
        graduationYear: true,
        gpa: false, // Ẩn GPA
        dateOfBirth: false, // Ẩn ngày sinh
        nationalId: false, // Ẩn CCCD
      });
    } else if (type === "minimal") {
      setDisclosureOptions({
        studentName: true,
        studentId: false,
        major: true,
        classification: false,
        degreeType: true,
        graduationYear: false,
        gpa: false,
        dateOfBirth: false,
        nationalId: false,
      });
    }
  }

  function handleDisclosureChange(field) {
    setDisclosureOptions((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  // Tạo Verifiable Presentation (VP) có chữ ký mật mã chuẩn
  async function handleGenerateVP() {
    if (!selectedCred) return alert("Vui lòng chọn một văn bằng.");

    setVpLoading(true);
    setVpPayload(null);
    setQrDataUrl(null);

    try {
      // 1. KIỂM TRA TRẠNG THÁI ON-CHAIN TỨC THÌ TRỰC TIẾP TRÊN SMART CONTRACT
      const provider = getProvider();
      const credContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        provider
      );
      
      const onchain = await credContract.getCredential(selectedCred.hash);
      
      if (!onchain || onchain.issuer === ethers.ZeroAddress) {
        setVpLoading(false);
        return alert("⚠️ Lỗi bảo mật: Văn bằng này không tồn tại trên Smart Contract!");
      }

      if (onchain.isRevoked) {
        // Cập nhật ngay lập tức vào state của Holder để UI hiển thị badge ĐÃ THU HỒI
        setSelectedCred(prev => prev ? ({ ...prev, isRevoked: true }) : prev);
        setMyCredentials(prev => prev.map(c => c.hash.toLowerCase() === selectedCred.hash.toLowerCase() ? { ...c, isRevoked: true } : c));
        setVpLoading(false);
        return alert("⛔ TỪ CHỐI TẠO MÃ TRÌNH KÝ:\n\nVăn bằng này đã bị Trường học / Cơ sở đào tạo THU HỒI (REVOKED) trên Blockchain!\nHiệu lực pháp lý của văn bằng đã chấm dứt hoàn toàn. Hệ thống ngăn chặn sinh viên tạo mã xác thực VP!");
      }

      if (onchain.expiresAt && Number(onchain.expiresAt) > 0 && Math.floor(Date.now() / 1000) > Number(onchain.expiresAt)) {
        setVpLoading(false);
        return alert("⛔ TỪ CHỐI TẠO MÃ TRÌNH KÝ: Văn bằng này đã HẾT HẠN HIỆU LỰC trên Blockchain!");
      }

      const signer = await getSigner();

      // Lấy thông tin credential mới nhất
      const currentCred = myCredentials.find(c => c.hash.toLowerCase() === selectedCred.hash.toLowerCase()) || selectedCred;
      let targetVc = currentCred.vcData;
      while (typeof targetVc === "string") {
        try { targetVc = JSON.parse(targetVc); } catch (e) { break; }
      }
      if (targetVc?.vc) targetVc = targetVc.vc;

      const saltedClaims = targetVc?.credentialSubject?.saltedClaims
        || targetVc?.saltedClaims
        || null;

      const now = Date.now();
      const ttl = Number(ttlMinutes) || 15;
      const expirationTimestamp = now + ttl * 60 * 1000;
      const audience = audienceTarget.trim() || "PUBLIC_VERIFIER";

      let fullVp;
      let qrPayload;

      if (saltedClaims && Object.keys(saltedClaims).length > 0) {
        // ── TRƯỜNG HỢP 1: CÓ MUỐI MẬT MÃ (ZKP MERKLE SELECTIVE DISCLOSURE) ──
        const availableKeys = Object.keys(saltedClaims);
        const disclosedKeys = availableKeys.filter((k) => disclosureOptions[k]);

        const vcForPres = targetVc.credentialSubject?.saltedClaims
          ? targetVc
          : { ...targetVc, credentialSubject: { id: `did:ethr:${account}`, saltedClaims } };

        const {
          presentationPayload: rawPayload,
          presentedClaims,
          blindedHashes,
          allKeys,
          nonce,
        } = createSelectivePresentation(vcForPres, disclosedKeys, {
          expiresInMinutes: ttl,
          audience,
        });

        // Gắn trực tiếp claims và blinded hashes vào presentationPayload được ký số
        const presentationPayload = {
          ...rawPayload,
          type: "SelectiveDisclosurePresentation",
          presentedClaims,
          blindedHashes,
          allKeys,
        };

        const messageToSign = JSON.stringify(presentationPayload);
        const signature = await signer.signMessage(messageToSign);

        fullVp = {
          holderAddress: account,
          vcHash: currentCred.hash,
          signature,
          presentationPayload,
          presentedClaims,
          blindedHashes,
          allKeys,
          expirationTimestamp,
          nonce,
          audience,
        };

        qrPayload = {
          selective: true,
          holder: account,
          vcHash: currentCred.hash,
          sig: signature,
          p: messageToSign,
        };
      } else {
        // ── TRƯỜNG HỢP 2: VĂN BẰNG ON-CHAIN CHUẨN W3C (STANDARD VP) ──
        const rawClaims = targetVc?.credentialSubject || {};
        const cleanClaims = {};
        for (const [k, v] of Object.entries(rawClaims)) {
          if (k === 'saltedClaims') continue;
          if (typeof v === 'object' && v !== null) {
            cleanClaims[k] = v.value || v.type || v.name || v.title || JSON.stringify(v);
          } else {
            cleanClaims[k] = String(v ?? "");
          }
        }
        if (Object.keys(cleanClaims).length === 0) {
          cleanClaims.degreeType = currentCred.type || "UniversityDegree";
          cleanClaims.issuer = currentCred.issuer;
        }

        const nonce = ethers.hexlify(ethers.randomBytes(16));
        const presentationPayload = {
          holder: account,
          vcHash: currentCred.hash,
          type: "StandardVerifiablePresentation",
          degreeType: currentCred.type || "UniversityDegree",
          issuer: currentCred.issuer,
          timestamp: now,
          expiresAt: expirationTimestamp,
          nonce,
          audience,
          claims: cleanClaims,
        };

        const messageToSign = JSON.stringify(presentationPayload);
        const signature = await signer.signMessage(messageToSign);

        fullVp = {
          holderAddress: account,
          vcHash: currentCred.hash,
          signature,
          presentationPayload,
          isStandardVp: true,
          presentedClaims: cleanClaims,
          blindedHashes: {},
          allKeys: [],
          expirationTimestamp,
          nonce,
          audience,
        };

        qrPayload = {
          standard: true,
          holder: account,
          vcHash: currentCred.hash,
          sig: signature,
          p: messageToSign,
        };
      }

      const vpPayloadString = JSON.stringify(fullVp, null, 2);
      setVpPayload(vpPayloadString);

      try {
        const qrString = JSON.stringify(qrPayload);
        const dataUrl = await QRCodeLib.toDataURL(qrString, {
          errorCorrectionLevel: "L",
          width: 480,
          margin: 4,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrDataUrl(dataUrl);
      } catch (qrErr) {
        console.warn("QR code generation fallback:", qrErr);
        try {
          const minimalQr = {
            selective: true,
            holder: account,
            vcHash: selectedCred.hash,
            sig: signature,
            p: messageToSign,
          };
          const dataUrl = await QRCodeLib.toDataURL(JSON.stringify(minimalQr), {
            errorCorrectionLevel: "L",
            width: 480,
            margin: 4,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
          setQrDataUrl(dataUrl);
        } catch (fallbackErr) {
          console.error("QR Code error:", fallbackErr);
        }
      }

      // Lưu lịch sử trình ký
      saveShareHistory(selectedCred.hash, selectedCred.type, audience);

    } catch (err) {
      console.error("Lỗi tạo VP:", err);
      alert("Lỗi tạo mã xuất trình VP: " + (err.reason || err.message));
    } finally {
      setVpLoading(false);
    }
  }

  function loadShareHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(VP_HISTORY_KEY(account)) || "[]");
      setShareHistory(h);
    } catch (e) {}
  }

  function saveShareHistory(vcHash, credType, aud) {
    try {
      const h = JSON.parse(localStorage.getItem(VP_HISTORY_KEY(account)) || "[]");
      h.unshift({ timestamp: Date.now(), vcHash, credType, audience: aud });
      if (h.length > 15) h.pop();
      localStorage.setItem(VP_HISTORY_KEY(account), JSON.stringify(h));
      setShareHistory(h);
    } catch (e) {}
  }

  // Tải ảnh QR Code về máy
  function downloadQrPng() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `VP_QR_${selectedCred?.hash?.slice(0, 8) || "credential"}.png`;
    a.click();
  }

  // Tải file Verifiable Presentation (VP) JSON
  function downloadVpJson() {
    if (!vpPayload) return;
    const blob = new Blob([vpPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VP_${selectedCred?.hash?.slice(0, 8) || "presentation"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Xuất file VC (.json) gốc
  function handleExportVcJson(cred) {
    const target = cred || selectedCred;
    if (!target || !target.vcData) {
      alert("Không tìm thấy tệp VC gốc trong bộ nhớ cục bộ để xuất.");
      return;
    }
    const blob = new Blob([JSON.stringify(target.vcData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VC_${target.type || "Degree"}_${target.hash.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeVcs = myCredentials.filter((c) => !c.isRevoked);

  return (
    <div className="w-full px-4 lg:px-8 py-6 flex flex-col gap-6">
      
      {/* Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-lg border border-border-ui shadow-sm text-xs">
        <div className="flex items-center gap-2 text-text-sub">
          <span>Hồ sơ sinh viên</span>
          <span>/</span>
          <span className="text-primary font-semibold">Ví Văn Bằng & Danh Tính Số (Holder Wallet)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> EIP-712 & Merkle Claims Verified
          </span>
        </div>
      </div>

      {/* DID Notification if not registered */}
      {!didDoc && !didLoading && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[24px] shrink-0 mt-0.5">warning</span>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Bạn chưa đăng ký Danh tính số (DID) trên Blockchain</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Đăng ký DID để liên kết khóa công khai với hồ sơ văn bằng và tạo chữ ký xác thực cryptographic cho nhà tuyển dụng.
              </p>
            </div>
          </div>
          <button
            onClick={handleRegisterDID}
            disabled={didRegLoading}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 flex items-center gap-1.5 shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">{didRegLoading ? "sync" : "badge"}</span>
            <span>{didRegLoading ? "Đang đăng ký on-chain..." : "Đăng Ký DID Cá Nhân"}</span>
          </button>
        </div>
      )}

      {didStatus && (
        <div className={`p-3 rounded-lg text-xs border ${didStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {didStatus.msg}
        </div>
      )}

      {/* Student Profile Card */}
      <section className="bg-white rounded-xl border border-border-ui shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border-ui flex items-center justify-between bg-surface-subtle">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">account_box</span>
            <h2 className="text-[15px] font-bold text-text-main tracking-tight">Hồ Sơ Chủ Sở Hữu (Holder Profile)</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportVcFile}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 rounded bg-white hover:bg-blue-50 border border-border-ui text-primary text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              title="Nhập file JSON văn bằng đã nhận từ trường"
            >
              <span className="material-symbols-outlined text-[15px]">upload_file</span>
              <span>Nhập File VC (.json)</span>
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${didDoc ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {didDoc ? "DID ACTIVE" : "DID CHƯA ĐĂNG KÝ"}
            </span>
          </div>
        </div>
        
        <div className="p-5 flex flex-col lg:flex-row items-center lg:items-start gap-6">
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-border-ui shadow-sm bg-blue-50 flex flex-col items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[54px]">school</span>
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-xs w-full">
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">Địa chỉ ví:</span>
              <span className="font-bold text-text-main font-mono truncate max-w-[150px]" title={account}>{shortAddr(account, 8)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">Mạng Smart Contract:</span>
              <span className="font-bold text-emerald-600 font-mono">Ganache 1337</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">Bằng hoạt động:</span>
              <span className="font-bold text-emerald-700">{activeVcs.length} bằng cấp</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">Bằng đã thu hồi:</span>
              <span className="font-bold text-red-600">{myCredentials.filter(c => c.isRevoked).length}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">DID Document:</span>
              <span className="font-mono text-primary truncate max-w-[150px]">{didDoc ? didDoc.did : `did:ethr:${shortAddr(account, 6)}`}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-text-muted w-24 shrink-0">Cơ chế ZKP:</span>
              <span className="font-medium text-text-main">Salted Merkle Commitments</span>
            </div>
          </div>

          <div className="w-full lg:w-48 bg-slate-50 p-3 rounded-lg border border-border-ui flex flex-col justify-center text-center shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1">Mã Định Danh DID</div>
            <div className="font-mono text-[11px] text-primary truncate font-semibold bg-white p-1.5 rounded border border-border-ui mb-2" title={`did:ethr:${account}`}>
              did:ethr:{shortAddr(account, 6)}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[14px]">verified</span> Hợp lệ trên chuỗi khối
            </div>
          </div>
        </div>

        {importStatus && (
          <div className={`mx-5 mb-4 p-2.5 rounded text-xs border ${importStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
            {importStatus.msg}
          </div>
        )}
      </section>

      {/* Credentials Gallery & Selective Disclosure */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">workspace_premium</span>
            <h2 className="text-[16px] font-bold text-text-main tracking-tight">Văn Bằng & Chứng Chỉ Đã Ký Số (Verifiable Credentials)</h2>
          </div>
          <span className="text-xs bg-white text-text-muted px-3 py-1 rounded-full border border-border-ui font-medium shadow-sm">
            {myCredentials.length} Bằng cấp liên kết ví
          </span>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          
          {/* List of credentials (5/12) */}
          <div className="lg:col-span-5 flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-1">
            {vcLoading ? (
              <div className="text-center py-12 text-text-muted text-xs bg-white rounded-xl border border-border-ui">
                Đang nạp danh sách bằng cấp từ Blockchain...
              </div>
            ) : myCredentials.length === 0 ? (
              <div className="text-center py-12 text-text-muted text-sm border-2 border-dashed border-border-ui rounded-xl bg-white flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-slate-300">school</span>
                <span>Bạn chưa có bằng cấp nào trên ví này.</span>
                <span className="text-xs text-text-sub">Hãy yêu cầu Issuer cấp phát hoặc nhấn "Nhập File VC" ở trên!</span>
              </div>
            ) : (
              myCredentials.map((cred, idx) => {
                const isSelected = selectedCred && selectedCred.hash === cred.hash;
                return (
                  <div 
                    key={cred.hash || idx} 
                    onClick={() => { setSelectedCred(cred); setVpPayload(null); setQrDataUrl(null); }}
                    className={`rounded-xl border-2 p-4 flex flex-col gap-2 transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-white border-primary shadow-md ring-2 ring-primary/10' 
                        : cred.isRevoked 
                        ? 'bg-red-50/40 border-red-200 opacity-80' 
                        : 'bg-white border-border-ui hover:border-primary-light'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider font-mono">
                          {cred.type || "BẰNG TỐT NGHIỆP"}
                        </span>
                        {cred.isRevoked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> REVOKED (THU HỒI)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ACTIVE
                          </span>
                        )}
                        {cred.vcData ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold" title="Đã có đủ dữ liệu muối mật mã để tạo mã trình ký ZKP">
                            <span className="material-symbols-outlined text-[12px]">verified</span> ZKP READY
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-bold" title="Văn bằng on-chain nhưng cần nạp file JSON gốc để tạo ZKP">
                            <span className="material-symbols-outlined text-[12px]">info</span> CẦN TỆP VC
                          </span>
                        )}
                      </div>
                      <div className="w-7 h-7 rounded bg-blue-50 text-primary flex items-center justify-center border border-blue-200 shrink-0">
                        <span className="material-symbols-outlined text-[16px]">school</span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-text-sub">
                      Đơn vị cấp: <span className="font-mono text-primary font-semibold" title={cred.issuer}>{shortAddr(cred.issuer, 8)}</span>
                    </div>

                    <div className="flex items-center justify-between font-mono text-[10px] text-text-muted pt-1 border-t border-slate-100">
                      <span>Hash: {shortAddr(cred.hash, 8)}</span>
                      <div className="flex items-center gap-2">
                        {cred.vcData && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleExportVcJson(cred); }}
                            className="text-primary hover:underline flex items-center gap-0.5"
                            title="Tải tệp JSON của văn bằng này"
                          >
                            <span className="material-symbols-outlined text-[12px]">download</span>
                            Tải JSON
                          </button>
                        )}
                        <span>{formatTimestamp(cred.issuedAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Share History Mini Box */}
            {shareHistory.length > 0 && (
              <div className="p-3 bg-white rounded-xl border border-border-ui shadow-xs flex flex-col gap-2 mt-2">
                <span className="text-xs font-bold text-text-main flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">history</span>
                  Lịch Sử Tạo Mã Trình Ký (VP)
                </span>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {shareHistory.slice(0, 5).map((h, i) => (
                    <div key={i} className="text-[11px] text-text-muted flex items-center justify-between p-1.5 rounded bg-slate-50">
                      <span className="font-medium text-text-main truncate max-w-[140px]">{h.audience || "PUBLIC_VERIFIER"}</span>
                      <span className="font-mono text-[10px]">{formatTimestamp(h.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* VP Generation Panel (7/12) */}
          <div className="lg:col-span-7">
            {selectedCred ? (
              <div className="bg-white rounded-xl border border-border-ui shadow-sm overflow-hidden flex flex-col h-full">
                
                {/* Panel Header */}
                <div className="px-5 py-4 border-b border-border-ui bg-surface-subtle flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                    <h3 className="text-[15px] font-bold text-text-main">Cấu Hình Minh Bạch Có Chọn Lọc (Selective Disclosure)</h3>
                  </div>
                  {selectedCred.isRevoked && (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold">
                      ⛔ BẰNG ĐÃ BỊ THU HỒI
                    </span>
                  )}
                </div>
                
                <div className="p-5 flex flex-col gap-5 flex-1">
                  
                  {/* Warning if revoked */}
                  {selectedCred.isRevoked ? (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed flex items-start gap-2.5">
                      <span className="material-symbols-outlined text-red-600 text-[20px] shrink-0">block</span>
                      <p>
                        Văn bằng này đã bị Trường học / Cơ sở đào tạo thu hồi on-chain trên Smart Contract. Theo quy định bảo mật W3C, sinh viên không thể tạo mã trình ký Verifiable Presentation từ văn bằng đã bị vô hiệu.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Notice if VC data is missing */}
                      {!selectedCred.vcData && (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 shadow-xs">
                          <span className="material-symbols-outlined text-amber-600 text-[20px] shrink-0 mt-0.5">info</span>
                          <div className="flex-1">
                            <div className="font-bold">Trình duyệt này chưa có Tệp Dữ Liệu Mật Mã gốc (VC JSON)</div>
                            <p className="mt-1 text-amber-800 text-[11px] leading-relaxed">
                              Văn bằng tồn tại trên Blockchain nhưng chưa có bộ muối mật mã ngẫu nhiên (Salted Claims) sinh ra tại thời điểm cấp bằng. Để có thể tạo mã trình ký VP chuẩn ZKP:
                            </p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[13px]">file_upload</span>
                                Nhập Tệp VC (.json) Đã Tải Về
                              </button>
                              <span className="text-[11px] text-amber-700">hoặc sang menu <b>Quản lý Cấp Bằng</b> để cấp phát mới cho ví này</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Presets Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-border-ui text-xs">
                        <span className="font-semibold text-text-sub">Cấu hình nhanh:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApplyPreset("all")}
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-border-ui text-text-main font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            🎯 Mở tất cả
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyPreset("job")}
                            className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            💼 Xin việc (Ẩn GPA & CCCD)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyPreset("minimal")}
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-border-ui text-text-main font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            🛡️ Tối thiểu
                          </button>
                        </div>
                      </div>

                      {/* Claims Checkbox Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[
                          { key: "studentName", label: "Họ và tên sinh viên" },
                          { key: "studentId", label: "Mã số sinh viên (MSSV)" },
                          { key: "major", label: "Ngành đào tạo" },
                          { key: "degreeType", label: "Loại văn bằng" },
                          { key: "graduationYear", label: "Năm tốt nghiệp" },
                          { key: "classification", label: "Xếp loại tốt nghiệp" },
                          { key: "gpa", label: "Điểm trung bình (GPA)" },
                          { key: "dateOfBirth", label: "Ngày sinh" },
                          { key: "nationalId", label: "Số CCCD / Định danh" },
                        ].map((field) => (
                          <div 
                            key={field.key} 
                            onClick={() => handleDisclosureChange(field.key)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                              disclosureOptions[field.key]
                                ? "bg-emerald-50/50 border-emerald-300"
                                : "bg-surface-subtle border-border-ui opacity-75"
                            }`}
                          >
                            <span className="text-xs font-medium text-text-main">{field.label}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                              disclosureOptions[field.key]
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-600"
                            }`}>
                              <span className="material-symbols-outlined text-[12px]">
                                {disclosureOptions[field.key] ? "visibility" : "lock"}
                              </span>
                              {disclosureOptions[field.key] ? "CÔNG KHAI" : "ẨN (ZKP)"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* TTL & Audience Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border-ui text-xs">
                        <div className="flex flex-col gap-1">
                          <label className="font-bold text-text-sub uppercase text-[10px] tracking-wider">Thời hạn mã VP (Chống phát lại)</label>
                          <select
                            value={ttlMinutes}
                            onChange={(e) => setTtlMinutes(e.target.value)}
                            className="bg-surface-subtle border border-border-ui text-text-main text-xs rounded-lg px-3 py-1.5 focus:bg-white focus:outline-none focus:border-primary-light cursor-pointer"
                          >
                            <option value="5">5 phút (Nghiêm ngặt)</option>
                            <option value="15">15 phút (Khuyến nghị)</option>
                            <option value="60">1 giờ</option>
                            <option value="1440">24 giờ (1 ngày)</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-bold text-text-sub uppercase text-[10px] tracking-wider">Đơn vị nhận (Audience)</label>
                          <input
                            value={audienceTarget}
                            onChange={(e) => setAudienceTarget(e.target.value)}
                            placeholder="VD: CÔNG TY ABC"
                            className="bg-surface-subtle border border-border-ui text-text-main text-xs rounded-lg px-3 py-1.5 focus:bg-white focus:outline-none focus:border-primary-light"
                          />
                        </div>
                      </div>

                      {/* Generate Action Button */}
                      <button 
                        onClick={handleGenerateVP}
                        disabled={vpLoading}
                        className="w-full py-3 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-sm flex items-center justify-center gap-2 shadow hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[20px]">{vpLoading ? "sync" : "fingerprint"}</span>
                        <span>{vpLoading ? "Đang Ký Mật Mã Bằng MetaMask..." : "Ký Số & Tạo Mã Xuất Trình (Generate VP)"}</span>
                      </button>

                      {/* Display QR & JSON when generated */}
                      {qrDataUrl && (
                        <div className="p-4 rounded-xl bg-slate-50 border border-border-ui flex flex-col md:flex-row items-center gap-6 mt-2">
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <div className="w-48 h-48 bg-white border border-border-ui rounded-xl flex items-center justify-center p-2 shadow-sm">
                              <img src={qrDataUrl} alt="VP QR Code" className="w-full h-full object-contain" />
                            </div>
                            <button
                              type="button"
                              onClick={downloadQrPng}
                              className="px-3 py-1.5 rounded-md bg-white border border-border-ui hover:bg-slate-100 text-primary font-semibold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">download</span>
                              Tải Ảnh QR (.png)
                            </button>
                          </div>

                          <div className="flex-1 flex flex-col gap-2 w-full">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-text-main">Mã JSON Verifiable Presentation:</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={downloadVpJson}
                                  className="px-2.5 py-1 rounded bg-white border border-border-ui text-text-main text-[11px] font-semibold flex items-center gap-1 shadow-xs hover:bg-slate-50 transition-colors cursor-pointer"
                                  title="Tải tệp VP JSON về máy"
                                >
                                  <span className="material-symbols-outlined text-[14px]">download</span>
                                  Tải File VP (.json)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(vpPayload);
                                    alert("Đã sao chép toàn bộ JSON-LD của VP vào clipboard!");
                                  }}
                                  className="px-2.5 py-1 rounded bg-primary text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs hover:bg-primary-dark transition-colors cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                  Sao Chép JSON
                                </button>
                              </div>
                            </div>
                            <textarea
                              readOnly
                              value={vpPayload || ""}
                              rows={7}
                              placeholder="Chuỗi JSON Verifiable Presentation sẽ hiển thị tại đây sau khi ký số..."
                              className="w-full bg-slate-900 text-emerald-400 border border-slate-700 rounded-lg p-3 text-[11px] font-mono focus:outline-none resize-none select-all leading-relaxed shadow-inner"
                            />
                            <span className="text-[11px] text-text-muted">
                              Mẹo: Bạn có thể đưa mã QR cho Nhà tuyển dụng quét, hoặc sao chép đoạn JSON trên dán vào trang <strong>Tra Cứu Văn Bằng</strong>.
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border-ui rounded-xl p-12 bg-white text-text-muted">
                <span className="material-symbols-outlined text-[48px] text-slate-300 mb-2">touch_app</span>
                <p className="text-sm text-center font-medium text-text-main">Chưa chọn bằng cấp nào</p>
                <p className="text-xs text-center text-text-muted mt-1">Chọn một văn bằng ở danh sách bên trái để cấu hình xuất trình (Selective Disclosure) và tạo mã QR.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
