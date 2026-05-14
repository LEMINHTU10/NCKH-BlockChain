import { expect } from "chai";
import hre from "hardhat";

// Lấy ethers và networkHelpers từ Hardhat Runtime Environment (Hardhat 3 pattern)
const { ethers } = await hre.network.create();

// ===========================================================================
// TEST SUITE: DIDRegistry
// ===========================================================================
describe("DIDRegistry", function () {
  // -------------------------------------------------------------------------
  // Biến dùng chung trong mỗi test
  // -------------------------------------------------------------------------
  let didRegistry: Awaited<ReturnType<typeof ethers.deployContract>>;
  let issuer: Awaited<ReturnType<typeof ethers.getSigner>>;
  let holder: Awaited<ReturnType<typeof ethers.getSigner>>;
  let verifier: Awaited<ReturnType<typeof ethers.getSigner>>;

  // Deploy một instance mới trước mỗi test để đảm bảo trạng thái sạch
  beforeEach(async function () {
    const signers = await ethers.getSigners();
    issuer   = signers[0];
    holder   = signers[1];
    verifier = signers[2];

    didRegistry = await ethers.deployContract("DIDRegistry");
    await didRegistry.waitForDeployment();
  });

  // ===========================================================================
  // Nhóm 1: Đăng ký DID (registerDID)
  // ===========================================================================
  describe("registerDID", function () {
    it("Holder co the dang ky DID moi", async function () {
      await didRegistry
        .connect(holder)
        .registerDID("pubkey_abc123", "https://service.example.com");

      const doc = await didRegistry.resolveDID(holder.address);

      expect(doc.isActive).to.equal(true);
      expect(doc.owner).to.equal(holder.address);
      expect(doc.publicKey).to.equal("pubkey_abc123");
      expect(doc.serviceEndpoint).to.equal("https://service.example.com");
      expect(doc.did).to.include("did:ethr:");
    });

    it("DIDRegistered event duoc phat ra khi dang ky thanh cong", async function () {
      const tx = didRegistry
        .connect(holder)
        .registerDID("pubkey_xyz", "https://svc.io");

      // Chỉ kiểm tra event tồn tại (không kiểm tra tham số DID vì phụ thuộc vào địa chỉ động)
      await expect(tx).to.emit(didRegistry, "DIDRegistered");
    });

    it("Khong the dang ky DID lan thu 2 khi DID dang active", async function () {
      await didRegistry
        .connect(holder)
        .registerDID("pk1", "svc1");

      await expect(
        didRegistry.connect(holder).registerDID("pk2", "svc2")
      ).to.be.revertedWith("DID da ton tai va dang hoat dong");
    });

    it("Moi nguoi dung co the dang ky DID doc lap", async function () {
      await didRegistry.connect(holder).registerDID("pk_holder", "svc_holder");
      await didRegistry.connect(verifier).registerDID("pk_verifier", "svc_verifier");

      const docHolder   = await didRegistry.resolveDID(holder.address);
      const docVerifier = await didRegistry.resolveDID(verifier.address);

      expect(docHolder.isActive).to.equal(true);
      expect(docVerifier.isActive).to.equal(true);
      expect(docHolder.owner).to.not.equal(docVerifier.owner);
    });
  });

  // ===========================================================================
  // Nhóm 2: Cập nhật DID (updateDIDDocument)
  // ===========================================================================
  describe("updateDIDDocument", function () {
    beforeEach(async function () {
      // Đăng ký DID ban đầu
      await didRegistry.connect(holder).registerDID("pk_v1", "svc_v1");
    });

    it("Owner co the cap nhat DID Document", async function () {
      await didRegistry
        .connect(holder)
        .updateDIDDocument("pk_v2", "https://newservice.com");

      const doc = await didRegistry.resolveDID(holder.address);
      expect(doc.publicKey).to.equal("pk_v2");
      expect(doc.serviceEndpoint).to.equal("https://newservice.com");
    });

    it("DIDUpdated event duoc phat ra khi cap nhat", async function () {
      await expect(
        didRegistry.connect(holder).updateDIDDocument("pk_new", "svc_new")
      ).to.emit(didRegistry, "DIDUpdated");
    });

    it("Nguoi khac khong the cap nhat DID cua Holder", async function () {
      await expect(
        didRegistry.connect(issuer).updateDIDDocument("pk_hacked", "svc_hacked")
      ).to.be.revertedWith("Khong phai chu so huu DID");
    });
  });

  // ===========================================================================
  // Nhóm 3: Vô hiệu hóa DID (deactivateDID)
  // ===========================================================================
  describe("deactivateDID", function () {
    beforeEach(async function () {
      await didRegistry.connect(holder).registerDID("pk_active", "svc_active");
    });

    it("Owner co the vo hieu hoa DID cua chinh minh", async function () {
      await didRegistry.connect(holder).deactivateDID();
      const doc = await didRegistry.resolveDID(holder.address);
      expect(doc.isActive).to.equal(false);
    });

    it("DIDDeactivated event duoc phat ra", async function () {
      await expect(
        didRegistry.connect(holder).deactivateDID()
      ).to.emit(didRegistry, "DIDDeactivated");
    });

    it("Nguoi khac khong the deactivate DID cua Holder", async function () {
      await expect(
        didRegistry.connect(issuer).deactivateDID()
      ).to.be.revertedWith("Khong phai chu so huu DID");
    });

    it("Khong the deactivate DID da bi vo hieu hoa", async function () {
      await didRegistry.connect(holder).deactivateDID();
      await expect(
        didRegistry.connect(holder).deactivateDID()
      ).to.be.revertedWith("DID da bi vo hieu hoa tu truoc");
    });
  });

  // ===========================================================================
  // Nhóm 4: Tra cứu DID (resolveDID)
  // ===========================================================================
  describe("resolveDID", function () {
    it("Tra cuu DID Document cua nguoi chua dang ky tra ve trang thai inactive", async function () {
      const doc = await didRegistry.resolveDID(verifier.address);
      expect(doc.isActive).to.equal(false);
      expect(doc.owner).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Bat ky ai cung co the tra cuu DID (view function)", async function () {
      await didRegistry.connect(holder).registerDID("pk_public", "svc_public");
      // Gọi bởi verifier (người ngoài) vẫn thành công
      const doc = await didRegistry.connect(verifier).resolveDID(holder.address);
      expect(doc.isActive).to.equal(true);
    });
  });
});
