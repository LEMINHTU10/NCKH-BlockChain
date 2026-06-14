import { network } from "hardhat";

async function main() {
  const { ethers } = await (network as any).create();

  console.log("==================================================");
  console.log(" BẮT ĐẦU KỊCH BẢN MÔ PHỎNG TẤN CÔNG REPLAY ATTACK");
  console.log("==================================================");

  // 1. Khởi tạo các tài khoản
  const [deployer, issuer, holder, attacker] = await ethers.getSigners();
  console.log(`[+] Deployer: ${deployer.address}`);
  console.log(`[+] Issuer: ${issuer.address}`);
  console.log(`[+] Holder: ${holder.address}`);
  console.log(`[+] Attacker: ${attacker.address} (Hacker)`);
  console.log("--------------------------------------------------");

  // 2. Deploy Smart Contract mới để test
  console.log("[1] Đang triển khai CredentialRegistry...");

  // Sử dụng Wallet thực tế từ Private Key để có thể lấy được chữ ký Raw Transaction
  const issuerWallet = new ethers.Wallet("0x686f1268a22265ea495b6c3b01924f611b60eceb2188c06850152d03029cfb49", ethers.provider);
  const deployerWallet = new ethers.Wallet("0x3f8a8fbb57a4e9be12c4b461e3d604d7e4bfde4d483cdff6fb3659ce293ac435", ethers.provider);

  // Phải chuyển ETH cho các ví thật để có phí gas
  await deployer.sendTransaction({ to: deployerWallet.address, value: ethers.parseEther("10.0") });
  await deployer.sendTransaction({ to: issuerWallet.address, value: ethers.parseEther("10.0") });

  const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.connect(deployerWallet).deploy();
  await credentialRegistry.waitForDeployment();
  const contractAddress = await credentialRegistry.getAddress();
  console.log(`    -> Thành công tại: ${contractAddress}`);

  // 3. Phân quyền cho Issuer
  console.log("[2] Phân quyền cho Issuer...");
  await credentialRegistry.connect(deployerWallet).authorizeIssuer(issuerWallet.address);
  console.log("    -> Thành công!");

  // 4. Tạo dữ liệu để Issue
  const credentialHash = ethers.id("BangTotNghiep_DH_BK");
  const credentialType = "UniversityDegree";
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 năm

  // 5. Issuer xây dựng một Transaction để cấp bằng (Chưa gửi)
  console.log("\n[3] Issuer chuẩn bị giao dịch cấp bằng (Transaction)...");

  // Lấy Nonce hiện tại của Issuer
  const nonce = await issuerWallet.getNonce();
  const feeData = await ethers.provider.getFeeData();

  // Xây dựng raw transaction object
  const txRequest = await credentialRegistry.connect(issuerWallet).getFunction("issueCredential").populateTransaction(
    holder.address,
    credentialHash,
    credentialType,
    expiresAt
  );

  // Đóng gói và Ký giao dịch (Tạo ra Raw Transaction/Signed Transaction)
  const signedTx = await issuerWallet.signTransaction({
    ...txRequest,
    nonce: nonce,
    gasLimit: 500000n,
    gasPrice: feeData.gasPrice,
    chainId: 31337n,
  });
  console.log("    -> Issuer đã ký giao dịch. Dữ liệu Raw Signed TX:");
  console.log(`       ${signedTx.substring(0, 64)}...`);

  // 6. Gửi giao dịch hợp lệ lần 1
  console.log("\n[4] Issuer gửi giao dịch lên mạng lưới...");
  const txResponse = await ethers.provider.broadcastTransaction(signedTx);
  await txResponse.wait();
  console.log("    -> Giao dịch thành công! Sinh viên đã nhận được bằng.");

  // =========================================================================
  // KỊCH BẢN TẤN CÔNG (REPLAY ATTACK)
  // =========================================================================
  console.log("\n==================================================");
  console.log(" ⚠️ BẮT ĐẦU TẤN CÔNG PHÁT LẠI (REPLAY ATTACK) ⚠️");
  console.log("==================================================");
  console.log("[5] Hacker bắt được gói tin giao dịch trên mạng (Raw Signed TX).");
  console.log("[6] Hacker cố gắng nạp lại (broadcast) giao dịch này để cấp thêm bằng sai trái...");

  try {
    // Hacker lấy chính cái SignedTx hợp lệ lúc nãy và gửi lại
    await ethers.provider.broadcastTransaction(signedTx);
    console.log(" LỖI BẢO MẬT: Giao dịch đã bị phát lại thành công! Hệ thống có lỗ hổng!");
  } catch (error: any) {
    console.log(" HỆ THỐNG ĐÃ PHÒNG THỦ THÀNH CÔNG!");
    console.log("   Chi tiết lỗi Blockchain chặn Hacker:");
    console.log(`   -> ${error.message.split('(')[0].trim()}`);
    console.log("\n[KẾT LUẬN] Mạng EVM đã kiểm tra Nonce (số thứ tự giao dịch).");
    console.log("Vì Nonce này đã được Issuer sử dụng ở Bước 4, nên Hacker không thể dùng lại Raw TX cũ.");
    console.log("Smart Contract dùng msg.sender -> An toàn tuyệt đối trước Replay Attack nội chuỗi!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
