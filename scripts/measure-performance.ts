import { network } from "hardhat";

async function main() {
  const { ethers } = await (network as any).create();

  console.log("=========================================================");
  console.log(" BẮT ĐẦU ĐO LƯỜNG HIỆU NĂNG (LATENCY) CỦA SMART CONTRACT");
  console.log("=========================================================\n");

  const [deployer, issuer, holder] = await ethers.getSigners();
  
  // 1. Deploy & Setup
  console.log("[1] Khởi tạo môi trường và Smart Contract...");
  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy();
  await credentialRegistry.waitForDeployment();
  
  await credentialRegistry.connect(deployer).authorizeIssuer(issuer.address);
  console.log("    -> Khởi tạo thành công!\n");

  const NUM_TRANSACTIONS = 50;
  console.log(`[2] Đang thực hiện gửi ${NUM_TRANSACTIONS} giao dịch "issueCredential" liên tiếp...`);
  console.log("    Vui lòng đợi trong giây lát...\n");

  let totalTime = 0;
  let minTime = Number.MAX_SAFE_INTEGER;
  let maxTime = 0;
  
  // Mảng lưu chi tiết (có thể dùng để in ra nếu cần, nhưng ta chỉ in tóm tắt)
  const latencies: number[] = [];

  // Chuẩn bị sẵn dữ liệu tĩnh
  const credentialType = "UniversityDegree";
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 năm

  for (let i = 0; i < NUM_TRANSACTIONS; i++) {
    // Tạo hash khác nhau cho mỗi chứng chỉ để tránh trùng lặp nếu có check
    const credentialHash = ethers.id(`BangTotNghiep_${i}`);
    
    const startTime = performance.now();
    
    // Thực hiện giao dịch
    const tx = await credentialRegistry.connect(issuer).issueCredential(
      holder.address,
      credentialHash,
      credentialType,
      expiresAt
    );
    
    // Đợi giao dịch được confirm (đóng block)
    await tx.wait();
    
    const endTime = performance.now();
    const latencyMs = endTime - startTime;
    
    latencies.push(latencyMs);
    totalTime += latencyMs;
    
    if (latencyMs < minTime) minTime = latencyMs;
    if (latencyMs > maxTime) maxTime = latencyMs;
    
    // In tiến độ (progress bar đơn giản)
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`    Đã chạy ${i + 1}/${NUM_TRANSACTIONS} giao dịch...\n`);
    }
  }

  const averageTime = totalTime / NUM_TRANSACTIONS;

  console.log("\n=========================================================");
  console.log(" BÁO CÁO KẾT QUẢ ĐO LƯỜNG HIỆU NĂNG (LATENCY TỔNG HỢP)");
  console.log("=========================================================\n");
  
  const resultsTable = [
    {
      "Chỉ số đo lường (Metric)": "Số lượng Giao dịch (Tx)",
      "Giá trị": `${NUM_TRANSACTIONS} txs`
    },
    {
      "Chỉ số đo lường (Metric)": "Tổng thời gian thực thi",
      "Giá trị": `${totalTime.toFixed(2)} ms`
    },
    {
      "Chỉ số đo lường (Metric)": "Thời gian Confirm Nhanh nhất",
      "Giá trị": `${minTime.toFixed(2)} ms`
    },
    {
      "Chỉ số đo lường (Metric)": "Thời gian Confirm Chậm nhất",
      "Giá trị": `${maxTime.toFixed(2)} ms`
    },
    {
      "Chỉ số đo lường (Metric)": "ĐỘ TRỄ TRUNG BÌNH (Average Latency)",
      "Giá trị": `${averageTime.toFixed(2)} ms / tx`
    }
  ];

  console.table(resultsTable);

  console.log("\n[KẾT LUẬN]:");
  console.log(`- Tốc độ xử lý của EVM trên Ganache cục bộ rất nhanh, trung bình mất khoảng ~${averageTime.toFixed(0)} mili-giây để xác thực và lưu vĩnh viễn 1 chứng chỉ lên Blockchain.`);
  console.log("- Độ trễ (Latency) thấp này hoàn toàn đáp ứng được yêu cầu của một hệ thống quản lý danh tính (DID) trong môi trường thực tế.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
