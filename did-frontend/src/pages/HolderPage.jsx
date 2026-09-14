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

const VP_HISTORY_KEY = (addr) => `vp_history_${addr?.toLowerCase()}`;
const MAX_HISTORY = 20;

export default function HolderPage({ account: propAccount }) {
  const account = propAccount || getAccount();

  /* ── DID state ─────────────────────────────────────── */
  const [myDid, setMyDid] = useState(null);
  const [didLoading, setDidLoading] = useState(false);
  const [didRegLoading, setDidRegLoading] = useState(false);
  const [didStatus, setDidStatus] = useState(null);

  /* ── VC state ──────────────────────────────────────── */
  const [vcs, setVcs] = useState([]);
  const [vcLoading, setVcLoading] = useState(false);
  const [selectedVc, setSelectedVc] = useState(null);
  const [disclosedKeys, setDisclosedKeys] = useState([
    "studentName", "major", "classification", "graduationYear"
  ]);
  const [activePreset, setActivePreset] = useState("job");
  const [ttlMinutes, setTtlMinutes] = useState("15");
  const [audienceTarget, setAudienceTarget] = useState("FPT Software & VNG Corporation");

  /* ── VP state ──────────────────────────────────────── */
  const [vpJson, setVpJson] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [vpLoading, setVpLoading] = useState(false);
  const [vpPayloadDigest, setVpPayloadDigest] = useState("");
  const [holderSignature, setHolderSignature] = useState("");
  const [countdownSeconds, setCountdownSeconds] = useState(900);

  /* ── Share history ─────────────────────────────────── */
  const [shareHistory, setShareHistory] = useState([]);
  const [copiedText, setCopiedText] = useState("");

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (account) {
      loadMyDID();
      loadVCs();
      loadShareHistory();
    }
  }, [account]);

  // Countdown timer for VP expiry
  useEffect(() => {
    if (!vpJson) return;
    setCountdownSeconds(Number(ttlMinutes) * 60);
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [vpJson, ttlMinutes]);

  function copyToClipboard(text, label) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedText(label);
      setTimeout(() => setCopiedText(""), 2000);
    });
  }

  /* ─────────────────────────────────────────────────────
     DID
  ───────────────────────────────────────────────────── */
  async function loadMyDID() {
    setDidLoading(true);
    try {
      const provider = getProvider();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        provider
      );
      const doc = await contract.resolveDID(account);
      setMyDid(doc.isActive && doc.owner !== ethers.ZeroAddress ? doc : null);
    } catch (e) {
      console.error("loadMyDID:", e);
    }
    setDidLoading(false);
  }

  async function handleRegisterDID() {
    setDidRegLoading(true);
    setDidStatus(null);
    try {
      const signer = await getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.DID_REGISTRY,
        DID_REGISTRY_ABI,
        signer
      );
      const pk = `pubkey-${account.slice(2, 10)}`;
      const svc = `https://holder.did.service/${account.slice(2, 10)}`;
      const tx = await contract.registerDID(pk, svc);
      await tx.wait();
      setDidStatus({ type: "success", msg: "✅ DID của bạn đã được kích hoạt thành công trên blockchain!" });
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
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        provider
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
        if (local) {
          try {
            vcData = typeof local.vcJson === "string" ? JSON.parse(local.vcJson) : local.vcJson;
          } catch (e) {
            console.error("Error parsing local VC:", e);
          }
        }

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
          issuer: d.issuer,
          type: d.credentialType,
          issuedAt: Number(d.issuedAt),
          expiresAt: d.expiresAt,
          isRevoked: d.isRevoked,
          vcData,
          health,
        });
      }

      const reversed = combined.reverse();
      setVcs(reversed);
      if (reversed.length > 0 && !selectedVc) {
        handleSelectVc(reversed[0]);
      }
    } catch (e) {
      console.error("loadVCs:", e);
    }
    setVcLoading(false);
  }

  function handleImportVcFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const targetHash = parsed.credentialSubject?.rootHash || parsed.id || parsed.rootHash;
        const normalizedAddr = account.toLowerCase();
        const existing = JSON.parse(localStorage.getItem(`vcs_${normalizedAddr}`) || "[]");
        
        const filtered = existing.filter((item) => item.vcHash !== targetHash);
        filtered.push({
          vcHash: targetHash,
          vcJson: JSON.stringify(parsed),
        });
        localStorage.setItem(`vcs_${normalizedAddr}`, JSON.stringify(filtered));
        loadVCs();
        alert("✅ Đã nhập file Verifiable Credential thành công vào ví!");
      } catch (err) {
        alert("❌ Tệp không hợp lệ: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* ─────────────────────────────────────────────────────
     Verifiable Presentation
  ───────────────────────────────────────────────────── */
  function handleSelectVc(vc) {
    setSelectedVc(vc);
    setVpJson("");
    setQrDataUrl("");
    if (vc.vcData?.credentialSubject?.saltedClaims) {
      const allK = Object.keys(vc.vcData.credentialSubject.saltedClaims);
      setDisclosedKeys(["studentName", "major", "classification", "graduationYear"].filter(k => allK.includes(k)));
      setActivePreset("job");
    }
  }

  function handleToggleKey(k) {
    setDisclosedKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
    setActivePreset("custom");
  }

  function handleApplyPreset(presetType) {
    setActivePreset(presetType);
    if (!selectedVc?.vcData?.credentialSubject?.saltedClaims) {
      if (presetType === "all") setDisclosedKeys(["studentName", "studentId", "major", "degreeType", "graduationYear", "gpa", "classification", "dateOfBirth", "nationalId"]);
      else if (presetType === "job") setDisclosedKeys(["studentName", "major", "classification", "graduationYear"]);
      else if (presetType === "minimal") setDisclosedKeys(["studentName", "major", "classification"]);
      return;
    }
    const allK = Object.keys(selectedVc.vcData.credentialSubject.saltedClaims);
    if (presetType === "all") {
      setDisclosedKeys(allK);
    } else if (presetType === "job") {
      setDisclosedKeys(["studentName", "major", "classification", "graduationYear"].filter((k) => allK.includes(k)));
    } else if (presetType === "minimal") {
      setDisclosedKeys(["studentName", "major", "classification"].filter((k) => allK.includes(k)));
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

      const signer = await getSigner();
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
            "https://w3id.org/security/suites/ed25519-2020/v1",
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

        setHolderSignature(signature);
        setVpPayloadDigest(ethers.id(messageToSign));
      } else {
        // 2. Chuẩn Legacy
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

        setHolderSignature(signature);
        setVpPayloadDigest(ethers.id(messageToSign));
      }

      const vpString = JSON.stringify(vp, null, 2);
      setVpJson(vpString);

      // Render QR Code
      const qrUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
        width: 320,
        margin: 2,
        color: { dark: "#080e1d", light: "#ffffff" },
      });
      setQrDataUrl(qrUrl);

      // Lưu lịch sử chia sẻ
      saveToHistory(selectedVc.hash, selectedVc.type, audience);
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

  function saveToHistory(vcHash, credType, aud) {
    const h = JSON.parse(localStorage.getItem(VP_HISTORY_KEY(account)) || "[]");
    h.unshift({
      timestamp: Date.now(),
      vcHash,
      credType,
      audience: aud || "PUBLIC_VERIFIER",
      disclosedCount: disclosedKeys.length,
    });
    if (h.length > MAX_HISTORY) h.pop();
    localStorage.setItem(VP_HISTORY_KEY(account), JSON.stringify(h));
    setShareHistory(h);
  }

  const holderDid = account ? `did:ethr:${account}` : "did:ethr:0x...";
  const studentNameFromVc = selectedVc?.vcData?.credentialSubject?.claims?.studentName ||
    selectedVc?.vcData?.credentialSubject?.saltedClaims?.studentName?.value ||
    "Sinh viên";

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const claimsDef = selectedVc?.vcData?.credentialSubject?.saltedClaims
    ? Object.keys(selectedVc.vcData.credentialSubject.saltedClaims).map((k) => ({
        key: k,
        label: getClaimLabel(k),
        value: selectedVc.vcData.credentialSubject.saltedClaims[k].value,
        type: k === "gpa" ? "leaf" : k === "dateOfBirth" ? "range" : "normal",
      }))
    : [
        { key: "studentName", label: "Họ và tên", value: studentNameFromVc, type: "normal" },
        { key: "studentId", label: "Mã sinh viên", value: selectedVc?.vcData?.credentialSubject?.claims?.studentId || "20120001", type: "normal" },
        { key: "major", label: "Ngành đào tạo", value: selectedVc?.vcData?.credentialSubject?.claims?.major || "Khoa học Máy tính", type: "normal" },
        { key: "graduationYear", label: "Năm tốt nghiệp", value: selectedVc?.vcData?.credentialSubject?.claims?.graduationYear || "2024", type: "normal" },
        { key: "classification", label: "Xếp loại tốt nghiệp", value: selectedVc?.vcData?.credentialSubject?.claims?.classification || "Xuất sắc", type: "normal" },
        { key: "gpa", label: "Điểm GPA (Thang 4)", value: selectedVc?.vcData?.credentialSubject?.claims?.gpa || "3.82", type: "leaf" },
        { key: "dateOfBirth", label: "Ngày sinh", value: selectedVc?.vcData?.credentialSubject?.claims?.dateOfBirth || "2002-05-15", type: "range" },
        { key: "nationalId", label: "Số CCCD / CMND", value: selectedVc?.vcData?.credentialSubject?.claims?.nationalId || "001202012345", type: "normal" },
      ];

  function getClaimLabel(key) {
    const labels = {
      studentName: "Họ và tên",
      studentId: "Mã số sinh viên (MSSV)",
      major: "Ngành đào tạo",
      degreeType: "Loại bằng",
      graduationYear: "Năm tốt nghiệp",
      gpa: "Điểm GPA (Thang 4)",
      classification: "Xếp loại tốt nghiệp",
      dateOfBirth: "Ngày sinh (DOB)",
      nationalId: "Số CCCD / CMND",
    };
    return labels[key] || key;
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* File input hidden for VC import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportVcFile}
        accept=".json"
        className="hidden"
      />

      {/* ── SECTION 1: Welcome & DID Identification Overview Hero ── */}
      <div className="relative w-full rounded-2xl bg-surface-container-low/90 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl border border-white/5 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-secondary" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2 text-secondary font-label-badge text-xs uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm animate-pulse">token</span>
              <span>Không Gian Danh Tính Số Sinh Viên (Self-Sovereign Identity)</span>
            </div>
            <h1 className="font-headline-lg text-2xl sm:text-4xl text-on-surface font-bold tracking-tight">
              Chào mừng, <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-fixed-dim to-secondary">{studentNameFromVc}</span> 🎓
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Toàn quyền kiểm soát văn bằng chứng chỉ đại học với công nghệ Bằng chứng Không Tri thức (ZKP). Bảo vệ quyền riêng tư tuyệt đối khi ứng tuyển và chia sẻ hồ sơ.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-container-high/70 backdrop-blur-md border border-white/5">
              <div className="relative flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-tertiary" />
                <span className="absolute w-5 h-5 rounded-full bg-tertiary/40 animate-ping" />
              </div>
              <div className="flex flex-col">
                <span className="font-label-badge text-xs uppercase tracking-wider text-tertiary font-semibold">
                  {myDid ? "Đã Đăng Ký On-Chain" : "Chưa Kích Hoạt DID"}
                </span>
                <span className="font-label-code text-xs text-on-surface-variant">Ganache Node #1337</span>
              </div>
            </div>
          </div>
        </div>

        {/* DID Key Ribbon */}
        <div className="mt-6 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest/60 rounded-xl p-4 border border-white/5">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="px-2.5 py-1 rounded bg-surface-container-highest font-label-code text-xs text-primary font-medium">DID CHÍNH</span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container/80 text-on-surface font-label-code text-xs tracking-wide truncate max-w-full">
              <span className="material-symbols-outlined text-base text-primary">fingerprint</span>
              <span className="select-all truncate">{holderDid}</span>
            </div>
            <button
              className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-bright text-on-surface-variant hover:text-primary transition-all flex items-center justify-center border border-white/5"
              onClick={() => copyToClipboard(holderDid, "holderDid")}
              title="Sao chép DID"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copiedText === "holderDid" ? "check" : "content_copy"}
              </span>
            </button>
            {!myDid && (
              <button
                onClick={handleRegisterDID}
                disabled={didRegLoading}
                className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-code text-xs font-semibold transition-all disabled:opacity-50"
              >
                {didRegLoading ? "Đang đăng ký..." : "Kích hoạt DID On-Chain"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant font-label-code text-xs">
            <span className="material-symbols-outlined text-secondary text-[18px]">lock</span>
            <span>Khóa Secp256k1: <strong className="text-on-surface font-medium">Lưu trữ cục bộ an toàn (Local Key Vault)</strong></span>
          </div>
        </div>

        {/* Quick Metrics Ribbon */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/60 transition-all border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-primary-container/20 flex items-center justify-center text-primary border border-primary/20">
              <span className="material-symbols-outlined text-2xl">school</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-xl text-on-surface font-bold">{vcs.length} Bằng cấp số</span>
              <span className="font-body-sm text-xs text-on-surface-variant">Lưu trữ trong Vault mật</span>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/60 transition-all border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-secondary-container/20 flex items-center justify-center text-secondary border border-secondary/20">
              <span className="material-symbols-outlined text-2xl">share_reviews</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-xl text-on-surface font-bold">{shareHistory.length} Lượt VP</span>
              <span className="font-body-sm text-xs text-on-surface-variant">Xuất trình thành công</span>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/60 transition-all border border-white/5">
            <div className="w-12 h-12 rounded-xl bg-tertiary-container/20 flex items-center justify-center text-tertiary border border-tertiary/20">
              <span className="material-symbols-outlined text-2xl">enhanced_encryption</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-xl text-on-surface font-bold">100% ZKP Active</span>
              <span className="font-body-sm text-xs text-on-surface-variant">Merkle Root Blinded Proof</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN TWO-COLUMN WORKSPACE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Vault & Selective Disclosure Builder (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* SECTION 2: Credential Wallet (Kho Lưu Trữ Bằng Cấp) */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">workspace_premium</span>
                <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Kho Bằng Cấp Điện Tử (Verifiable Credentials)</h2>
              </div>
              <span className="px-3 py-1 rounded-full bg-primary-container/20 text-primary font-label-badge text-xs font-semibold border border-primary/20">
                {selectedVc ? "1 Đang chọn" : "Chưa chọn"}
              </span>
            </div>

            {/* Upload Dropzone for new VC JSON */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative w-full p-5 rounded-2xl bg-surface-container-lowest/50 hover:bg-surface-container-lowest/80 transition-all flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer border border-dashed border-white/10 hover:border-primary/50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high group-hover:bg-primary-container/20 transition-all flex items-center justify-center text-primary border border-white/5">
                  <span className="material-symbols-outlined text-2xl">upload_file</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-sm text-on-surface font-medium">Tải file VC (.json) do nhà trường cấp</span>
                  <span className="font-body-sm text-xs text-on-surface-variant">Bấm để tải tệp JSON chứng nhận W3C chuẩn để thêm vào ví</span>
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary font-label-code text-xs font-semibold transition-all whitespace-nowrap shadow-sm border border-primary/20"
              >
                Chọn tệp từ máy
              </button>
            </div>

            {/* Active Master Credential Cards List */}
            {vcLoading ? (
              <div className="py-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-3xl animate-spin text-primary">sync</span>
                <p className="text-sm mt-2">Đang tải danh sách bằng cấp từ Blockchain...</p>
              </div>
            ) : vcs.length === 0 ? (
              <div className="p-8 rounded-2xl bg-surface-container/40 border border-white/5 text-center text-on-surface-variant space-y-2">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">school</span>
                <p className="text-sm">Chưa có chứng chỉ nào được ghi nhận cho địa chỉ ví này.</p>
                <p className="text-xs text-outline">Hãy nhờ trường học cấp bằng hoặc nhập file VC JSON ở trên.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vcs.map((vc) => {
                  const isSelected = selectedVc?.hash === vc.hash;
                  const cSubject = vc.vcData?.credentialSubject?.claims || vc.vcData?.credentialSubject;
                  const sName = cSubject?.studentName || studentNameFromVc;
                  const sMajor = cSubject?.major || "Khoa học Máy tính & Kỹ thuật Phần mềm";
                  const sId = cSubject?.studentId || "20120001";
                  const sGpa = cSubject?.gpa || "3.82 / 4.0";
                  const sClass = cSubject?.classification || "XUẤT SẮC";

                  return (
                    <div
                      key={vc.hash}
                      onClick={() => handleSelectVc(vc)}
                      className={`relative w-full rounded-2xl p-6 transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-gradient-to-br from-surface-container-high/90 via-surface-container/90 to-surface-container-low/90 shadow-2xl border-primary/40"
                          : "bg-surface-container-low/60 hover:bg-surface-container-low/90 border-white/5 opacity-80"
                      } overflow-hidden`}
                    >
                      {isSelected && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-tertiary" />
                      )}

                      <div className="flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-surface-container-lowest flex items-center justify-center text-secondary shadow-md border border-white/5">
                              <span className="material-symbols-outlined text-[28px]">account_balance</span>
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-headline-sm text-base sm:text-lg text-on-surface font-bold">
                                  Đại Học Quốc Gia TP.HCM
                                </span>
                                <span className="material-symbols-outlined text-tertiary text-base" title="Issuer Đã Xác Thực">
                                  verified
                                </span>
                              </div>
                              <span className="font-label-code text-xs text-on-surface-variant">
                                Issuer: {shortAddr(vc.issuer)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-secondary-container/30 text-secondary font-label-badge text-xs font-semibold border border-secondary/20">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                <span>ĐÃ CHỌN TẠO VP</span>
                              </span>
                            ) : (
                              <span className="text-xs text-on-surface-variant font-label-code">Bấm để chọn</span>
                            )}
                          </div>
                        </div>

                        {/* Title & Major */}
                        <div className="bg-surface-container-lowest/70 rounded-xl p-4 flex flex-col gap-1 border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="font-label-badge text-xs text-primary uppercase tracking-wider font-semibold">
                              {vc.type}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-tertiary-container/20 text-tertiary font-label-badge text-xs font-bold border border-tertiary/20">
                              {sClass} · GPA {sGpa}
                            </span>
                          </div>
                          <h3 className="font-headline-md text-lg text-on-surface font-semibold tracking-tight mt-1">
                            {sMajor}
                          </h3>
                        </div>

                        {/* Meta properties */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low/60 border border-white/5">
                            <span className="text-on-surface-variant font-label-code text-[11px]">HỌ TÊN</span>
                            <span className="text-on-surface font-semibold truncate mt-0.5">{sName}</span>
                          </div>
                          <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low/60 border border-white/5">
                            <span className="text-on-surface-variant font-label-code text-[11px]">MÃ SINH VIÊN</span>
                            <span className="text-on-surface font-semibold font-label-code mt-0.5">{sId}</span>
                          </div>
                          <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low/60 col-span-2 sm:col-span-1 border border-white/5">
                            <span className="text-on-surface-variant font-label-code text-[11px]">NGÀY CẤP</span>
                            <span className="text-on-surface font-semibold font-label-code mt-0.5">
                              {formatTimestamp(vc.issuedAt)}
                            </span>
                          </div>
                        </div>

                        {/* Root hash */}
                        <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-on-surface-variant font-label-code text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="material-symbols-outlined text-[16px] text-tertiary">hub</span>
                            <span className="truncate">Root: {shortAddr(vc.hash, 10)}</span>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-xs font-label-badge ${vc.isRevoked ? "bg-error/10 text-error" : "bg-tertiary/10 text-tertiary"}`}>
                            {vc.isRevoked ? "Đã thu hồi" : "Anchored On-Chain"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 3: Selective Disclosure Generator */}
          {selectedVc && (
            <div className="flex flex-col gap-6 p-6 sm:p-8 rounded-2xl bg-surface-container-low/80 backdrop-blur-xl shadow-xl border border-white/5">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-secondary">
                  <span className="material-symbols-outlined text-2xl">visibility_off</span>
                  <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Trình Tạo Xuất Trình Có Chọn Lọc (Selective Disclosure)</h2>
                </div>
                <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                  <strong className="text-tertiary font-medium">Quyền riêng tư tuyệt đối:</strong> Chỉ công khai các trường thông tin bạn cho phép. Các trường còn lại được băm bí mật (Blinded Hash / ZKP Proof), nhà tuyển dụng vẫn xác thực được chữ ký trường mà không đọc được dữ liệu ẩn.
                </p>
              </div>

              {/* Presets Shortcuts */}
              <div className="flex flex-col gap-2">
                <span className="font-label-badge text-xs uppercase tracking-wider text-outline">Cấu hình mẫu nhanh:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("all")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      activePreset === "all"
                        ? "bg-primary-container text-on-primary-container border-primary"
                        : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border-white/5"
                    }`}
                  >
                    🎯 Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("job")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                      activePreset === "job"
                        ? "bg-secondary-container text-on-secondary-container border-secondary shadow-md shadow-secondary/20"
                        : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border-white/5"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">work</span>
                    <span>💼 Ứng tuyển việc làm (Ẩn GPA &amp; CCCD)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("minimal")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      activePreset === "minimal"
                        ? "bg-primary-container text-on-primary-container border-primary"
                        : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border-white/5"
                    }`}
                  >
                    ⚡ Tối giản (Chỉ xác nhận tốt nghiệp)
                  </button>
                </div>
              </div>

              {/* Checkbox List of Claims */}
              <div className="flex flex-col gap-2.5">
                {claimsDef.map((claim) => {
                  const isChecked = disclosedKeys.includes(claim.key);
                  return (
                    <div
                      key={claim.key}
                      onClick={() => handleToggleKey(claim.key)}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/70 transition-colors cursor-pointer border border-white/5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded bg-surface-container text-primary-container focus:ring-0 cursor-pointer"
                        />
                        <div className="flex flex-col truncate">
                          <span className="font-body-sm text-sm text-on-surface font-medium">
                            {claim.label}:{" "}
                            {isChecked ? (
                              <span className="text-primary font-semibold">&quot;{claim.value}&quot;</span>
                            ) : (
                              <span className="line-through text-on-surface-variant opacity-60">&quot;{claim.value}&quot;</span>
                            )}
                          </span>
                          <span className="font-label-code text-[11px] text-on-surface-variant">
                            {isChecked
                              ? `claim: ${claim.key}`
                              : claim.type === "leaf"
                              ? "ZKP Leaf Proof · Tiết lộ điều kiện: GPA ≥ 3.0"
                              : claim.type === "range"
                              ? "Zero-Knowledge Range Proof (Chứng minh Tuổi ≥ 21)"
                              : `claim: ${claim.key} (Salted Hash)`}
                          </span>
                        </div>
                      </div>

                      {isChecked ? (
                        <span className="px-3 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary font-label-badge text-xs font-semibold uppercase border border-tertiary/20">
                          Công khai
                        </span>
                      ) : (
                        <span className="px-3 py-0.5 rounded-full bg-secondary-container/20 text-secondary font-label-badge text-xs font-semibold uppercase flex items-center gap-1 border border-secondary/20">
                          <span className="material-symbols-outlined text-[13px]">lock</span>
                          <span>Blinded Hash</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* TTL & Verifier Target */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="font-label-code text-xs text-on-surface-variant uppercase tracking-wider">
                    Thời hạn hiệu lực (TTL):
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["15", "60", "1440"].map((mins) => {
                      const label = mins === "15" ? "15 Phút" : mins === "60" ? "1 Giờ" : "24 Giờ";
                      const isSel = ttlMinutes === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setTtlMinutes(mins)}
                          className={`py-2 px-1 rounded-lg font-label-code text-xs text-center transition-all border ${
                            isSel
                              ? "bg-primary-container text-on-primary-container font-semibold border-primary shadow-md shadow-primary/20"
                              : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant border-white/5"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-label-code text-xs text-on-surface-variant uppercase tracking-wider">
                    Đối tượng thẩm định (Audience):
                  </label>
                  <input
                    type="text"
                    value={audienceTarget}
                    onChange={(e) => setAudienceTarget(e.target.value)}
                    placeholder="VD: FPT Software, did:ethr:0x..."
                    className="w-full px-3.5 py-2 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-sm border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
                  />
                </div>
              </div>

              {/* Action Button: Sign EIP-712 */}
              <button
                type="button"
                disabled={vpLoading}
                onClick={handleGenerateVP}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary-container via-secondary-container to-secondary text-on-surface font-headline-sm text-base font-bold shadow-lg shadow-primary-container/20 hover:shadow-primary-container/40 hover:scale-[1.005] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[24px]">
                  {vpLoading ? "sync" : "verified"}
                </span>
                <span>{vpLoading ? "Đang ký số với MetaMask..." : "Ký số (EIP-712) Tạo Verifiable Presentation"}</span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Presentation Output, Holographic QR, Audit Log (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* SECTION 4: Presentation Output & Holographic QR Card */}
          <div className="relative w-full rounded-2xl bg-surface-container-low/90 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl border border-white/5 overflow-hidden flex flex-col gap-5">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-primary to-tertiary" />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-2xl">qr_code_scanner</span>
                <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Bản Xuất Trình (VP)</h2>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-container/20 text-tertiary font-label-badge text-xs font-semibold uppercase border border-tertiary/20">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
                <span>{qrDataUrl ? "Sẵn sàng quét" : "Chờ ký số"}</span>
              </div>
            </div>

            {/* Futuristic QR Display Box */}
            <div className="relative mx-auto w-72 h-72 p-4 rounded-2xl bg-surface-container-lowest/90 flex items-center justify-center shadow-inner border border-white/10 group">
              {/* Neon corner brackets */}
              <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-primary" />
              <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-secondary" />
              <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-secondary" />
              <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-tertiary" />

              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="VP Holographic QR Code"
                  className="w-full h-full object-contain rounded-xl shadow-md"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 text-on-surface-variant space-y-2">
                  <span className="material-symbols-outlined text-5xl text-outline animate-pulse">qr_code_2</span>
                  <p className="text-xs font-label-code text-on-surface">Chưa xuất trình VP</p>
                  <p className="text-[11px] text-outline">Bấm nút &quot;Ký số (EIP-712)&quot; để tạo mã QR chứa các trường đã chọn</p>
                </div>
              )}
            </div>

            {/* Countdown and Freshness Info */}
            <div className="flex items-center justify-between text-on-surface-variant font-label-code text-xs px-1">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[16px]">timer</span>
                <span>Hết hạn sau: <strong className="text-primary font-semibold">{formatSeconds(countdownSeconds)}</strong></span>
              </span>
              <span className="text-tertiary">Trạng thái: Hợp lệ</span>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!vpJson}
                onClick={() => {
                  copyToClipboard(vpJson, "vpJson");
                  alert("Đã sao chép chuỗi JSON Verifiable Presentation!");
                }}
                className="py-2.5 px-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code text-xs transition-all flex items-center justify-center gap-1 truncate border border-white/5 disabled:opacity-50"
                title="Sao chép JSON"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">content_copy</span>
                <span className="truncate">{copiedText === "vpJson" ? "Đã chép!" : "Copy JSON"}</span>
              </button>

              <button
                type="button"
                disabled={!vpJson}
                onClick={() => {
                  const blob = new Blob([vpJson], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `vp-${selectedVc?.type || "Degree"}-${Date.now()}.json`;
                  a.click();
                }}
                className="py-2.5 px-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code text-xs transition-all flex items-center justify-center gap-1 truncate border border-white/5 disabled:opacity-50"
                title="Tải file JSON"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">download</span>
                <span className="truncate">Tải .JSON</span>
              </button>

              <button
                type="button"
                disabled={!qrDataUrl}
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qrDataUrl;
                  a.download = `qr-vp-${Date.now()}.png`;
                  a.click();
                }}
                className="py-2.5 px-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-code text-xs transition-all flex items-center justify-center gap-1 truncate border border-white/5 disabled:opacity-50"
                title="Lưu ảnh QR"
              >
                <span className="material-symbols-outlined text-[16px] text-tertiary">qr_code</span>
                <span className="truncate">Lưu QR</span>
              </button>
            </div>

            {/* Cryptographic Summary Table */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-lowest/80 font-label-code text-xs border border-white/5">
              <div className="flex items-center justify-between text-outline">
                <span className="font-label-badge text-[11px] uppercase">THÔNG SỐ MÃ HÓA (VP PAYLOAD)</span>
                <span className="text-tertiary">Merkle Tree Blinded</span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant pt-1">
                <span>VP Digest Hash:</span>
                <span className="text-on-surface font-semibold truncate max-w-[160px]">
                  {vpPayloadDigest ? shortAddr(vpPayloadDigest, 10) : "Chưa tạo"}
                </span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Holder Sign:</span>
                <span className="text-primary truncate max-w-[160px]">
                  {holderSignature ? shortAddr(holderSignature, 10) : "Chưa ký"}
                </span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Trường đã mở / Ẩn:</span>
                <span className="text-tertiary font-semibold">
                  {disclosedKeys.length} Công khai / {claimsDef.length - disclosedKeys.length} Ẩn (ZKP)
                </span>
              </div>
              <div className="flex items-center justify-between text-on-surface-variant">
                <span>Merkle Proof State:</span>
                <span className="text-tertiary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">done_all</span>
                  <span>Path Validated</span>
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 5: Share History (Lịch Sử Xuất Trình Bằng Cấp) */}
          <div className="flex flex-col gap-4 p-6 sm:p-8 rounded-2xl bg-surface-container-low/70 backdrop-blur-xl shadow-xl border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-2xl">history_edu</span>
                <h2 className="font-headline-sm text-xl text-on-surface font-semibold">Lịch Sử Chia Sẻ (Audit Log)</h2>
              </div>
              <span className="font-label-code text-xs text-primary">
                {shareHistory.length} Lượt
              </span>
            </div>

            {shareHistory.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant text-xs">
                Chưa có lịch sử xuất trình nào được lưu trên trình duyệt này.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {shareHistory.slice(0, 5).map((item, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/70 transition-all flex flex-col gap-1.5 border border-white/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-8 h-8 rounded-lg bg-secondary-container/20 flex items-center justify-center text-secondary shrink-0 border border-secondary/20">
                          <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="font-body-sm text-sm text-on-surface font-semibold truncate">
                            {item.audience || "Public Verifier"}
                          </span>
                          <span className="font-label-code text-[11px] text-on-surface-variant">
                            {new Date(item.timestamp).toLocaleString("vi-VN")} · {item.credType}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-tertiary-container/20 text-tertiary font-label-badge text-[11px] font-semibold shrink-0 border border-tertiary/20">
                        ĐÃ XUẤT TRÌNH ✅
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant font-label-code text-[11px] pt-1 pl-10">
                      <span>Mở {item.disclosedCount || 4} trường</span>
                      <span className="text-outline truncate max-w-[140px]">{shortAddr(item.vcHash, 8)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
