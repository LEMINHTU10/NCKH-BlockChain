import { useState } from "react";
import { ethers } from "ethers";
import { getSigner, getAccount, shortAddr } from "../utils/web3";
import { CONTRACT_ADDRESSES, IDENTITY_VERIFIER_ABI } from "../utils/contracts";

export default function VerifierPage() {
  const account = getAccount();

  const [vpInput, setVpInput] = useState("");
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!account) {
    return (
      <div className="connect-prompt">
        <div className="connect-prompt-icon"></div>
        <h2>Kết nối ví MetaMask</h2>
        <p>Vui lòng kết nối ví MetaMask để sử dụng giao diện Verifier</p>
      </div>
    );
  }

  async function handleVerify() {
    if (!vpInput.trim()) {
      alert("Vui lòng nhập JSON của Verifiable Presentation!");
      return;
    }

    setLoading(true);
    setVerifyStatus(null);

    try {

      let parsed;
      try {
        parsed = JSON.parse(vpInput);
      } catch (e) {
        throw new Error("Định dạng JSON không hợp lệ.");
      }

      let vcHash = "";
      let holderAddr = "";
      let signature = "";
      let payloadToVerify = "";


      if (parsed.proof && parsed.proof.payload) {

        signature = parsed.proof.proofValue;
        payloadToVerify = parsed.proof.payload;
        const payloadObj = JSON.parse(payloadToVerify);
        vcHash = payloadObj.vcHash;
        holderAddr = payloadObj.holder;
      } else if (parsed.sig && parsed.vcHash) {

        signature = parsed.sig;
        vcHash = parsed.vcHash;
        holderAddr = parsed.holder;

        payloadToVerify = JSON.stringify({
          vcHash: parsed.vcHash,
          holder: parsed.holder,
          timestamp: parsed.ts
        });
      } else {
        throw new Error("Cấu trúc JSON không chứa thông tin chữ ký hợp lệ.");
      }

      if (!vcHash || !holderAddr) {
        throw new Error("Không tìm thấy vcHash hoặc địa chỉ holder trong VP.");
      }


      const recoveredAddr = ethers.verifyMessage(payloadToVerify, signature);
      if (recoveredAddr.toLowerCase() !== holderAddr.toLowerCase()) {
        throw new Error("Chữ ký số không hợp lệ! VP này đã bị giả mạo.");
      }


      const signer = getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.IDENTITY_VERIFIER,
        IDENTITY_VERIFIER_ABI,
        signer
      );




      const tx = await contract.verifyIdentity(holderAddr, vcHash);
      const receipt = await tx.wait();


      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "IdentityVerified"
      );

      let isValid = false;
      let reason = "Không xác định";

      if (event) {
        isValid = event.args[3];
        reason = event.args[4];
      } else {

        const [valid, res] = await contract.verifyIdentity.staticCall(holderAddr, vcHash);
        isValid = valid;
        reason = res;
      }

      setVerifyStatus({
        valid: isValid,
        reason: reason,
        details: parsed
      });

    } catch (e) {
      setVerifyStatus({
        valid: false,
        reason: e.reason || e.message,
        details: null
      });
    }

    setLoading(false);
  }

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div className="page-header">
        <div className="page-badge badge-verifier"> VERIFIER</div>
        <h1 className="page-title">Xác thực Danh tính</h1>
        <p className="page-subtitle">
          Nhập Verifiable Presentation (VP) do ứng viên cung cấp để kiểm tra tính hợp lệ trên Blockchain.
          <br />
          <span style={{ color: "var(--green)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            Ví kiểm định: {shortAddr(account)}
          </span>
        </p>
      </div>

      <div className="card-grid">
        { }
        <div className="card">
          <div className="card-title"> Nhập dữ liệu Verifiable Presentation</div>

          <div className="form-group">
            <label className="form-label">Dán mã JSON hoặc Compact VP từ QR</label>
            <textarea
              className="form-textarea"
              placeholder='{"@context": [...], "type": "VerifiablePresentation", ...}'
              value={vpInput}
              onChange={(e) => setVpInput(e.target.value)}
              style={{ minHeight: "240px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
            />
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> Đang kiểm tra trên Blockchain...</> : " Bắt đầu Xác thực"}
          </button>
        </div>

        { }
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title"> Kết quả Kiểm định</div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {!verifyStatus && !loading && (
              <div className="empty-state">
                <div className="empty-state-icon">️</div>
                Nhập VP và nhấn Xác thực để xem kết quả.
              </div>
            )}

            {loading && (
              <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                <span className="spinner" style={{ width: 30, height: 30, borderWidth: 3, marginBottom: 16 }} />
                <p>Đang đối chiếu Hash với Smart Contract...</p>
              </div>
            )}

            {verifyStatus && !loading && (
              <div className={`verify-result ${verifyStatus.valid ? "valid" : "invalid"}`}>
                <div className="verify-icon">
                  {verifyStatus.valid ? "" : ""}
                </div>
                <h3 className="verify-title" style={{ color: verifyStatus.valid ? "var(--green)" : "var(--red)" }}>
                  {verifyStatus.valid ? "HỢP LỆ" : "KHÔNG HỢP LỆ"}
                </h3>
                <p className="verify-reason">{verifyStatus.reason}</p>

                {verifyStatus.valid && verifyStatus.details && verifyStatus.details.verifiableCredential && (
                  <div style={{ marginTop: 24, textAlign: "left", background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12 }}>
                    <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 12 }}>Thông tin trích xuất:</h4>

                    {(() => {
                      const vc = verifyStatus.details.verifiableCredential[0];
                      const subj = vc.credentialSubject;
                      return (
                        <>
                          <div className="info-row" style={{ padding: "6px 0", border: "none" }}>
                            <span className="info-label">Chứng chỉ:</span>
                            <span className="info-value">{vc.type[1] || vc.type[0]}</span>
                          </div>
                          <div className="info-row" style={{ padding: "6px 0", border: "none" }}>
                            <span className="info-label">Họ tên:</span>
                            <span className="info-value">{subj.studentName}</span>
                          </div>
                          <div className="info-row" style={{ padding: "6px 0", border: "none" }}>
                            <span className="info-label">MSSV:</span>
                            <span className="info-value">{subj.studentId}</span>
                          </div>
                          <div className="info-row" style={{ padding: "6px 0", border: "none" }}>
                            <span className="info-label">Ngành học:</span>
                            <span className="info-value">{subj.major}</span>
                          </div>
                          <div className="info-row" style={{ padding: "6px 0", border: "none" }}>
                            <span className="info-label">DID:</span>
                            <span className="info-value info-mono">{subj.id}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {verifyStatus.valid && (!verifyStatus.details || !verifyStatus.details.verifiableCredential) && (
                  <div style={{ marginTop: 24, textAlign: "left", background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 12 }}>
                    <p style={{ fontSize: 13, color: "var(--green)", textAlign: "center" }}>Xác thực thành công qua Compact VP (QR Code).</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
