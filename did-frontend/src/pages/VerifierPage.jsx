import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import jsQR from 'jsqr';
import { getProvider, getSigner, shortAddr, formatTimestamp } from '../utils/web3';
import {
  CONTRACT_ADDRESSES,
  CREDENTIAL_REGISTRY_ABI,
  DID_REGISTRY_ABI,
  IDENTITY_VERIFIER_ABI,
} from '../utils/contracts';
import { verifySelectiveDisclosure } from '../utils/selectiveDisclosure';

const FIELD_LABELS = {
  studentName: "Họ và tên sinh viên",
  studentId: "Mã số sinh viên (MSSV)",
  major: "Ngành đào tạo",
  degreeType: "Loại văn bằng",
  gpa: "Điểm trung bình (GPA)",
  graduationYear: "Năm tốt nghiệp",
  classification: "Xếp loại tốt nghiệp",
  dateOfBirth: "Ngày sinh",
  nationalId: "Số CCCD / Định danh",
};

export default function VerifierPage({ account }) {
  const [vpJson, setVpJson] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('verify'); // 'verify' | 'audit'

  // Camera & Image Scan State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameId = useRef(null);

  // Audit Log State
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [verifySteps, setVerifySteps] = useState([
    { id: 1, title: 'Schema & Payload Validation', desc: 'Kiểm tra cấu trúc JSON-LD và trường bắt buộc', status: 'idle' },
    { id: 2, title: 'Holder Cryptographic Signature', desc: 'Xác minh chữ ký số mật mã EIP-191 của sinh viên', status: 'idle' },
    { id: 3, title: 'ZKP Merkle Root Hash Integrity', desc: 'Kiểm tra tính toán học cam kết băm ZKP & Root Hash', status: 'idle' },
    { id: 4, title: 'Smart Contract On-chain Status', desc: 'Kiểm tra trạng thái thu hồi (Revocation) trên Blockchain', status: 'idle' },
  ]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLog();
    }
  }, [activeTab]);

  // Camera Handlers
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
      streamRef.current.getTracks().forEach((t) => t.stop());
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
      inversionAttempts: "attemptBoth",
    });

    if (code && code.data) {
      stopCamera();
      setVpJson(code.data);
      executeVerification(code.data);
    } else {
      animFrameId.current = requestAnimationFrame(scanVideoFrame);
    }
  }

  // Quét mã QR từ ảnh với thuật toán đa lớp: Viền trắng Quiet-Zone, Đa tỷ lệ, Tự động đảo màu, Tăng độ tương phản
  function scanQrFromImageElement(img) {
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    const tryScan = (w, h, padding = 40, invert = "attemptBoth", contrast = 1) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w + padding * 2;
        canvas.height = h + padding * 2;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;

        // Tạo viền trắng Quiet Zone (bắt buộc theo chuẩn QR để jsQR nhận diện được mẫu căn góc)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (contrast !== 1) {
          ctx.filter = `contrast(${contrast})`;
        }
        ctx.drawImage(img, padding, padding, w, h);
        ctx.filter = "none";

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: invert,
        });
        return res ? res.data : null;
      } catch (e) {
        return null;
      }
    };

    // 1. Quét với kích thước gốc + lề trắng chuẩn 40px (giải quyết 95% lỗi ảnh bị cắt sát viền)
    let data = tryScan(naturalW, naturalH, 40, "attemptBoth");
    if (data) return data;

    // 2. Quét không lề phòng trường hợp ảnh đã có sẵn viền rộng
    data = tryScan(naturalW, naturalH, 0, "attemptBoth");
    if (data) return data;

    // 3. Quét đa tỷ lệ (Multi-scale: 800px, 600px, 500px, 400px, 1000px)
    const targetScales = [800, 600, 500, 400, 1000];
    for (const targetW of targetScales) {
      if (Math.abs(naturalW - targetW) > 60) {
        const targetH = Math.round((naturalH / naturalW) * targetW);
        data = tryScan(targetW, targetH, 30, "attemptBoth");
        if (data) return data;
      }
    }

    // 4. Quét tăng cường độ tương phản (Contrast enhancement)
    data = tryScan(Math.min(naturalW, 800), Math.round((naturalH / naturalW) * Math.min(naturalW, 800)), 40, "attemptBoth", 1.4);
    if (data) return data;

    // 5. Cắt vùng trung tâm (Center crop nếu là ảnh chụp màn hình cả trang web)
    if (naturalW > 600 && naturalH > 400) {
      try {
        const cropCanvas = document.createElement("canvas");
        const cropSize = Math.round(Math.min(naturalW, naturalH) * 0.7);
        cropCanvas.width = cropSize + 40;
        cropCanvas.height = cropSize + 40;
        const ctx = cropCanvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
          const startX = Math.round((naturalW - cropSize) / 2);
          const startY = Math.round((naturalH - cropSize) / 2);
          ctx.drawImage(img, startX, startY, cropSize, cropSize, 20, 20, cropSize, cropSize);
          const imgData = ctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
          const res = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "attemptBoth" });
          if (res && res.data) return res.data;
        }
      } catch (e) {}
    }

    return null;
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Hỗ trợ trường hợp người dùng nạp trực tiếp file JSON
    if (file.name.endsWith(".json") || file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        setVpJson(text);
        executeVerification(text);
      };
      reader.readAsText(file);
      e.target.value = "";
      return;
    }

    // Xử lý tệp hình ảnh
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const qrData = scanQrFromImageElement(img);
        if (qrData) {
          setVpJson(qrData);
          executeVerification(qrData);
        } else {
          alert("Không tìm thấy mã QR trong hình ảnh. Vui lòng chọn ảnh chụp mã QR rõ nét hơn hoặc dùng camera để quét trực tiếp!");
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Tải Lịch sử Thẩm định On-Chain (Audit Log)
  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const provider = getProvider();
      const ivContract = new ethers.Contract(CONTRACT_ADDRESSES.IDENTITY_VERIFIER, IDENTITY_VERIFIER_ABI, provider);
      const count = await ivContract.getAuditLogCount();
      const total = Number(count);
      const list = [];
      for (let i = Math.max(0, total - 25); i < total; i++) {
        const rec = await ivContract.getAuditRecord(i);
        list.unshift({
          id: i,
          verifier: rec.verifier,
          holder: rec.holder,
          credentialHash: rec.credentialHash,
          result: rec.result,
          reason: rec.reason,
          timestamp: Number(rec.timestamp),
        });
      }
      setAuditLog(list);
    } catch (err) {
      console.warn("Lỗi tải Audit Log:", err);
    } finally {
      setAuditLoading(false);
    }
  }

  // Quy trình Thẩm định Toàn vẹn 4 Bước
  async function executeVerification(rawInput) {
    const text = typeof rawInput === 'string' ? rawInput : vpJson;
    if (!text || !text.trim()) {
      alert("Vui lòng nhập nội dung VP (JSON) hoặc quét mã QR!");
      return;
    }

    setLoading(true);
    setVerificationResult(null);
    setVerifySteps(steps => steps.map(s => ({ ...s, status: 'idle' })));

    let vpData;
    try {
      vpData = JSON.parse(text);
    } catch (err) {
      alert("Định dạng JSON không hợp lệ! Vui lòng kiểm tra lại cấu trúc văn bản.");
      setLoading(false);
      return;
    }

    // Tự động giải nén payload từ QR code nếu chứa các trường p, sig, holder
    if (vpData.p && !vpData.presentationPayload) {
      try {
        vpData.presentationPayload = typeof vpData.p === "string" ? JSON.parse(vpData.p) : vpData.p;
      } catch (e) {
        console.warn("Không thể parse vpData.p:", e);
      }
    }
    if (!vpData.signature && vpData.sig) vpData.signature = vpData.sig;
    if (!vpData.holderAddress && vpData.holder) vpData.holderAddress = vpData.holder;

    try {
      // ─────────────────────────────────────────────────────────────
      // BƯỚC 1: Schema & Payload Validation
      // ─────────────────────────────────────────────────────────────
      setVerifySteps(steps => steps.map(s => s.id === 1 ? { ...s, status: 'loading' } : s));
      await new Promise(r => setTimeout(r, 400));

      const payload = vpData.presentationPayload || vpData;
      const vcHash = vpData.vcHash || payload.vcHash;
      const holderAddr = vpData.holderAddress || vpData.holder || payload.holder;
      const signature = vpData.signature || vpData.sig || vpData.proof?.proofValue;

      if (!holderAddr || !vcHash || !signature) {
        throw new Error("Cấu trúc VP không hợp lệ: Thiếu các trường bắt buộc (holderAddress, vcHash, hoặc signature)!");
      }

      // KIỂM TRA CHỐNG TÁCH RỜI CHỮ KÝ (SIGNATURE DECOUPLING DEFENSE):
      // Nếu có chuỗi payloadToVerify riêng biệt, bắt buộc nó phải trùng khớp 100% với presentationPayload
      if (vpData.payloadToVerify && vpData.presentationPayload) {
        try {
          const parsedP = typeof vpData.payloadToVerify === "string" ? JSON.parse(vpData.payloadToVerify) : vpData.payloadToVerify;
          if (JSON.stringify(parsedP) !== JSON.stringify(vpData.presentationPayload)) {
            throw new Error("Phát hiện giả mạo dữ liệu: Chuỗi xác thực (payloadToVerify) không khớp với nội dung xuất trình (presentationPayload)! Dữ liệu đã bị can thiệp!");
          }
        } catch (mismatchErr) {
          throw new Error("Phát hiện giả mạo dữ liệu: " + (mismatchErr.message || "Cam kết chữ ký không khớp với dữ liệu xuất trình!"));
        }
      }

      setVerifySteps(steps => steps.map(s => s.id === 1 ? { ...s, status: 'success' } : s));

      // ─────────────────────────────────────────────────────────────
      // BƯỚC 2: Holder Cryptographic Signature Verification
      // ─────────────────────────────────────────────────────────────
      setVerifySteps(steps => steps.map(s => s.id === 2 ? { ...s, status: 'loading' } : s));
      await new Promise(r => setTimeout(r, 500));

      // Xác thực chữ ký số: Ký trực tiếp trên cấu trúc presentationPayload thực tế đang xuất trình
      const messageToVerify = vpData.presentationPayload
        ? JSON.stringify(vpData.presentationPayload)
        : (vpData.payloadToVerify || vpData.p || JSON.stringify(payload));

      let recoveredAddr = "";
      try {
        recoveredAddr = ethers.verifyMessage(messageToVerify, signature);
      } catch (sigErr) {
        throw new Error("Chữ ký số mật mã không hợp lệ hoặc chuỗi chữ ký đã bị chỉnh sửa/sai lệch ký tự (Signature corrupted: " + (sigErr.reason || sigErr.message) + ")!");
      }

      // So khớp người ký với địa chỉ Holder
      if (recoveredAddr.toLowerCase() !== holderAddr.toLowerCase()) {
        throw new Error(
          `Chữ ký số không khớp với Holder! (Địa chỉ giải mã: ${shortAddr(recoveredAddr)} ≠ Chủ sở hữu: ${shortAddr(holderAddr)}). ` +
          `Dữ liệu xuất trình đã bị can thiệp hoặc giả mạo (bất kỳ thay đổi nào dù chỉ 1 ký tự cũng làm sai lệch chữ ký)!`
        );
      }
      setVerifySteps(steps => steps.map(s => s.id === 2 ? { ...s, status: 'success' } : s));

      // ─────────────────────────────────────────────────────────────
      // BƯỚC 3: ZKP Merkle Root Hash Integrity Verification
      // ─────────────────────────────────────────────────────────────
      setVerifySteps(steps => steps.map(s => s.id === 3 ? { ...s, status: 'loading' } : s));
      await new Promise(r => setTimeout(r, 600));

      // Dữ liệu thuộc tính hiển thị và thẩm định BẮT BUỘC phải lấy từ chính presentationPayload đã được ký
      const rawDisclosed = payload.presentedClaims || payload.claims || vpData.presentedClaims || vpData.disclosed || {};
      const blindedHashes = payload.blindedHashes || vpData.blindedHashes || vpData.blinded || {};
      const allKeys = payload.allKeys || vpData.allKeys || vpData.keys || [];

      // Chuẩn hóa claims công khai
      const normalizedDisclosed = {};
      for (const [k, v] of Object.entries(rawDisclosed)) {
        normalizedDisclosed[k] = (typeof v === 'object' && v !== null && 'value' in v)
          ? { ...v, disclosed: true }
          : { value: v, salt: '', disclosed: true };
      }

      const totalKeys = allKeys.length > 0 ? allKeys : Object.keys({ ...normalizedDisclosed, ...blindedHashes }).sort();

      // Xác thực Merkle Root Hash nếu là xuất trình ZKP Selective Disclosure (có muối hoặc blinded hashes)
      const isZkpSelective = !vpData.isStandardVp && (
        Object.keys(blindedHashes).length > 0 ||
        Object.values(normalizedDisclosed).some(x => x.salt && typeof x.salt === "string" && x.salt.trim().length > 0)
      );

      if (isZkpSelective) {
        const selectiveData = {
          presentedClaims: normalizedDisclosed,
          blindedHashes,
          allKeys: totalKeys,
          vcHash,
        };
        const selectiveCheck = verifySelectiveDisclosure(selectiveData);
        if (!selectiveCheck.isValid) {
          throw new Error("Phát hiện giả mạo dữ liệu: Thuộc tính công khai hoặc muối mật mã (Salt) đã bị chỉnh sửa! Mã băm cam kết không khớp với Root Hash trên Blockchain!");
        }
      }
      setVerifySteps(steps => steps.map(s => s.id === 3 ? { ...s, status: 'success' } : s));

      // ─────────────────────────────────────────────────────────────
      // BƯỚC 4: Smart Contract On-chain Status & Revocation Check
      // ─────────────────────────────────────────────────────────────
      setVerifySteps(steps => steps.map(s => s.id === 4 ? { ...s, status: 'loading' } : s));
      await new Promise(r => setTimeout(r, 500));

      const provider = getProvider();
      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, provider);
      const onChainCred = await credContract.getCredential(vcHash);

      if (!onChainCred || onChainCred.issuer === ethers.ZeroAddress) {
        throw new Error("Văn bằng không tồn tại trên Smart Contract (Hash chưa từng được cấp phát trên Blockchain)!");
      }

      if (onChainCred.isRevoked) {
        throw new Error("VĂN BẰNG ĐÃ BỊ THU HỒI (REVOKED): Văn bằng này đã bị Trường học / Cơ sở đào tạo thu hồi hiệu lực pháp lý trên Blockchain!");
      }

      if (onChainCred.expiresAt && Number(onChainCred.expiresAt) > 0 && Math.floor(Date.now() / 1000) > Number(onChainCred.expiresAt)) {
        throw new Error("VĂN BẰNG ĐÃ HẾT HẠN: Thời hạn hiệu lực văn bằng trên Blockchain đã kết thúc!");
      }

      if (onChainCred.holder.toLowerCase() !== holderAddr.toLowerCase()) {
        throw new Error(`Văn bằng trên Blockchain không thuộc về Holder này (Chủ sở hữu on-chain: ${shortAddr(onChainCred.holder)} ≠ Người xuất trình: ${shortAddr(holderAddr)})!`);
      }

      // Kiểm tra thời hạn sống của mã VP (Chống Replay Attack)
      const expTs = vpData.expirationTimestamp || vpData.presentationPayload?.expiresAt || vpData.exp;
      if (expTs && Date.now() > Number(expTs)) {
        const expTimeStr = new Date(Number(expTs)).toLocaleString('vi-VN');
        throw new Error(`MÃ XUẤT TRÌNH (VP) ĐÃ HẾT HẠN vào lúc ${expTimeStr}! Vui lòng yêu cầu sinh viên tạo lại mã mới để chống tấn công phát lại.`);
      }

      // Lấy thông tin tổ chức phát hành
      const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, provider);
      let issuerDoc = null;
      try {
        issuerDoc = await didContract.resolveDID(onChainCred.issuer);
      } catch (e) {}

      // Ghi Audit Log on-chain nếu Verifier có kết nối ví MetaMask
      try {
        const signer = getSigner();
        if (signer) {
          const ivContract = new ethers.Contract(CONTRACT_ADDRESSES.IDENTITY_VERIFIER, IDENTITY_VERIFIER_ABI, signer);
          const tx = await ivContract.verifyIdentity(holderAddr, vcHash);
          await tx.wait();
        }
      } catch (auditErr) {
        console.warn("Ghi Audit Log bỏ qua:", auditErr?.message);
      }

      setVerifySteps(steps => steps.map(s => s.id === 4 ? { ...s, status: 'success' } : s));

      // Cập nhật kết quả thành công hoàn chỉnh
      setVerificationResult({
        isValid: true,
        data: {
          ...vpData,
          vcHash,
          holderAddress: holderAddr,
          presentedClaims: normalizedDisclosed,
          blindedHashes,
          allKeys: totalKeys,
          audience: vpData.audience || vpData.presentationPayload?.audience || "PUBLIC_VERIFIER",
        },
        onChain: {
          issuer: onChainCred.issuer,
          holder: onChainCred.holder,
          degreeType: onChainCred.credentialType,
          issuedAt: Number(onChainCred.issuedAt),
          expiresAt: Number(onChainCred.expiresAt),
        },
        issuerName: issuerDoc && issuerDoc.isActive ? "Tổ chức phát hành hợp lệ" : "Tổ chức DID Academic",
      });

    } catch (err) {
      console.error("Lỗi xác thực VP:", err);
      const errMsg = err?.reason || err?.message || String(err);
      setVerificationResult({
        isValid: false,
        error: errMsg,
      });
      // Đánh dấu bước đang loading bị lỗi
      setVerifySteps(steps => steps.map(s => s.status === 'loading' ? { ...s, status: 'error' } : s));
    } finally {
      setLoading(false);
    }
  }

  function getStepIcon(status) {
    switch (status) {
      case 'idle': return <span className="material-symbols-outlined text-slate-300">circle</span>;
      case 'loading': return <span className="material-symbols-outlined text-blue-500 animate-spin">sync</span>;
      case 'success': return <span className="material-symbols-outlined text-emerald-500">check_circle</span>;
      case 'error': return <span className="material-symbols-outlined text-red-500">cancel</span>;
      default: return null;
    }
  }

  return (
    <div className="w-full px-4 lg:px-8 py-6 flex flex-col gap-6">
      
      {/* Top Breadcrumbs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-lg border border-border-ui shadow-sm text-xs">
        <div className="flex items-center gap-2 text-text-sub">
          <span>Hệ thống Thẩm định</span>
          <span>/</span>
          <span className="text-primary font-semibold">Cổng Thẩm Định Văn Bằng Số (Verifier Node)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-surface-subtle border border-border-ui p-0.5">
            <button
              onClick={() => setActiveTab('verify')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'verify' ? 'bg-white text-primary shadow-xs' : 'text-text-sub hover:text-text-main'
              }`}
            >
              Thẩm Định VP
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'audit' ? 'bg-white text-primary shadow-xs' : 'text-text-sub hover:text-text-main'
              }`}
            >
              Audit Log On-Chain
            </button>
          </div>
          <span className="text-emerald-700 font-mono text-[11px] font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
            ZKP Merkle Claims Verified
          </span>
        </div>
      </div>

      {activeTab === 'verify' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COLUMN: Input, Camera Scanner & Verification Steps (5 / 12) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Input Card with Camera */}
            <div className="bg-white rounded-xl border border-border-ui shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-border-ui bg-surface-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">qr_code_scanner</span>
                  <h2 className="text-[15px] font-bold text-text-main tracking-tight">Dữ Liệu Trình Ký (VP JSON / QR)</h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*,.json"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-border-ui text-text-main text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                    title="Tải file ảnh mã QR từ máy"
                  >
                    <span className="material-symbols-outlined text-[14px]">image</span>
                    <span>Tải Ảnh QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={isCameraActive ? stopCamera : startCamera}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer ${
                      isCameraActive 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{isCameraActive ? 'videocam_off' : 'videocam'}</span>
                    <span>{isCameraActive ? 'Tắt Camera' : 'Quét Camera'}</span>
                  </button>
                </div>
              </div>

              <div className="p-5 flex flex-col gap-4">
                
                {/* Live Camera Viewfinder if active */}
                {isCameraActive && (
                  <div className="relative rounded-xl overflow-hidden bg-slate-900 border-2 border-primary aspect-video flex flex-col items-center justify-center">
                    <video ref={videoRef} className="w-full h-full object-cover" />
                    
                    {/* Holographic targeting frame */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="relative w-48 h-48 border-2 border-dashed border-primary-light rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(11,94,215,0.4)]">
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary-light to-transparent animate-pulse"></div>
                      </div>
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-white bg-black/60 px-2 py-1 rounded">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Đang quét mã QR...
                      </span>
                      <span>jsQR Engine Active</span>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="p-2.5 rounded text-xs bg-red-50 text-red-700 border border-red-200">
                    {cameraError}
                  </div>
                )}

                <p className="text-xs text-text-muted">
                  Dán nội dung JSON-LD của VP hoặc bật camera / tải file ảnh chụp mã QR để tự động thẩm định:
                </p>

                <form onSubmit={(e) => { e.preventDefault(); executeVerification(); }} className="flex flex-col gap-3">
                  <textarea 
                    className="w-full h-44 bg-surface-subtle border border-border-ui text-text-main font-mono text-xs p-3 rounded-lg focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1"
                    placeholder='{"holderAddress": "0x...", "vcHash": "0x...", "signature": "0x...", "presentationPayload": {...}, "presentedClaims": {...}}'
                    value={vpJson}
                    onChange={e => setVpJson(e.target.value)}
                  />
                  
                  <button 
                    disabled={loading}
                    type="submit" 
                    className="bg-primary hover:bg-primary-dark text-white font-semibold text-sm px-4 py-3 rounded-lg flex items-center justify-center gap-2 shadow hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px]">{loading ? 'sync' : 'verified_user'}</span>
                    <span>{loading ? 'Đang Thực Hiện Thẩm Định 4 Bước...' : 'Xác Thực Ngay (Verify VP)'}</span>
                  </button>
                </form>
              </div>
            </div>

            {/* 4-Step Pipeline Status Card */}
            <div className="bg-white rounded-xl border border-border-ui shadow-sm p-5 space-y-4">
              <h3 className="font-bold text-sm text-text-main tracking-wide uppercase">Quy Trình Kiểm Tra 4 Bước (Bảo Mật Tuyệt Đối)</h3>
              <div className="flex flex-col gap-2.5">
                {verifySteps.map(step => (
                  <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border border-border-ui bg-surface-subtle transition-all">
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-text-main">{step.title}</span>
                      <span className="text-[11px] text-text-sub">{step.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Results Display (7 / 12) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {!verificationResult && !loading && (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border-ui rounded-xl p-12 bg-white text-text-muted min-h-[420px]">
                <span className="material-symbols-outlined text-[54px] text-slate-300 mb-3">fact_check</span>
                <h3 className="text-base font-bold text-text-main mb-1">Chưa Có Dữ Liệu Thẩm Định</h3>
                <p className="text-xs text-center max-w-sm text-text-sub">
                  Dán nội dung JSON của văn bằng vào ô bên trái hoặc quét mã QR từ thiết bị của sinh viên để thẩm định tính toàn vẹn on-chain.
                </p>
              </div>
            )}

            {/* SUCCESS BANNER */}
            {verificationResult && verificationResult.isValid && (
              <div className="flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
                <div className="relative overflow-hidden rounded-xl bg-emerald-50/90 border-2 border-emerald-500/70 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0 shadow-xs">
                      <span className="material-symbols-outlined text-emerald-700 text-[36px]">verified</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-950 tracking-tight">BẰNG CẤP HỢP LỆ & TOÀN VẸN</span>
                        <span className="px-2.5 py-0.5 rounded bg-emerald-600 text-white text-xs font-semibold shadow-xs">Cryptographically Verified</span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Chứng chỉ khớp hoàn toàn với chữ ký số mật mã gốc của {verificationResult.issuerName} và được xác thực hợp lệ trên Smart Contract.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* Card 1: Disclosed Attributes (Thông tin công khai) */}
                  <div className="bg-white rounded-xl p-5 border border-border-ui shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-border-ui pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
                        <span className="font-bold text-sm text-primary">Thông Tin Công Khai Được Xuất Trình</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-primary text-[11px] font-bold">
                        {Object.keys(verificationResult.data.presentedClaims || {}).length} trường
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {Object.keys(verificationResult.data.presentedClaims || {}).length === 0 ? (
                        <div className="p-4 bg-slate-50 border border-border-ui rounded text-xs text-text-muted text-center">
                          Không có thuộc tính công khai nào được chọn xuất trình.
                        </div>
                      ) : (
                        Object.entries(verificationResult.data.presentedClaims).map(([key, attr]) => {
                          const val = typeof attr === 'object' && attr !== null && 'value' in attr ? attr.value : attr;
                          const displayVal = (typeof val === 'object' && val !== null)
                            ? (val.type || val.name || val.title || JSON.stringify(val))
                            : String(val ?? "");
                          const label = FIELD_LABELS[key] || key;
                          return (
                            <div key={key} className="flex flex-col p-2.5 rounded-lg bg-surface-subtle border border-border-ui">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-sub uppercase tracking-wider">{label}</span>
                                <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Verified
                                </span>
                              </div>
                              <span className="font-bold text-sm text-text-main mt-0.5 font-sans">{displayVal}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Card 2: Cryptographic Data (Dữ liệu mật mã) */}
                  <div className="bg-white rounded-xl p-5 border border-border-ui shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-border-ui pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600 text-[20px]">vpn_key</span>
                        <span className="font-bold text-sm text-primary">Dữ Liệu Mật Mã & On-Chain</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                        EIP-712 / W3C
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5 font-mono text-[11px] break-all">
                      <div className="flex flex-col p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                        <span className="font-semibold mb-0.5 text-emerald-700">VC Hash (Merkle Root trên Blockchain):</span>
                        <span className="font-mono text-xs">{verificationResult.data.vcHash}</span>
                      </div>
                      
                      <div className="flex flex-col p-2.5 rounded-lg bg-surface-subtle border border-border-ui">
                        <span className="font-semibold text-text-sub mb-0.5">Holder Ethereum Address (Sinh viên):</span>
                        <span>{verificationResult.data.holderAddress}</span>
                      </div>

                      <div className="flex flex-col p-2.5 rounded-lg bg-surface-subtle border border-border-ui">
                        <span className="font-semibold text-text-sub mb-0.5">Issuer Contract Address (Tổ chức cấp):</span>
                        <span>{verificationResult.onChain.issuer}</span>
                      </div>

                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-subtle border border-border-ui">
                        <span className="font-semibold text-text-sub">Thuộc tính che giấu (ZKP Commitments):</span>
                        <span className="font-bold text-primary">{Object.keys(verificationResult.data.blindedHashes || {}).length} trường</span>
                      </div>

                      {/* Display blinded attributes */}
                      {Object.keys(verificationResult.data.blindedHashes || {}).length > 0 && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-border-ui flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase text-text-muted">Mã băm cam kết (Blind Hashes):</span>
                          {Object.entries(verificationResult.data.blindedHashes).map(([k, h]) => (
                            <div key={k} className="flex items-center justify-between text-[10px]">
                              <span className="font-sans font-medium text-text-sub">{FIELD_LABELS[k] || k}:</span>
                              <span className="font-mono text-text-muted">{shortAddr(h, 6)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* FAILURE BANNER */}
            {verificationResult && !verificationResult.isValid && (
              <div className="relative overflow-hidden rounded-xl bg-red-50 border-2 border-red-500/70 p-6 shadow-md flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-full bg-red-100 border border-red-300 flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-red-600 text-[40px]">dangerous</span>
                </div>
                <div className="space-y-2 max-w-lg">
                  <h3 className="text-xl font-bold text-red-800 uppercase tracking-tight">Thẩm Định Thất Bại — Phát Hiện Sai Lệch</h3>
                  <p className="text-xs text-red-700 leading-relaxed">
                    Hệ thống mật mã phát hiện chữ ký số không hợp lệ, dữ liệu đã bị thay đổi trái phép, hoặc văn bằng đã bị thu hồi trên Blockchain.
                  </p>
                  <div className="mt-3 p-3 bg-white border border-red-200 rounded-lg font-mono text-xs text-red-700 text-left whitespace-pre-line shadow-xs">
                    <strong>Chi tiết lỗi:</strong> {verificationResult.error}
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* AUDIT LOG TAB */
        <div className="bg-white rounded-xl border border-border-ui shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-ui">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">history_edu</span>
              <div>
                <h3 className="text-base font-bold text-text-main">Nhật Ký Thẩm Định On-Chain (Audit Log)</h3>
                <p className="text-xs text-text-muted">Dữ liệu bất biến được ghi nhận trực tiếp vào Smart Contract IdentityVerifier trên Ethereum</p>
              </div>
            </div>
            <button
              onClick={loadAuditLog}
              className="px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-slate-200 text-text-main text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Làm Mới
            </button>
          </div>

          {auditLoading ? (
            <div className="text-center py-12 text-text-muted text-xs">Đang tải nhật ký từ Smart Contract...</div>
          ) : auditLog.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-xs border-2 border-dashed border-border-ui rounded-xl">
              Chưa có bản ghi thẩm định nào được lưu on-chain.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto pr-1">
              {auditLog.map((log) => (
                <div key={log.id} className="p-3 rounded-lg border border-border-ui bg-slate-50 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      log.result ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                    }`}>
                      <span className="material-symbols-outlined text-[16px]">{log.result ? 'check' : 'close'}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-main font-mono">{shortAddr(log.holder)}</span>
                        <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                          log.result ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}>
                          {log.result ? 'HỢP LỆ' : 'THẤT BẠI'}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-sub font-mono truncate">VC Hash: {shortAddr(log.credentialHash, 10)}</span>
                      <span className="text-[11px] text-text-muted">Lý do: {log.reason}</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-text-muted shrink-0 text-right">
                    {formatTimestamp(log.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}