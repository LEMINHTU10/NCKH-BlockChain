import { network } from "hardhat";

async function main() {
  console.log(" Bắt đầu deploy toàn bộ hệ thống DID...\n");

  const { ethers, networkName } = await network.create();
  console.log(` Mạng: ${networkName}`);

  const [deployer] = await ethers.getSigners();
  console.log(` Deployer: ${deployer.address}\n`);

  
  console.log(" [1/3] Deploying DIDRegistry...");
  const didRegistry = await ethers.deployContract("DIDRegistry");
  await didRegistry.waitForDeployment();
  const didAddress = await didRegistry.getAddress();
  console.log(`    DIDRegistry:         ${didAddress}`);

  
  console.log(" [2/3] Deploying CredentialRegistry...");
  const credRegistry = await ethers.deployContract("CredentialRegistry");
  await credRegistry.waitForDeployment();
  const credAddress = await credRegistry.getAddress();
  console.log(`    CredentialRegistry:  ${credAddress}`);

  
  console.log(" [3/3] Deploying IdentityVerifier...");
  const identityVerifier = await ethers.deployContract("IdentityVerifier", [
    didAddress,
    credAddress,
  ]);
  await identityVerifier.waitForDeployment();
  const verifierAddress = await identityVerifier.getAddress();
  console.log(`    IdentityVerifier:    ${verifierAddress}`);

  
  console.log("\n===========================================================");
  console.log("  TRIỂN KHAI TOÀN BỘ THÀNH CÔNG!");
  console.log("===========================================================");
  console.log(`  Mạng                 : ${networkName}`);
  console.log(`  DIDRegistry          : ${didAddress}`);
  console.log(`  CredentialRegistry   : ${credAddress}`);
  console.log(`  IdentityVerifier     : ${verifierAddress}`);
  console.log("===========================================================");
  console.log("\n Lưu các địa chỉ trên vào file .env để dùng trong Frontend!");
}

main().catch((error) => {
  console.error(" Lỗi deploy:", error);
  process.exitCode = 1;
});