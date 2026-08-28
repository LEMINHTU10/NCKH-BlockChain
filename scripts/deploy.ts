import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Bắt đầu deploy toàn bộ hệ thống DID...\n");

  const { ethers, networkName } = await network.create();
  console.log(`🌐 Mạng: ${networkName}`);

  const [deployer] = await ethers.getSigners();
  console.log(`👑 Deployer (Owner/Tester): ${deployer.address}\n`);

  // 1. Deploy DIDRegistry
  console.log("📄 [1/3] Deploying DIDRegistry...");
  const didRegistry = await ethers.deployContract("DIDRegistry");
  await didRegistry.waitForDeployment();
  const didAddress = await didRegistry.getAddress();
  console.log(`   DIDRegistry:         ${didAddress}`);

  // 2. Deploy CredentialRegistry
  console.log("📜 [2/3] Deploying CredentialRegistry...");
  const credRegistry = await ethers.deployContract("CredentialRegistry");
  await credRegistry.waitForDeployment();
  const credAddress = await credRegistry.getAddress();
  console.log(`   CredentialRegistry:  ${credAddress}`);

  // Cấp quyền luôn cho ví issuer (Index 2 trong Ganache)
  const issuerAddress = "0x66DDCE608B67a5341d6F788d72A5b0E5AA9c4adc";
  console.log(`🔑 Cấp quyền Issuer cho ví: ${issuerAddress}...`);
  const txAuth = await credRegistry.authorizeIssuer(issuerAddress);
  await txAuth.wait();
  console.log(`   ✅ Đã cấp quyền Issuer cho ${issuerAddress}`);

  // 3. Deploy IdentityVerifier
  console.log("🔍 [3/3] Deploying IdentityVerifier...");
  const identityVerifier = await ethers.deployContract("IdentityVerifier", [
    didAddress,
    credAddress,
  ]);
  await identityVerifier.waitForDeployment();
  const verifierAddress = await identityVerifier.getAddress();
  console.log(`   IdentityVerifier:    ${verifierAddress}`);

  console.log("\n===========================================================");
  console.log("🎉 TRIỂN KHAI TOÀN BỘ THÀNH CÔNG!");
  console.log("===========================================================");
  console.log(`  DIDRegistry          : ${didAddress}`);
  console.log(`  CredentialRegistry   : ${credAddress}`);
  console.log(`  IdentityVerifier     : ${verifierAddress}`);
  console.log(`  Owner / Tester       : ${deployer.address} (Đã có quyền)`);
  console.log(`  Authorized Issuer    : ${issuerAddress} (Đã cấp quyền)`);
  console.log("===========================================================");

  // Tự động cập nhật vào did-frontend/src/utils/contracts.js
  const frontendContractsPath = path.resolve("did-frontend/src/utils/contracts.js");
  if (fs.existsSync(frontendContractsPath)) {
    let contractsContent = fs.readFileSync(frontendContractsPath, "utf-8");
    contractsContent = contractsContent.replace(
      /DID_REGISTRY:\s*"0x[0-9a-fA-F]+"/,
      `DID_REGISTRY:          "${didAddress}"`
    );
    contractsContent = contractsContent.replace(
      /CREDENTIAL_REGISTRY:\s*"0x[0-9a-fA-F]+"/,
      `CREDENTIAL_REGISTRY:   "${credAddress}"`
    );
    contractsContent = contractsContent.replace(
      /IDENTITY_VERIFIER:\s*"0x[0-9a-fA-F]+"/,
      `IDENTITY_VERIFIER:     "${verifierAddress}"`
    );
    fs.writeFileSync(frontendContractsPath, contractsContent, "utf-8");
    console.log("✅ Đã tự động cập nhật địa chỉ Contract mới vào did-frontend/src/utils/contracts.js");
  }
}

main().catch((error) => {
  console.error("❌ Lỗi deploy:", error);
  process.exitCode = 1;
});
