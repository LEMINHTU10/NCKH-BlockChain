import { expect } from "chai";
import hre from "hardhat";
import { ethers as EthersLib } from "ethers";

const { ethers } = await hre.network.create();

// ===========================================================================
// TEST SUITE: IdentityVerifier (end-to-end integration)
// ===========================================================================
describe("IdentityVerifier", function () {
  let didRegistry: Awaited<ReturnType<typeof ethers.deployContract>>;
  let credRegistry: Awaited<ReturnType<typeof ethers.deployContract>>;
  let identityVerifier: Awaited<ReturnType<typeof ethers.deployContract>>;

  let owner: Awaited<ReturnType<typeof ethers.getSigner>>;
  let issuer: Awaited<ReturnType<typeof ethers.getSigner>>;
  let holder: Awaited<ReturnType<typeof ethers.getSigner>>;
  let verifier: Awaited<ReturnType<typeof ethers.getSigner>>;
  let stranger: Awaited<ReturnType<typeof ethers.getSigner>>;

  const SAMPLE_HASH: string = EthersLib.keccak256(
    EthersLib.toUtf8Bytes("degree_vc_holder_2025")
  );
  const CRED_TYPE = "BachelorDegree";

  // -------------------------------------------------------------------------
  // Setup: deploy 3 contracts và cấu hình môi trường
  // -------------------------------------------------------------------------
  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner    = signers[0];
    issuer   = signers[1];
    holder   = signers[2];
    verifier = signers[3];
    stranger = signers[4];

    // 1. Deploy DIDRegistry
    didRegistry = await ethers.deployContract("DIDRegistry");
    await didRegistry.waitForDeployment();

    // 2. Deploy CredentialRegistry
    credRegistry = await ethers.deployContract("CredentialRegistry");
    await credRegistry.waitForDeployment();

    // 3. Deploy IdentityVerifier với địa chỉ 2 contract trên
    identityVerifier = await ethers.deployContract("IdentityVerifier", [
      await didRegistry.getAddress(),
      await credRegistry.getAddress(),
    ]);
    await identityVerifier.waitForDeployment();

    // 4. Cấp quyền Issuer cho account[1]
    await credRegistry.connect(owner).authorizeIssuer(issuer.address);
  });

  // ===========================================================================
  // Nhóm 1: Constructor / Deploy
  // ===========================================================================
  describe("Constructor", function () {
    it("Luu dung dia chi DIDRegistry va CredentialRegistry", async function () {
      const didAddr  = await identityVerifier.didRegistry();
      const credAddr = await identityVerifier.credentialRegistry();

      expect(didAddr).to.equal(await didRegistry.getAddress());
      expect(credAddr).to.equal(await credRegistry.getAddress());
    });

    it("Deploy that bai neu dia chi DIDRegistry la zero address", async function () {
      await expect(
        ethers.deployContract("IdentityVerifier", [
          "0x0000000000000000000000000000000000000000",
          await credRegistry.getAddress(),
        ])
      ).to.be.revertedWith("DIDRegistry address khong hop le");
    });

    it("Deploy that bai neu dia chi CredentialRegistry la zero address", async function () {
      await expect(
        ethers.deployContract("IdentityVerifier", [
          await didRegistry.getAddress(),
          "0x0000000000000000000000000000000000000000",
        ])
      ).to.be.revertedWith("CredentialRegistry address khong hop le");
    });
  });

  // ===========================================================================
  // Nhóm 2: Xác thực danh tính thành công (Happy Path)
  // ===========================================================================
  describe("verifyIdentity - Happy Path", function () {
    beforeEach(async function () {
      // Holder đăng ký DID
      await didRegistry
        .connect(holder)
        .registerDID("pubkey_holder", "https://holder.service.io");

      // Issuer phát hành VC cho Holder
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);
    });

    it("Xac thuc thanh cong khi DID active va VC hop le", async function () {
      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, SAMPLE_HASH);

      expect(valid).to.equal(true);
      expect(reason).to.equal("Danh tinh hop le");
    });

    it("IdentityVerified event duoc phat ra voi ket qua true", async function () {
      await expect(
        identityVerifier
          .connect(verifier)
          .verifyIdentity(holder.address, SAMPLE_HASH)
      ).to.emit(identityVerifier, "IdentityVerified");
    });

    it("Audit log duoc ghi sau khi xac thuc", async function () {
      await identityVerifier
        .connect(verifier)
        .verifyIdentity(holder.address, SAMPLE_HASH);

      const count = await identityVerifier.getAuditLogCount();
      expect(count).to.equal(1n);

      const record = await identityVerifier.getAuditRecord(0n);
      expect(record.verifier).to.equal(verifier.address);
      expect(record.holder).to.equal(holder.address);
      expect(record.result).to.equal(true);
    });
  });

  // ===========================================================================
  // Nhóm 3: Xác thực thất bại (Failure Cases)
  // ===========================================================================
  describe("verifyIdentity - Failure Cases", function () {
    it("That bai khi Holder chua dang ky DID", async function () {
      // Issue VC nhưng Holder chưa có DID
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);

      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, SAMPLE_HASH);

      expect(valid).to.equal(false);
      expect(reason).to.include("DID khong ton tai");
    });

    it("That bai khi DID da bi vo hieu hoa", async function () {
      await didRegistry.connect(holder).registerDID("pk", "svc");
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);

      // Holder deactivate DID
      await didRegistry.connect(holder).deactivateDID();

      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, SAMPLE_HASH);

      expect(valid).to.equal(false);
      expect(reason).to.include("DID khong ton tai");
    });

    it("That bai khi VC khong ton tai", async function () {
      await didRegistry.connect(holder).registerDID("pk", "svc");

      const fakeHash = EthersLib.keccak256(EthersLib.toUtf8Bytes("fake_hash"));
      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, fakeHash);

      expect(valid).to.equal(false);
      expect(reason).to.equal("VC khong ton tai");
    });

    it("That bai khi VC da bi thu hoi", async function () {
      await didRegistry.connect(holder).registerDID("pk", "svc");
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);
      await credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH);

      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, SAMPLE_HASH);

      expect(valid).to.equal(false);
      expect(reason).to.equal("VC da bi thu hoi");
    });

    it("That bai khi VC khong thuoc ve Holder nay", async function () {
      // Holder đăng ký DID
      await didRegistry.connect(holder).registerDID("pk_holder", "svc_holder");

      // Nhưng VC được phát hành cho stranger (không phải holder)
      await didRegistry.connect(stranger).registerDID("pk_stranger", "svc_stranger");
      await credRegistry
        .connect(issuer)
        .issueCredential(stranger.address, SAMPLE_HASH, CRED_TYPE, 0n);

      // Xác thực holder với VC của stranger → thất bại
      const [valid, reason] = await identityVerifier
        .connect(verifier)
        .verifyIdentity.staticCall(holder.address, SAMPLE_HASH);

      expect(valid).to.equal(false);
      expect(reason).to.include("khong thuoc ve Holder");
    });
  });

  // ===========================================================================
  // Nhóm 4: Kiểm tra thu hồi nhanh (checkRevocation)
  // ===========================================================================
  describe("checkRevocation", function () {
    it("Tra ve false khi VC chua bi thu hoi", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);

      const revoked = await identityVerifier.checkRevocation(SAMPLE_HASH);
      expect(revoked).to.equal(false);
    });

    it("Tra ve true sau khi VC bi thu hoi", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);
      await credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH);

      const revoked = await identityVerifier.checkRevocation(SAMPLE_HASH);
      expect(revoked).to.equal(true);
    });
  });

  // ===========================================================================
  // Nhóm 5: Audit Log
  // ===========================================================================
  describe("Audit Log", function () {
    it("Audit log trong ban dau", async function () {
      const count = await identityVerifier.getAuditLogCount();
      expect(count).to.equal(0n);
    });

    it("Tang them moi lan xac thuc (ca thanh cong va that bai)", async function () {
      await didRegistry.connect(holder).registerDID("pk", "svc");
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);

      // Xác thực thành công
      await identityVerifier
        .connect(verifier)
        .verifyIdentity(holder.address, SAMPLE_HASH);

      // Xác thực thất bại (hash giả)
      const fakeHash = EthersLib.keccak256(EthersLib.toUtf8Bytes("fake"));
      await identityVerifier
        .connect(verifier)
        .verifyIdentity(holder.address, fakeHash);

      const count = await identityVerifier.getAuditLogCount();
      expect(count).to.equal(2n);
    });

    it("getAuditRecord tra ve dung thong tin", async function () {
      await didRegistry.connect(holder).registerDID("pk", "svc");
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, CRED_TYPE, 0n);

      await identityVerifier
        .connect(verifier)
        .verifyIdentity(holder.address, SAMPLE_HASH);

      const record = await identityVerifier.getAuditRecord(0n);
      expect(record.verifier).to.equal(verifier.address);
      expect(record.holder).to.equal(holder.address);
      expect(record.credentialHash).to.equal(SAMPLE_HASH);
      expect(record.result).to.equal(true);
    });

    it("getAuditRecord revert khi index vuot qua gioi han", async function () {
      await expect(
        identityVerifier.getAuditRecord(999n)
      ).to.be.revertedWith("Index vuot qua gioi han");
    });
  });
});
