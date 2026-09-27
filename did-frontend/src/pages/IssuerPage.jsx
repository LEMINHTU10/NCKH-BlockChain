import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getSigner, getProvider, shortAddr, formatTimestamp } from '../utils/web3';
import { CONTRACT_ADDRESSES, DID_REGISTRY_ABI, CREDENTIAL_REGISTRY_ABI } from '../utils/contracts';
import { createSaltedCredential } from '../utils/selectiveDisclosure';

export default function IssuerPage({ account }) {
  const [didDoc, setDidDoc] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [isContractOwner, setIsContractOwner] = useState(false);
  const [issuedList, setIssuedList] = useState([]);
  const [issuedFilter, setIssuedFilter] = useState('all'); // 'all' | 'active' | 'revoked'
  const [searchQuery, setSearchQuery] = useState('');

  // Đăng ký DID cho Issuer
  const [showDidModal, setShowDidModal] = useState(false);
  const [regPublicKey, setRegPublicKey] = useState('');
  const [regServiceUrl, setRegServiceUrl] = useState('');
  const [didRegLoading, setDidRegLoading] = useState(false);
  const [didRegStatus, setDidRegStatus] = useState(null);

  // Tra cứu DID Document (DID Resolver)
  const [resolveInput, setResolveInput] = useState('');
  const [resolvedDoc, setResolvedDoc] = useState(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveStatus, setResolveStatus] = useState(null);

  // Quản trị Admin: Cấp phép Issuer (Contract Owner)
  const [adminIssuerAddr, setAdminIssuerAddr] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminStatus, setAdminStatus] = useState(null);

  // Form fields for Issue VC
  const [studentDid, setStudentDid] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [degreeType, setDegreeType] = useState('Kỹ Sư Công Nghệ Thông Tin');
  const [major, setMajor] = useState('');
  const [gpa, setGpa] = useState('');
  const [gradYear, setGradYear] = useState(new Date().getFullYear().toString());
  const [classification, setClassification] = useState('Giỏi');
  const [dob, setDob] = useState('2002-05-15');
  const [nationalId, setNationalId] = useState('001202012345');
  const [expiresAt, setExpiresAt] = useState('0');
  
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueStatus, setIssueStatus] = useState(null);
  const [lastIssuedVc, setLastIssuedVc] = useState(null);
  const [lastIssuedHash, setLastIssuedHash] = useState('');

  // Tra cứu theo ví sinh viên (Lookup Holder for Revocation)
  const [lookupHolderAddr, setLookupHolderAddr] = useState('');
  const [lookupList, setLookupList] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState(null);

  // Revocation Modal state
  const [revokingCred, setRevokingCred] = useState(null);
  const [revokeReason, setRevokeReason] = useState('Phát hiện sai lệch bảng điểm thi chuẩn hóa');
  const [revokeNotes, setRevokeNotes] = useState('Biên bản hội đồng kỷ luật số 14/BB-HĐKL.');
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState(null);

  // View Details Modal state
  const [viewingCred, setViewingCred] = useState(null);

  useEffect(() => {
    if (account) {
      loadIssuerInfo();
      loadCredentials();
    }
  }, [account]);

  async function loadIssuerInfo() {
    try {
      const runner = (await getSigner()) || getProvider();
      const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, runner);
      const doc = await didContract.resolveDID(account);
      setDidDoc(doc.isActive && doc.owner !== ethers.ZeroAddress ? doc : null);

      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, runner);
      const auth = await credContract.authorizedIssuers(account);
      setIsAuthorized(auth);

      try {
        const ownerAddr = await credContract.owner();
        setIsContractOwner(ownerAddr.toLowerCase() === account.toLowerCase());
      } catch (e) {}
    } catch (error) {
      console.error("Lỗi tải thông tin Issuer:", error);
    }
  }

  async function loadCredentials() {
    try {
      const runner = (await getSigner()) || getProvider();
      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, runner);
      
      // 1. Lấy danh sách đã lưu ở LocalStorage của Issuer
      const savedKey = `issuer_issued_vcs_${account.toLowerCase()}`;
      const localSaved = JSON.parse(localStorage.getItem(savedKey) || "[]");
      const mapByHash = new Map();

      for (const item of localSaved) {
        mapByHash.set(item.hash.toLowerCase(), item);
      }

      // 2. Query sự kiện CredentialIssued trên Blockchain
      try {
        const filter = credContract.filters.CredentialIssued(null, account, null);
        const events = await credContract.queryFilter(filter, 0, 'latest');
        for (const ev of events) {
          const hash = ev.args.credentialHash;
          const hashLower = hash.toLowerCase();
          if (!mapByHash.has(hashLower)) {
            mapByHash.set(hashLower, {
              hash,
              holder: ev.args.holder,
              degreeType: ev.args.credentialType,
            });
          }
        }
      } catch (e) {
        console.warn("Lỗi queryFilter CredentialIssued:", e);
      }

      // 3. Đồng bộ trạng thái mới nhất trực tiếp trên Smart Contract
      const fullList = [];
      for (const [hashLower, item] of mapByHash.entries()) {
        try {
          const onchain = await credContract.getCredential(item.hash);
          fullList.push({
            ...item,
            holder: onchain.holder,
            degreeType: onchain.credentialType || item.degreeType,
            issuedAt: Number(onchain.issuedAt),
            expiresAt: Number(onchain.expiresAt),
            isRevoked: onchain.isRevoked,
          });
        } catch (e) {
          fullList.push(item);
        }
      }

      // Sắp xếp mới nhất lên đầu
      fullList.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
      setIssuedList(fullList);
    } catch (err) {
      console.error("Lỗi tải danh sách VC:", err);
    }
  }

  async function handleIssue(e) {
    e.preventDefault();
    if (!studentDid || !studentId || !studentName || !major || !gpa || !gradYear) {
      alert("Vui lòng điền đầy đủ thông tin sinh viên!");
      return;
    }
    if (!ethers.isAddress(studentDid.trim())) {
      alert("Địa chỉ ví sinh viên không hợp lệ (cần định dạng 0x... 40 ký tự hex)!");
      return;
    }

    setIssueLoading(true);
    setIssueStatus(null);
    try {
      const signer = await getSigner();
      const credContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );

      const claims = {
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        major: major.trim(),
        gpa: parseFloat(gpa).toFixed(2),
        classification,
        graduationYear: gradYear.trim(),
        dateOfBirth: dob || "2002-05-15",
        nationalId: nationalId || "001202012345",
      };

      const expiryNum = expiresAt && expiresAt !== "0"
        ? Math.floor(new Date(expiresAt).getTime() / 1000)
        : 0;

      const { vc, rootHash } = createSaltedCredential({
        issuerDid: `did:ethr:${account}`,
        holderDid: `did:ethr:${studentDid.trim()}`,
        credType: degreeType,
        claims,
        expiresAt: expiryNum,
      });

      const tx = await credContract.issueCredential(
        studentDid.trim(),
        rootHash,
        degreeType,
        expiryNum
      );
      await tx.wait();

      setLastIssuedHash(rootHash);
      setLastIssuedVc(vc);
      setIssueStatus({
        type: "success",
        msg: `Cấp phát văn bằng thành công!\nHash: ${rootHash}\nTx: ${tx.hash}`,
      });

      // Lưu vào LocalStorage của sinh viên (Holder) để ví sinh viên nhận được file VC
      const normalizedHolder = studentDid.trim().toLowerCase();
      const existingHolder = JSON.parse(localStorage.getItem(`vcs_${normalizedHolder}`) || "[]");
      existingHolder.push({ vcJson: JSON.stringify(vc), vcHash: rootHash, issuedAt: Date.now() });
      localStorage.setItem(`vcs_${normalizedHolder}`, JSON.stringify(existingHolder));

      // Lưu metadata vào LocalStorage của Issuer để hiển thị đầy đủ
      const savedKey = `issuer_issued_vcs_${account.toLowerCase()}`;
      const existingIssuer = JSON.parse(localStorage.getItem(savedKey) || "[]");
      existingIssuer.unshift({
        hash: rootHash,
        holder: studentDid.trim(),
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        major: major.trim(),
        gpa: parseFloat(gpa).toFixed(2),
        degreeType,
        classification,
        issuedAt: Math.floor(Date.now() / 1000),
        isRevoked: false,
        vc,
      });
      localStorage.setItem(savedKey, JSON.stringify(existingIssuer));

      // Reset form
      setStudentDid("");
      setStudentId("");
      setStudentName("");
      setMajor("");
      setGpa("");
      setGradYear(new Date().getFullYear().toString());

      await loadCredentials();
    } catch (err) {
      console.error("Lỗi cấp phát:", err);
      const msg = err?.reason || err?.message || String(err);
      setIssueStatus({
        type: "error",
        msg: `Lỗi cấp phát: ${msg}`,
      });
    } finally {
      setIssueLoading(false);
    }
  }

  // Tra cứu văn bằng theo ví sinh viên
  async function handleLookupHolder() {
    if (!lookupHolderAddr.trim() || !ethers.isAddress(lookupHolderAddr.trim())) {
      setLookupStatus({ type: 'error', msg: 'Địa chỉ ví sinh viên không hợp lệ (cần 0x + 40 ký tự hex).' });
      return;
    }
    setLookupLoading(true);
    setLookupStatus(null);
    setLookupList([]);
    try {
      const signer = await getSigner();
      const credContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const hashes = await credContract.getHolderCredentials(lookupHolderAddr.trim());
      const list = [];
      for (const h of hashes) {
        const d = await credContract.getCredential(h);
        list.push({
          hash: h,
          degreeType: d.credentialType,
          issuedAt: Number(d.issuedAt),
          expiresAt: Number(d.expiresAt),
          isRevoked: d.isRevoked,
          issuer: d.issuer,
          holder: d.holder,
        });
      }
      setLookupList(list);
      if (list.length === 0) {
        setLookupStatus({ type: 'error', msg: 'Không tìm thấy văn bằng nào của sinh viên này trên blockchain.' });
      }
    } catch (err) {
      setLookupStatus({ type: 'error', msg: 'Lỗi tải dữ liệu: ' + (err?.reason || err?.message || String(err)) });
    } finally {
      setLookupLoading(false);
    }
  }

  // Thực hiện thu hồi văn bằng On-Chain
  async function handleConfirmRevoke() {
    if (!revokingCred?.hash) return;
    setRevokeLoading(true);
    setRevokeStatus(null);
    try {
      const signer = await getSigner();
      const credContract = new ethers.Contract(
        CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY,
        CREDENTIAL_REGISTRY_ABI,
        signer
      );
      const tx = await credContract.revokeCredential(revokingCred.hash);
      await tx.wait();

      setRevokeStatus({
        type: "success",
        msg: `Đã thu hồi thành công văn bằng trên blockchain!\nTx: ${tx.hash}`,
      });

      // Cập nhật danh sách
      await loadCredentials();
      if (lookupHolderAddr) {
        await handleLookupHolder();
      }

      setTimeout(() => {
        setRevokingCred(null);
        setRevokeStatus(null);
      }, 2200);
    } catch (err) {
      console.error("Lỗi thu hồi:", err);
      const msg = err?.reason || err?.message || "Lỗi không xác định";
      setRevokeStatus({
        type: "error",
        msg: msg.includes("Chi Issuer goc")
          ? "Bạn không phải Issuer đã cấp phát bằng này."
          : msg.includes("da bi thu hoi")
          ? "Bằng này đã bị thu hồi trước đó rồi."
          : `Lỗi thu hồi: ${msg}`,
      });
    } finally {
      setRevokeLoading(false);
    }
  }

  // Đăng ký DID cho Issuer
  async function handleRegisterDID() {
    setDidRegLoading(true);
    setDidRegStatus(null);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Chưa kết nối ví MetaMask!");
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, signer);
      const pk = regPublicKey.trim() || `pubkey-${account.slice(2, 10)}`;
      const svc = regServiceUrl.trim() || `https://issuer.did.service/${account.slice(2, 10)}`;
      const tx = await contract.registerDID(pk, svc);
      await tx.wait();
      setDidRegStatus({ type: "success", msg: `Đăng ký DID Issuer thành công!\nTx: ${tx.hash}` });
      await loadIssuerInfo();
      setTimeout(() => setShowDidModal(false), 1800);
    } catch (err) {
      setDidRegStatus({ type: "error", msg: err?.reason || err?.message || String(err) });
    } finally {
      setDidRegLoading(false);
    }
  }

  // Tra cứu DID Document (DID Resolver)
  async function handleResolveDID() {
    let target = resolveInput.trim();
    if (target.startsWith("did:ethr:")) target = target.replace("did:ethr:", "");
    if (!target || !ethers.isAddress(target)) {
      setResolveStatus({ type: 'error', msg: 'Địa chỉ ví hoặc DID không hợp lệ (cần 0x + 40 ký tự hex).' });
      return;
    }
    setResolveLoading(true);
    setResolveStatus(null);
    setResolvedDoc(null);
    try {
      const runner = (await getSigner()) || getProvider();
      const didContract = new ethers.Contract(CONTRACT_ADDRESSES.DID_REGISTRY, DID_REGISTRY_ABI, runner);
      const doc = await didContract.resolveDID(target);
      if (!doc.isActive || doc.owner === ethers.ZeroAddress) {
        setResolveStatus({ type: 'warning', msg: 'Địa chỉ này chưa đăng ký DID hoặc DID đã bị vô hiệu hóa.' });
      } else {
        setResolvedDoc(doc);
      }
    } catch (err) {
      setResolveStatus({ type: 'error', msg: err?.reason || err?.message || String(err) });
    } finally {
      setResolveLoading(false);
    }
  }

  // Quản trị Admin: Cấp phép Issuer
  async function handleAuthorizeIssuer() {
    if (!adminIssuerAddr.trim() || !ethers.isAddress(adminIssuerAddr.trim())) {
      setAdminStatus({ type: 'error', msg: 'Địa chỉ Issuer cần cấp phép không hợp lệ.' });
      return;
    }
    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Chưa kết nối ví MetaMask!");
      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, signer);
      const tx = await credContract.authorizeIssuer(adminIssuerAddr.trim());
      await tx.wait();
      setAdminStatus({ type: 'success', msg: `Cấp phép Issuer thành công!\nTx: ${tx.hash}` });
      setAdminIssuerAddr('');
      await loadIssuerInfo();
    } catch (err) {
      setAdminStatus({ type: 'error', msg: err?.reason || err?.message || String(err) });
    } finally {
      setAdminLoading(false);
    }
  }

  // Quản trị Admin: Thu hồi cấp phép Issuer
  async function handleRevokeIssuerAuth() {
    if (!adminIssuerAddr.trim() || !ethers.isAddress(adminIssuerAddr.trim())) {
      setAdminStatus({ type: 'error', msg: 'Địa chỉ Issuer cần thu hồi không hợp lệ.' });
      return;
    }
    const confirmed = window.confirm(`Bạn có chắc chắn muốn thu hồi quyền cấp bằng của địa chỉ ${adminIssuerAddr}?`);
    if (!confirmed) return;
    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Chưa kết nối ví MetaMask!");
      const credContract = new ethers.Contract(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, CREDENTIAL_REGISTRY_ABI, signer);
      const tx = await credContract.revokeIssuerAuthorization(adminIssuerAddr.trim());
      await tx.wait();
      setAdminStatus({ type: 'success', msg: `Đã thu hồi quyền cấp bằng của Issuer!\nTx: ${tx.hash}` });
      setAdminIssuerAddr('');
      await loadIssuerInfo();
    } catch (err) {
      setAdminStatus({ type: 'error', msg: err?.reason || err?.message || String(err) });
    } finally {
      setAdminLoading(false);
    }
  }

  // Tải file VC JSON về máy
  function downloadVcJson(vc, fileName = "verifiable_credential.json") {
    const blob = new Blob([JSON.stringify(vc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Lọc danh sách bằng đã cấp
  const filteredList = issuedList.filter((item) => {
    if (issuedFilter === 'active' && item.isRevoked) return false;
    if (issuedFilter === 'revoked' && !item.isRevoked) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.studentName?.toLowerCase().includes(q);
      const matchId = item.studentId?.toLowerCase().includes(q);
      const matchHash = item.hash?.toLowerCase().includes(q);
      const matchHolder = item.holder?.toLowerCase().includes(q);
      return matchName || matchId || matchHash || matchHolder;
    }
    return true;
  });

  const activeCount = issuedList.filter(i => !i.isRevoked).length;
  const revokedCount = issuedList.filter(i => i.isRevoked).length;

  return (
    <div className="w-full px-4 lg:px-8 py-6 flex flex-col gap-6">
      
      {/* Hero Banner Card */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-border-ui shadow-sm p-6">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary-light to-secondary"></div>
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          {/* Left Banner */}
          <div className="flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="px-2.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-primary font-semibold text-xs uppercase tracking-wide">
                Cổng Quản Trị Cấp Phát & Thu Hồi Bằng Đại Học
              </span>
            </div>
            
            <h1 className="text-2xl lg:text-3xl font-bold text-primary tracking-tight mb-2">
              Hệ Thống Cấp Phát & Quản Trị Văn Bằng Số
            </h1>
            <p className="text-sm text-text-sub leading-relaxed">
              Phát hành văn bằng số hóa chống giả mạo trên nền tảng sổ cái phân tán Ethereum, tích hợp thu hồi on-chain và chữ ký mật mã bảo đảm tính toàn vẹn.
            </p>
          </div>

          {/* Right Mini Bento Telemetry */}
          <div className="grid grid-cols-3 gap-3 w-full lg:w-[480px] shrink-0">
            <div className="p-3 rounded-lg bg-surface-subtle border border-border-ui flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Tổng Đã Cấp</span>
              <div className="my-1 flex items-baseline justify-between">
                <span className="text-xl font-bold text-text-main">{issuedList.length}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="w-full h-full bg-primary"></div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Đang Hoạt Động</span>
              <div className="my-1 flex items-baseline justify-between">
                <span className="text-xl font-bold text-emerald-700">{activeCount}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${issuedList.length ? (activeCount / issuedList.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-red-50/60 border border-red-100 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wider">Đã Thu Hồi</span>
              <div className="my-1 flex items-baseline justify-between">
                <span className="text-xl font-bold text-red-700">{revokedCount}</span>
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
              </div>
              <div className="w-full h-1.5 bg-red-200 rounded-full overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${issuedList.length ? (revokedCount / issuedList.length) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Bento Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN (7 / 12) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Card A: DID Organization Profile */}
          <div className="rounded-xl bg-white border border-border-ui p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">account_balance</span>
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Tổ Chức Phát Hành (Issuer Authority)</h2>
              </div>
              <div>
                {isAuthorized !== null && (
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${isAuthorized ? 'bg-status-active-bg text-emerald-800' : 'bg-status-revoked-bg text-red-700'}`}>
                    {isAuthorized ? 'ĐÃ ĐƯỢC CẤP PHÉP ISSUER' : 'CHƯA ĐƯỢC CẤP PHÉP'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Tên Tổ Chức</span>
                <span className="text-sm font-semibold text-text-main">Hệ thống DID Academic</span>
              </div>
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Trạng Thái Node</span>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-status-active-bg text-emerald-800 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-active"></span>
                    ACTIVE (SẴN SÀNG)
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Địa Chỉ Ví Issuer</span>
                <span className="font-mono text-xs text-text-sub truncate" title={account}>{shortAddr(account, 10)}</span>
              </div>
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Contract Văn Bằng</span>
                <span className="font-mono text-xs text-text-sub truncate" title={CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY}>{shortAddr(CONTRACT_ADDRESSES.CREDENTIAL_REGISTRY, 8)}</span>
              </div>
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Contract Danh Tính (DID)</span>
                <span className="font-mono text-xs text-text-sub truncate" title={CONTRACT_ADDRESSES.DID_REGISTRY}>{shortAddr(CONTRACT_ADDRESSES.DID_REGISTRY, 8)}</span>
              </div>
              <div className="flex flex-col gap-1 p-2.5 rounded bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-text-muted uppercase font-semibold">Chuẩn Thu Hồi</span>
                <span className="font-mono text-xs text-text-sub truncate">On-Chain Revocation v1</span>
              </div>
            </div>

            {/* DID Registration Prompt for Issuer */}
            {!didDoc ? (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-800">
                  <span className="material-symbols-outlined text-[20px] text-amber-600 shrink-0">warning</span>
                  <div>
                    <span className="font-bold">Ví Issuer này chưa đăng ký DID trên Blockchain:</span>
                    <span className="ml-1 text-amber-700">Đăng ký để liên kết khóa công khai và định danh tổ chức cấp phát.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRegPublicKey(`pubkey-${account.slice(2, 10)}`);
                    setRegServiceUrl(`https://issuer.did.service/${account.slice(2, 10)}`);
                    setShowDidModal(true);
                  }}
                  className="px-3 py-1.5 rounded-md bg-primary text-white font-semibold hover:bg-primary-dark transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  Đăng Ký DID Issuer
                </button>
              </div>
            ) : (
              <div className="mt-3 p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-800 min-w-0">
                  <span className="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">verified</span>
                  <span className="font-mono font-medium truncate" title={didDoc.did}>
                    DID: {didDoc.did}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium shrink-0">
                  Khởi tạo: {formatTimestamp(didDoc.createdAt)}
                </span>
              </div>
            )}
          </div>

          {/* Card B: Issue New Degree Form */}
          <div className="rounded-xl bg-white border border-border-ui p-6 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">post_add</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-main">Cấp Phát Văn Bằng Mới</h2>
                  <p className="text-xs text-text-muted">Tạo mới và ký số văn bằng đại học trực tiếp vào chuỗi khối</p>
                </div>
              </div>
            </div>
            
            <form onSubmit={handleIssue} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-text-sub uppercase tracking-wider flex items-center justify-between">
                  <span>Địa Chỉ Ví Sinh Viên (Holder Ethereum Address) *</span>
                  {studentDid && ethers.isAddress(studentDid) && (
                    <span className="text-status-active font-mono text-xs font-semibold lowercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-active"></span>checksum hợp lệ
                    </span>
                  )}
                </label>
                <input 
                  value={studentDid} 
                  onChange={e => setStudentDid(e.target.value)}
                  className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2.5 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1 focus:ring-primary-light shadow-sm" 
                  type="text" 
                  required 
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Mã Số Sinh Viên (MSSV) *</label>
                  <input 
                    value={studentId} 
                    onChange={e => setStudentId(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="text" 
                    required 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Họ Và Tên Sinh Viên *</label>
                  <input 
                    value={studentName} 
                    onChange={e => setStudentName(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm font-medium rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="text" 
                    required 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Loại Văn Bằng *</label>
                  <select 
                    value={degreeType} 
                    onChange={e => setDegreeType(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1 cursor-pointer"
                  >
                    <option value="Kỹ Sư Công Nghệ Thông Tin">Kỹ Sư Công Nghệ Thông Tin</option>
                    <option value="Cử Nhân Khoa Học Máy Tính">Cử Nhân Khoa Học Máy Tính</option>
                    <option value="Kỹ Sư Xây Dựng">Kỹ Sư Xây Dựng</option>
                    <option value="Kiến Trúc Sư">Kiến Trúc Sư</option>
                    <option value="Thạc Sĩ Khoa Học">Thạc Sĩ Khoa Học</option>
                    <option value="Tiến Sĩ Kỹ Thuật">Tiến Sĩ Kỹ Thuật</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Ngành Đào Tạo *</label>
                  <input 
                    value={major} 
                    onChange={e => setMajor(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="text" 
                    required 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Điểm Trung Bình (GPA) *</label>
                  <input 
                    value={gpa} 
                    onChange={e => setGpa(e.target.value)} 
                    step="0.01" 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="number" 
                    required 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Năm Tốt Nghiệp *</label>
                  <input 
                    value={gradYear} 
                    onChange={e => setGradYear(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="number" 
                    required 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Ngày Sinh</label>
                  <input 
                    value={dob} 
                    onChange={e => setDob(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="date" 
                  />
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Số CCCD / Định Danh</label>
                  <input 
                    value={nationalId} 
                    onChange={e => setNationalId(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1" 
                    type="text" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Xếp Loại Tốt Nghiệp</label>
                  <select 
                    value={classification} 
                    onChange={e => setClassification(e.target.value)} 
                    className="w-full min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1 cursor-pointer"
                  >
                    <option value="Xuất sắc">Xuất sắc</option>
                    <option value="Giỏi">Giỏi</option>
                    <option value="Khá">Khá</option>
                    <option value="Trung bình">Trung bình</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Ngày Hết Hạn</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      value={expiresAt === "0" ? "" : expiresAt}
                      onChange={e => setExpiresAt(e.target.value || "0")}
                      className="flex-1 min-w-0 bg-surface-subtle border border-border-ui text-text-main text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1"
                    />
                    <button 
                      type="button" 
                      onClick={() => setExpiresAt("0")}
                      className="px-3 py-2 text-xs font-semibold rounded-lg border border-border-ui bg-white hover:bg-slate-50 text-text-sub shrink-0 cursor-pointer"
                    >
                      Vĩnh viễn
                    </button>
                  </div>
                </div>
              </div>

              {issueStatus && (
                <div className={`p-3.5 rounded-lg text-xs leading-relaxed border whitespace-pre-line break-all ${
                  issueStatus.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  {issueStatus.msg}
                </div>
              )}

              {lastIssuedHash && lastIssuedVc && (
                <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">Văn Bằng Vừa Cấp Phát Thành Công:</span>
                    <span className="text-[11px] font-mono text-text-muted">{shortAddr(lastIssuedHash, 10)}</span>
                  </div>
                  <p className="text-xs text-text-sub">
                    Tải file JSON chứng thực này để gửi cho sinh viên (dùng để lưu vào ví cá nhân và xác thực tuyển dụng):
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadVcJson(lastIssuedVc, `vc_${lastIssuedVc.credentialSubject?.studentId || 'degree'}.json`)}
                    className="self-start px-3 py-1.5 rounded-md bg-white border border-blue-300 hover:bg-blue-100 text-primary font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Tải File VC Cho Sinh Viên (.json)
                  </button>
                </div>
              )}

              <button 
                disabled={issueLoading} 
                type="submit" 
                className="w-full mt-2 py-3 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-sm flex items-center justify-center gap-2 shadow hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">{issueLoading ? 'sync' : 'fingerprint'}</span>
                <span>{issueLoading ? 'Đang Ký Hash & Ghi Vào Blockchain...' : 'Ký Số & Phát Hành Lên Mạng Blockchain (Mint VC)'}</span>
              </button>
            </form>
          </div>

          {/* Card B2: Quick Lookup & Revocation by Student Wallet */}
          <div className="rounded-xl bg-white border border-border-ui p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">manage_search</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-main">Tra Cứu & Thu Hồi Theo Ví Sinh Viên</h2>
                  <p className="text-xs text-text-muted">Nhập địa chỉ ví Ethereum của sinh viên để kiểm tra và thu hồi văn bằng</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={lookupHolderAddr}
                onChange={e => setLookupHolderAddr(e.target.value)}
                className="flex-1 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1"
                type="text"
              />
              <button
                type="button"
                onClick={handleLookupHolder}
                disabled={lookupLoading}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">{lookupLoading ? 'sync' : 'search'}</span>
                <span>{lookupLoading ? 'Đang tra cứu...' : 'Tra Cứu Bằng'}</span>
              </button>
            </div>

            {lookupStatus && (
              <div className={`p-3 rounded-lg text-xs border ${
                lookupStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {lookupStatus.msg}
              </div>
            )}

            {lookupList.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <span className="text-xs font-bold text-text-sub">Tìm thấy {lookupList.length} văn bằng của ví này:</span>
                {lookupList.map((c) => (
                  <div key={c.hash} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    c.isRevoked ? 'bg-red-50/40 border-red-200' : 'bg-slate-50 border-border-ui'
                  }`}>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${c.isRevoked ? 'line-through text-text-muted' : 'text-text-main'}`}>
                          🎓 {c.degreeType || 'Văn Bằng Tốt Nghiệp'}
                        </span>
                        {c.isRevoked ? (
                          <span className="px-2 py-0.5 rounded-full bg-status-revoked-bg text-red-700 text-[10px] font-bold">REVOKED (ĐÃ THU HỒI)</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-status-active-bg text-emerald-800 text-[10px] font-bold">ACTIVE (CÓ HIỆU LỰC)</span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-text-muted truncate">Hash: {c.hash}</span>
                      <span className="text-[11px] text-text-muted mt-0.5">Ngày cấp: {formatTimestamp(c.issuedAt)}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!c.isRevoked ? (
                        <button
                          type="button"
                          onClick={() => setRevokingCred(c)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">block</span>
                          <span>Thu Hồi</span>
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">cancel</span>
                          Đã Vô Hiệu
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card B3: Tra Cứu DID Document On-Chain (DID Resolver) */}
          <div className="rounded-xl bg-white border border-border-ui p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-main">Tra Cứu Danh Tính Số (DID Resolver)</h2>
                  <p className="text-xs text-text-muted">Truy vấn DID Document công khai trực tiếp từ Smart Contract DIDRegistry</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={resolveInput}
                onChange={e => setResolveInput(e.target.value)}
                className="flex-1 bg-surface-subtle border border-border-ui text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:bg-white focus:outline-none focus:border-primary-light focus:ring-1"
                type="text"
              />
              <button
                type="button"
                onClick={handleResolveDID}
                disabled={resolveLoading}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">{resolveLoading ? 'sync' : 'search'}</span>
                <span>{resolveLoading ? 'Đang truy vấn...' : 'Tra Cứu DID'}</span>
              </button>
            </div>

            {resolveStatus && (
              <div className={`p-3 rounded-lg text-xs border ${
                resolveStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                resolveStatus.type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {resolveStatus.msg}
              </div>
            )}

            {resolvedDoc && (
              <div className="p-4 rounded-lg bg-slate-50 border border-border-ui flex flex-col gap-2.5 text-xs font-mono">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-sans font-bold text-text-main">Thông Tin DID Document:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    resolvedDoc.isActive ? 'bg-status-active-bg text-emerald-800' : 'bg-status-revoked-bg text-red-700'
                  }`}>
                    {resolvedDoc.isActive ? 'HOẠT ĐỘNG (ACTIVE)' : 'VÔ HIỆU HÓA (INACTIVE)'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-text-muted text-[10px] uppercase font-bold">DID Identifier:</span>
                  <span className="text-primary font-semibold select-all break-all">{resolvedDoc.did}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-text-muted text-[10px] uppercase font-bold">Chủ Sở Hữu (Owner):</span>
                  <span className="text-text-main select-all break-all">{resolvedDoc.owner}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                  <div>
                    <span className="text-text-muted text-[10px] uppercase font-bold block">Khóa Công Khai (Public Key):</span>
                    <span className="text-text-main truncate block">{resolvedDoc.publicKey || 'Mặc định'}</span>
                  </div>
                  <div>
                    <span className="text-text-muted text-[10px] uppercase font-bold block">Dịch Vụ (Service Endpoint):</span>
                    <span className="text-text-main truncate block">{resolvedDoc.serviceEndpoint || 'N/A'}</span>
                  </div>
                </div>
                <div className="text-[10px] text-text-muted pt-1 border-t border-slate-200 flex justify-between">
                  <span>Khởi tạo: {formatTimestamp(resolvedDoc.createdAt)}</span>
                  <span>Cập nhật: {formatTimestamp(resolvedDoc.updatedAt)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Card B4: Quản Trị Hệ Thống: Cấp Phép Issuer (Dành cho Contract Owner) */}
          {isContractOwner && (
            <div className="rounded-xl bg-purple-50/40 border border-purple-200 p-6 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-purple-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-purple-900">Quản Trị Hệ Thống (Contract Owner Admin)</h2>
                    <p className="text-xs text-purple-700">Cấp phép hoặc thu hồi quyền cấp bằng đại học của các cơ sở đào tạo</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold uppercase">ADMIN OWNER</span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-purple-900 uppercase tracking-wider">Địa Chỉ Ví Cơ Sở Đào Tạo (Issuer Address)</label>
                <input
                  value={adminIssuerAddr}
                  onChange={e => setAdminIssuerAddr(e.target.value)}
                  placeholder="0x..."
                  className="bg-white border border-purple-200 text-text-main font-mono text-sm rounded-lg px-3.5 py-2 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  type="text"
                />
              </div>

              {adminStatus && (
                <div className={`p-3 rounded-lg text-xs border ${
                  adminStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  {adminStatus.msg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAuthorizeIssuer}
                  disabled={adminLoading}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                  <span>Cấp Phép Issuer</span>
                </button>
                <button
                  type="button"
                  onClick={handleRevokeIssuerAuth}
                  disabled={adminLoading}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-white border border-red-300 hover:bg-red-50 text-red-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[16px]">person_remove</span>
                  <span>Thu Hồi Cấp Phép</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 / 12) - Danh Sách Bằng Đã Cấp & Thao Tác Thu Hồi */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="rounded-xl bg-white border border-border-ui p-5 shadow-sm flex flex-col gap-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-main">Danh Sách Bằng Đã Cấp</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-primary font-mono text-xs font-semibold">
                  {issuedList.length}
                </span>
              </div>
              <button 
                onClick={loadCredentials} 
                className="text-text-muted hover:text-primary transition-colors p-1 rounded hover:bg-surface-subtle" 
                title="Làm mới danh sách từ Blockchain"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
            </div>

            {/* Filter Tabs Pill */}
            <div className="flex items-center p-1 rounded-lg bg-surface-subtle border border-border-ui gap-1">
              <button 
                onClick={() => setIssuedFilter('all')}
                className={`flex-1 py-1.5 text-center rounded text-xs font-semibold transition-all ${
                  issuedFilter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-text-sub hover:text-text-main'
                }`}
              >
                Tất Cả ({issuedList.length})
              </button>
              <button 
                onClick={() => setIssuedFilter('active')}
                className={`flex-1 py-1.5 text-center rounded text-xs font-semibold transition-all ${
                  issuedFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-text-sub hover:text-text-main'
                }`}
              >
                Hoạt Động ({activeCount})
              </button>
              <button 
                onClick={() => setIssuedFilter('revoked')}
                className={`flex-1 py-1.5 text-center rounded text-xs font-semibold transition-all ${
                  issuedFilter === 'revoked' ? 'bg-white text-red-600 shadow-sm' : 'text-text-sub hover:text-text-main'
                }`}
              >
                Thu Hồi ({revokedCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm tên sinh viên, MSSV hoặc hash..."
                className="w-full bg-surface-subtle border border-border-ui text-text-main text-xs rounded-lg pl-8 pr-3 py-2 focus:bg-white focus:outline-none focus:border-primary-light"
              />
              <span className="material-symbols-outlined text-[16px] text-text-muted absolute left-2.5 top-2.5">search</span>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="material-symbols-outlined text-[14px] text-text-muted absolute right-2.5 top-2.5 hover:text-text-main">
                  close
                </button>
              )}
            </div>
            
            {/* Credentials List */}
            <div className="flex flex-col gap-2.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredList.length === 0 ? (
                <div className="text-center py-10 text-text-muted text-sm border-2 border-dashed border-border-ui rounded-xl flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-slate-300">school</span>
                  <span>Không tìm thấy bằng cấp nào phù hợp.</span>
                </div>
              ) : (
                filteredList.map((cred, idx) => {
                  const initials = cred.studentName
                    ? cred.studentName.split(' ').map(n => n[0]).slice(-2).join('').toUpperCase()
                    : 'VC';

                  return (
                    <div 
                      key={cred.hash || idx} 
                      className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 shadow-xs ${
                        cred.isRevoked 
                          ? 'bg-red-50/30 border-red-200' 
                          : 'bg-white hover:bg-blue-50/40 border-border-ui'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border ${
                          cred.isRevoked 
                            ? 'bg-red-100 text-red-700 border-red-200' 
                            : 'bg-blue-100 text-primary border-blue-200'
                        }`}>
                          {initials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold truncate ${
                              cred.isRevoked ? 'text-text-muted line-through' : 'text-text-main'
                            }`}>
                              {cred.studentName || shortAddr(cred.holder, 6)}
                            </span>
                            {cred.isRevoked ? (
                              <span className="px-1.5 py-0.2 rounded-full bg-status-revoked-bg text-red-700 text-[10px] font-bold shrink-0">
                                REVOKED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-full bg-status-active-bg text-emerald-800 text-[10px] font-bold shrink-0">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs text-text-muted truncate">
                            {cred.studentId ? `MSSV: ${cred.studentId} • ` : ''}{cred.degreeType || 'Bằng Đại Học'}
                          </span>
                          <span className="font-mono text-[11px] text-text-muted truncate">
                            Hash: {shortAddr(cred.hash, 8)} • {formatTimestamp(cred.issuedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => setViewingCred(cred)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-sub hover:text-primary hover:bg-blue-50 transition-all cursor-pointer" 
                          title="Xem Chi Tiết Bằng Cấp"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>

                        {cred.vc && (
                          <button
                            type="button"
                            onClick={() => downloadVcJson(cred.vc, `VC_${cred.studentId || 'degree'}_${cred.hash.slice(0, 8)}.json`)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-sub hover:text-emerald-700 hover:bg-emerald-50 transition-all cursor-pointer"
                            title="Tải File VC (.json)"
                          >
                            <span className="material-symbols-outlined text-[18px]">download</span>
                          </button>
                        )}
                        
                        {!cred.isRevoked ? (
                          <button 
                            onClick={() => setRevokingCred(cred)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-sub hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer" 
                            title="Thu Hồi Văn Bằng Này"
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                          </button>
                        ) : (
                          <button 
                            disabled 
                            className="w-8 h-8 rounded-lg flex items-center justify-center opacity-30 cursor-not-allowed text-text-muted" 
                            title="Văn bằng đã bị thu hồi trước đó"
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      {/* MODAL 1: Xác Nhận Thu Hồi Văn Bằng (Revocation Confirmation Modal) */}
      {revokingCred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-xl bg-white border border-red-200 p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-red-100">
              <div className="flex items-center gap-2 text-red-600">
                <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
                <h3 className="text-base font-bold">Xác Nhận Thu Hồi Văn Bằng On-Chain</h3>
              </div>
              <button 
                onClick={() => { setRevokingCred(null); setRevokeStatus(null); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Warning Notice */}
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-red-600 shrink-0 mt-0.5">warning</span>
              <p className="text-xs leading-relaxed">
                Cảnh báo: Hành động này sẽ gọi Smart Contract ghi trạng thái <strong>REVOKED</strong> vĩnh viễn trên sổ cái Ethereum. Khi đã thu hồi, người xác thực và sinh viên sẽ không thể sử dụng văn bằng này nữa.
              </p>
            </div>

            {/* Target Credential Pill Card */}
            <div className="p-3 rounded-lg bg-surface-subtle border border-border-ui font-mono text-xs text-text-main flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-text-muted text-[11px] font-semibold">
                <span>HỒ SƠ VĂN BẰNG MỤC TIÊU</span>
                <span className="text-red-600 font-bold">MÃ VC: {shortAddr(revokingCred.hash, 8)}</span>
              </div>
              <div className="font-bold text-sm text-text-main font-sans">
                {revokingCred.studentName || 'Sinh viên'} {revokingCred.studentId ? `— MSSV: ${revokingCred.studentId}` : ''}
              </div>
              <div className="text-text-sub text-xs font-sans">
                {revokingCred.degreeType || 'Văn Bằng Đại Học'} {revokingCred.major ? `(${revokingCred.major})` : ''}
              </div>
              <div className="text-[11px] text-text-muted break-all">
                Holder: {revokingCred.holder}
              </div>
            </div>

            {/* Reason Selection Form */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Lý Do Thu Hồi Văn Bằng</label>
              <select 
                value={revokeReason} 
                onChange={e => setRevokeReason(e.target.value)}
                className="w-full bg-surface-subtle border border-border-ui text-text-main text-xs rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 cursor-pointer"
              >
                <option value="Phát hiện sai lệch bảng điểm thi chuẩn hóa">Phát hiện sai lệch bảng điểm thi chuẩn hóa</option>
                <option value="Gian lận hồ sơ học tập đầu vào">Gian lận hồ sơ học tập đầu vào</option>
                <option value="Thu hồi theo yêu cầu của Bộ GD&ĐT hoặc Cơ quan điều tra">Thu hồi theo yêu cầu của Bộ GD&ĐT hoặc Cơ quan điều tra</option>
                <option value="Lỗi ký số cryptographic sai hash/sai thông tin sinh viên">Lỗi ký số cryptographic sai hash/sai thông tin sinh viên</option>
                <option value="Kỷ luật đình chỉ tốt nghiệp">Kỷ luật đình chỉ tốt nghiệp</option>
                <option value="Khác">Lý do khác...</option>
              </select>
            </div>

            {/* Decision Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-text-sub uppercase tracking-wider">Số Quyết Định / Ghi Chú Thu Hồi</label>
              <textarea 
                value={revokeNotes} 
                onChange={e => setRevokeNotes(e.target.value)}
                className="w-full bg-surface-subtle border border-border-ui text-text-main font-mono text-xs rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 resize-none" 
                rows="2"
              />
            </div>

            {revokeStatus && (
              <div className={`p-3 rounded-lg text-xs leading-relaxed border whitespace-pre-line ${
                revokeStatus.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                {revokeStatus.msg}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-ui">
              <button 
                type="button" 
                onClick={() => { setRevokingCred(null); setRevokeStatus(null); }}
                disabled={revokeLoading}
                className="px-4 py-2 rounded-lg border border-border-ui bg-white hover:bg-slate-50 text-text-main font-semibold text-xs transition-colors cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button 
                type="button" 
                onClick={handleConfirmRevoke}
                disabled={revokeLoading}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm hover:shadow transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">{revokeLoading ? 'sync' : 'lock_reset'}</span>
                <span>{revokeLoading ? 'Đang Thực Hiện Giao Dịch...' : 'Xác Nhận Thu Hồi On-Chain'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Xem Chi Tiết Bằng Cấp (View Credential Details Modal) */}
      {viewingCred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-border-ui p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">school</span>
                </div>
                <h3 className="text-base font-bold text-text-main">Hồ Sơ Chi Tiết Văn Bằng Số</h3>
              </div>
              <button 
                onClick={() => setViewingCred(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Status Alert */}
            <div className={`p-3 rounded-lg flex items-center justify-between text-xs font-bold ${
              viewingCred.isRevoked ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">{viewingCred.isRevoked ? 'cancel' : 'check_circle'}</span>
                <span>Trạng thái on-chain: {viewingCred.isRevoked ? 'REVOKED (ĐÃ THU HỒI)' : 'ACTIVE (CÓ HIỆU LỰC TOÀN VẸN)'}</span>
              </div>
              <span className="font-mono text-[11px]">{formatTimestamp(viewingCred.issuedAt)}</span>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Sinh Viên</span>
                <span className="font-bold text-text-main text-sm">{viewingCred.studentName || 'Chưa cập nhật tên'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Mã Số Sinh Viên (MSSV)</span>
                <span className="font-bold font-mono text-primary text-sm">{viewingCred.studentId || 'N/A'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Loại Bằng</span>
                <span className="font-semibold text-text-main">{viewingCred.degreeType || 'Đại Học'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Ngành Học</span>
                <span className="font-semibold text-text-main">{viewingCred.major || 'Công Nghệ'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Điểm GPA / Xếp Loại</span>
                <span className="font-semibold text-text-main">{viewingCred.gpa || '3.50'} • {viewingCred.classification || 'Giỏi'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-100 flex flex-col gap-0.5">
                <span className="text-[10px] text-text-muted uppercase font-semibold">Hạn Dùng</span>
                <span className="font-semibold text-text-main">{viewingCred.expiresAt ? formatTimestamp(viewingCred.expiresAt) : 'Vĩnh viễn'}</span>
              </div>
            </div>

            {/* Addresses */}
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-subtle border border-border-ui text-xs font-mono">
              <div>
                <span className="text-text-muted text-[10px] uppercase font-bold block">Root Hash (Mã Băm Blockchain):</span>
                <span className="text-text-main select-all break-all">{viewingCred.hash}</span>
              </div>
              <div>
                <span className="text-text-muted text-[10px] uppercase font-bold block">Địa Chỉ Ví Holder (Sinh viên):</span>
                <span className="text-text-main select-all break-all">{viewingCred.holder}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border-ui">
              {viewingCred.vc ? (
                <button
                  type="button"
                  onClick={() => downloadVcJson(viewingCred.vc, `vc_${viewingCred.studentId || 'degree'}.json`)}
                  className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Tải File VC (.json)</span>
                </button>
              ) : (
                <span className="text-xs text-text-muted italic">Metadata VC lưu trên chuỗi khối</span>
              )}

              <div className="flex items-center gap-2">
                {!viewingCred.isRevoked && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingCred;
                      setViewingCred(null);
                      setRevokingCred(target);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">block</span>
                    <span>Thu Hồi Bằng Này</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingCred(null)}
                  className="px-4 py-2 rounded-lg border border-border-ui bg-white hover:bg-slate-50 text-text-main font-semibold text-xs transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Đăng Ký DID Document Cho Issuer */}
      {showDidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-xl bg-white border border-border-ui p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border-ui">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[24px]">badge</span>
                <h3 className="text-base font-bold">Đăng Ký DID Issuer Trên Blockchain</h3>
              </div>
              <button 
                onClick={() => { setShowDidModal(false); setDidRegStatus(null); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-text-sub">
              Tạo danh tính phi tập trung (Decentralized Identifier) cho Cơ sở đào tạo trên hợp đồng thông minh <code>DIDRegistry.sol</code>:
            </p>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-text-sub uppercase tracking-wider text-[10px]">Địa Chỉ Ví Issuer</label>
                <div className="font-mono text-xs p-2 rounded bg-slate-100 border border-slate-200 truncate select-all">{account}</div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-text-sub uppercase tracking-wider text-[10px]">Khóa Công Khai (Public Key)</label>
                <input
                  value={regPublicKey}
                  onChange={e => setRegPublicKey(e.target.value)}
                  placeholder="pubkey-..."
                  className="bg-surface-subtle border border-border-ui text-text-main font-mono text-xs rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-primary-light"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-text-sub uppercase tracking-wider text-[10px]">Dịch Vụ Xác Thực (Service Endpoint)</label>
                <input
                  value={regServiceUrl}
                  onChange={e => setRegServiceUrl(e.target.value)}
                  placeholder="https://issuer.did.service/..."
                  className="bg-surface-subtle border border-border-ui text-text-main font-mono text-xs rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-primary-light"
                />
              </div>
            </div>

            {didRegStatus && (
              <div className={`p-3 rounded-lg text-xs border ${
                didRegStatus.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {didRegStatus.msg}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-border-ui">
              <button
                type="button"
                onClick={handleRegisterDID}
                disabled={didRegLoading}
                className="flex-1 py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">{didRegLoading ? 'sync' : 'how_to_reg'}</span>
                <span>{didRegLoading ? 'Đang Ghi Vào Sổ Cái...' : 'Xác Nhận Đăng Ký DID'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowDidModal(false); setDidRegStatus(null); }}
                className="px-4 py-2.5 rounded-lg border border-border-ui bg-white hover:bg-slate-50 text-text-main font-semibold text-xs transition-colors cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
