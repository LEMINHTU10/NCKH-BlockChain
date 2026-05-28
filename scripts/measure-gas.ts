import { network } from "hardhat";

async function main() {
  console.log(" Bắt đầu đo lường Gas Cost cho các thao tác chính...\n");

  const { ethers } = await network.create();
  const [deployer, issuer, holder, verifier] = await ethers.getSigners();
  const gasData: { Hành_động: string; Gas_sử_dụng: string }[] = [];

  // Hàm helper để đo gas
  async function recordGas(actionName: string, tx: any) {
    const receipt = await tx.wait();
    gasData.push({
      Hành_động: actionName,
      Gas_sử_dụng: receipt.gasUsed.toString(),
    });
  }

  // 1. Deploy DIDRegistry
  console.log("Đang đo: Deploy DIDRegistry...");
  const didRegistry = await ethers.deployContract("DIDRegistry");
  await recordGas("Deploy DIDRegistry", didRegistry.deploymentTransaction());

  // 2. Deploy CredentialRegistry
  console.log("Đang đo: Deploy CredentialRegistry...");
  const credRegistry = await ethers.deployContract("CredentialRegistry");
  await recordGas("Deploy CredentialRegistry", credRegistry.deploymentTransaction());

  // 3. Deploy IdentityVerifier
  console.log("Đang đo: Deploy IdentityVerifier...");
  const didAddress = await didRegistry.getAddress();
  const credAddress = await credRegistry.getAddress();
  const identityVerifier = await ethers.deployContract("IdentityVerifier", [didAddress, credAddress]);
  await recordGas("Deploy IdentityVerifier", identityVerifier.deploymentTransaction());

  // 4. Đăng ký DID
  console.log("Đang đo: Đăng ký DID...");
  const registerTx = await didRegistry.connect(holder).registerDID("pk_test_123", "https://example.com/did");
  await recordGas("Đăng ký DID (Holder)", registerTx);

  // 5. Cấp quyền Issuer
  console.log("Đang đo: Cấp quyền Issuer...");
  const authorizeTx = await credRegistry.connect(deployer).authorizeIssuer(issuer.address);
  await recordGas("Cấp quyền Issuer (Owner)", authorizeTx);

  // 6. Cấp chứng chỉ (Issue Credential)
  console.log("Đang đo: Cấp chứng chỉ...");
  const credHash = ethers.id("Credential Data 123");
  const expireDate = Math.floor(Date.now() / 1000) + 3600; // Hết hạn sau 1 giờ
  const issueTx = await credRegistry.connect(issuer).issueCredential(holder.address, credHash, "Student ID", expireDate);
  await recordGas("Cấp chứng chỉ (Issuer)", issueTx);

  // 7. Xác minh danh tính (Verify Identity)
  console.log("Đang đo: Xác minh danh tính...");
  const verifyTx = await identityVerifier.connect(verifier).verifyIdentity(holder.address, credHash);
  await recordGas("Xác minh danh tính (Verifier)", verifyTx);

  // 8. Thu hồi chứng chỉ (Revoke Credential)
  console.log("Đang đo: Thu hồi chứng chỉ...");
  const revokeTx = await credRegistry.connect(issuer).revokeCredential(credHash);
  await recordGas("Thu hồi chứng chỉ (Issuer)", revokeTx);

  // In bảng kết quả
  console.log("\n================ KẾT QUẢ ĐO GAS COST ================\n");
  console.table(gasData);
  console.log("\n(Bạn có thể sao chép bảng trên vào báo cáo nghiên cứu)\n");
}

main().catch((error) => {
  console.error("Lỗi:", error);
  process.exitCode = 1;
});
