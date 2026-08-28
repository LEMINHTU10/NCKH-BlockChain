# Hệ thống Quản lý Danh tính Phân tán (DID System)

Dự án Nghiên cứu Khoa học (NCKH) xây dựng **Hệ thống Quản lý Danh tính và Văn bằng Số** dựa trên công nghệ **Blockchain (Ethereum/Ganache)** và mô hình **Danh tính Phi tập trung (DID - Decentralized Identifiers)** theo chuẩn W3C.

## 🧑‍💻 Các Thành viên Phát triển
| Thành viên | Vai trò |
|---|---|
| **Lê Minh Tú** | Viết Smart Contract & Hardhat Tests |
| **Nguyễn Xuân Vinh** | Tích hợp Backend (Web3/Ethers.js) & Hardhat Scripts |
| **Lương Hồng Anh** | Phát triển Frontend (React.js, Vite) |
| **Nguyễn Lương An** | Đóng gói Docker & Triển khai môi trường ảo hóa (Ubuntu) |
| **Duy Mạnh** | Cấu hình Mạng (Ganache), Đánh giá Hiệu năng & Bảo mật |

---

## 1. Tổng quan Kiến trúc Hệ thống

Hệ thống triển khai mô hình **3 nhà** (Issuer — Holder — Verifier) theo tiêu chuẩn Verifiable Credentials (W3C VC Data Model 1.1):

```
┌────────────────────────────────────────────────────────┐
│          BLOCKCHAIN (Ganache / Ethereum)                │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │ DIDRegistry │  │CredentialRegistry│  │ Identity  │ │
│  │  (DID Docs) │  │  (VC Hashes,     │  │ Verifier  │ │
│  │             │  │   Revocation)    │  │(Audit Log)│ │
│  └─────────────┘  └──────────────────┘  └───────────┘ │
└────────────────────────────┬───────────────────────────┘
                             │
   ┌─────────────────────────┼──────────────────────────┐
   ▼                         ▼                          ▼
🏛️ ISSUER PORTAL         👨‍🎓 HOLDER WALLET         🏢 VERIFIER PORTAL
(Trường Đại học)          (Ví Sinh viên)           (Doanh nghiệp)
- Phát hành bằng cấp     - Quản lý DID           - Xác minh bằng cấp
- Thu hồi bằng cấp       - Nhận & lưu bằng       - Không cần Gas
- Kiểm tra phân quyền    - Tạo VP & mã QR        - Audit Log on-chain
```

### Smart Contracts đã triển khai trên Ganache:
| Contract | Địa chỉ | Chức năng |
|---|---|---|
| `DIDRegistry.sol` | `0x9880870932A37d54aa77cbb217736DE4D7ABD7f1` | Đăng ký, cập nhật, hủy DID Document on-chain |
| `CredentialRegistry.sol` | `0x64841DEb1F215A615780946584DC89007Ab38A5F` | Phát hành, xác minh, thu hồi VC Hash on-chain |
| `IdentityVerifier.sol` | `0x1DC558C063E92fc8923b42d1b10D96e6370787cc` | Xác minh danh tính tổng hợp & Ghi Audit Log |

---

## 2. Phân vai trò các Tài khoản Ví (Ganache)

| Ganache Index | MetaMask | Địa chỉ | Vai trò | Quyền hạn |
|:---:|:---:|:---|:---|:---|
| 0 | `tester` | `0x3b1a1548BB15aFE1b1983DC4beF2605531C13d7A` | 👑 **Owner / Bộ GD&ĐT** (Deployer) | Cấp phép/thu hồi quyền cho Trường ĐH |
| 2 | `issuer` | `0x66DDCE608B67a5341d6F788d72A5b0E5AA9c4adc` | 🎓 **Issuer / Trường Đại học** | Phát hành & Thu hồi bằng cấp |
| 3 | `Holder` | `0x1d7115cEbE5a4ce1124686D237E2875fd762c582` | 👨‍🎓 **Holder / Sinh viên** | Lưu trữ & Xuất trình bằng cấp |
| 4 | `Verifier` | `0x28b480917ff142dB660581E58f09E4D622376C42` | 🏢 **Verifier / Doanh nghiệp** | Xác minh bằng cấp |
| 5 | — | `0x70CCE7f09E31eB297A6b56b527Dd18b9948DB9eD` | 🎓 Issuer dự phòng | Phát hành & Thu hồi bằng cấp |

---

## 3. Các Tính năng Chính

### ✅ Đã hoàn thành:
| # | Tính năng | Trạng thái |
|---|---|:---:|
| 1 | Đăng ký & quản lý DID Document on-chain | ✅ |
| 2 | Phát hành Verifiable Credential (VC) lên Blockchain | ✅ |
| 3 | Phân quyền Issuer (chỉ Trường ĐH được cấp phép mới phát hành được) | ✅ |
| 4 | Thu hồi bằng cấp real-time on-chain (Revocation) | ✅ |
| 5 | Ví sinh viên: Xem, quản lý và chia sẻ bằng cấp | ✅ |
| 6 | Xác minh bằng cấp on-chain (IdentityVerifier) | ✅ |
| 7 | Ghi Audit Log xác minh on-chain (bảo vệ pháp lý) | ✅ |
| 8 | **Tiết lộ có chọn lọc (Selective Disclosure / ZKP-lite)** | ✅ |
| 9 | **Mã QR chống phát lại có thời hạn (Time-Bound Anti-Replay VP)** | ✅ |

---

## 4. Cơ chế Khoa học Trọng tâm (Chi tiết)

### 4.1 🔐 Tiết lộ có chọn lọc (Selective Disclosure / ZKP-lite)

> **Ý nghĩa NCKH:** Sinh viên chứng minh "Đã tốt nghiệp Xuất sắc ngành CNTT" mà **không lộ** GPA, Số CCCD, Ngày sinh hay bất kỳ thông tin nhạy cảm nào cho nhà tuyển dụng.

#### Quy trình Toán học (4 bước):

**Bước 1 — Khởi tạo Salted Claims (Trường ĐH — Issuer):**
```
Với mỗi thuộc tính i (studentName, gpa, nationalId...):
  salt_i = randomBytes(32)  ← Muối ngẫu nhiên 256-bit
  claimHash_i = keccak256("attributeName:value:salt_i")
```

**Bước 2 — Tính Root Hash và Neo lên Blockchain:**
```
Sắp xếp claimHash_i theo bảng chữ cái → [h1, h2, ..., h8]
vcHash (Root Hash) = keccak256(h1 || h2 || ... || h8)
→ vcHash được lưu bất biến trên CredentialRegistry.sol
```

**Bước 3 — Sinh Selective Presentation (Sinh viên — Holder):**
```
Trường được phép tiết lộ (VD: studentName, major, classification):
  → Gửi kèm (value, salt) — Verifier tính lại được claimHash

Trường cần che giấu (VD: gpa, nationalId, dateOfBirth):
  → Chỉ gửi claimHash (Blind Hash Commitment)
  → Verifier KHÔNG có cách nào biết giá trị thực
```

**Bước 4 — Xác minh không tiết lộ (Doanh nghiệp — Verifier):**
```
Tái lập lại:
  claimHash_i (cho trường mở)  = keccak256(key:disclosed_value:salt)
  claimHash_j (cho trường ẩn)  = blindedHash (nhận trực tiếp)
  
Tính: calculatedRoot = keccak256(h1 || h2 || ... || h8)

So sánh: calculatedRoot == vcHash trên Blockchain?
  ✅ KHỚP → Bằng cấp hợp lệ (dù không biết các trường ẩn)
  ❌ LỆCH → Dữ liệu bị giả mạo → Từ chối
```

#### 3 Tầng Bảo mật Chống làm giả:
| Tầng | Cơ chế | Phát hiện khi |
|---|---|---|
| **1 — Chữ ký số (ECDSA)** | `ethers.verifyMessage(payload, signature)` | Chữ ký không khớp ví holder |
| **2 — Cam kết Salted Hash** | Tái lập Root Hash từ claim hashes | Bất kỳ thuộc tính ẩn/hiện bị sửa |
| **3 — Smart Contract on-chain** | Đối chiếu `vcHash` trên `CredentialRegistry` | Bằng không tồn tại / đã thu hồi |

---

### 4.2 ⏱️ Mã QR Chống Tấn công Phát lại (Time-Bound Anti-Replay VP)

> **Vấn đề bảo mật:** Kẻ gian có thể lấy mã QR VP của sinh viên từ Doanh nghiệp A và tái sử dụng nó để mạo danh tại Doanh nghiệp B.

#### Cơ chế chống phát lại (3 lớp):

**Lớp 1 — Thời hạn sống động (TTL / Ephemeral Expiration):**
```json
{
  "expiresAt": 1724833200000,  ← Timestamp hết hạn (VD: 15 phút sau khi tạo)
  ...
}
```
→ Khi `Date.now() > expiresAt`: Từ chối tức thì với thông báo hết hạn.

**Lớp 2 — Mã thử thách ngẫu nhiên (Cryptographic Nonce):**
```json
{
  "nonce": "0x7f3a2b9e4c1d8f05...",  ← 128-bit random, mỗi lần tạo VP là unique
  ...
}
```
→ Mỗi Verifiable Presentation là hoàn toàn duy nhất (One-Time Use).

**Lớp 3 — Khóa đối tượng nhận (Audience Binding):**
```json
{
  "audience": "FPT_SOFTWARE",  ← VP này chỉ dành cho FPT Software
  ...
}
```
→ Sinh viên có thể giới hạn VP chỉ có hiệu lực với một đơn vị nhận cụ thể.

#### Luồng hoạt động toàn bộ:
```
Sinh viên tạo VP:
  [1] Chọn trường tiết lộ + trường ẩn (Selective Disclosure)
  [2] Đặt thời hạn sống: 5 / 15 / 60 / 1440 phút
  [3] (Tùy chọn) Ghi tên đơn vị nhận: "FPT Software"
  [4] Ký số bằng private key MetaMask:
      signature = signMessage({vcHash, holder, timestamp, expiresAt, nonce, audience, disclosedKeys})
  [5] Xuất mã QR / VP JSON → Gửi cho Doanh nghiệp

Doanh nghiệp xác minh (theo thứ tự):
  [1] Parse JSON → Nhận diện VP dạng Selective Disclosure hay Legacy
  [2] Kiểm tra expiresAt > Date.now() → Từ chối nếu hết hạn
  [3] Xác thực ECDSA signature → Từ chối nếu chữ ký lỗi/giả
  [4] Tái lập Root Hash từ Disclosed + Blinded Hashes → Từ chối nếu bị sửa
  [5] Gọi IdentityVerifier.verifyIdentity(holder, vcHash) on-chain
      → Kiểm tra DID hoạt động + VC chưa thu hồi + VC thuộc đúng Holder
  [6] Ghi Audit Log on-chain (IdentityVerifier event)
  [7] Hiển thị kết quả:
      🟢 Thuộc tính được tiết lộ + xác thực
      🔒 Thuộc tính được bảo vệ quyền riêng tư (Đã ẩn an toàn)
```

---

## 5. Dữ liệu Thực nghiệm (Kết quả Đo lường Khoa học)

| Chỉ số đo lường | Giá trị thực nghiệm |
|---|---|
| Thời gian sinh Salted Claims (8 thuộc tính) | `< 1 ms` |
| Thời gian ký số VP (MetaMask) | `< 200 ms` |
| Thời gian xác minh chữ ký số (off-chain) | `< 2 ms` |
| Thời gian tái lập Root Hash toán học | `< 1 ms` |
| Thời gian gọi `issueCredential()` on-chain | `~ 70,000 gas` |
| Thời gian gọi `verifyIdentity()` on-chain | `~ 35,000 gas` |
| Thời gian gọi `revokeCredential()` on-chain | `~ 25,000 gas` |
| Dữ liệu lưu trên Blockchain | **Chỉ Hash (32 bytes)** — Không lưu thông tin cá nhân |
| Kết quả Tấn công Giả mạo thuộc tính ẩn | **Bị chặn 100%** (Root Hash bị lệch) |
| Kết quả Tấn công Phát lại sau TTL | **Bị chặn 100%** (expiresAt expired) |

---

## 6. Cấu trúc Thư mục Dự án

```
NCKH-BlockChain/
├── contracts/                       # Smart Contracts Solidity
│   ├── DIDRegistry.sol              # Quản lý DID Document
│   ├── CredentialRegistry.sol       # Quản lý Vòng đời VC (Phát hành, Thu hồi)
│   └── IdentityVerifier.sol         # Xác minh Danh tính + Ghi Audit Log
├── scripts/
│   ├── deploy.ts                    # Triển khai & Cấp quyền Issuer tự động
│   ├── test_advanced_features.ts    # Kịch bản thực nghiệm khoa học (đo lường)
│   ├── measure-gas.ts               # Đo lường tiêu thụ Gas
│   └── measure-performance.ts       # Đo lường hiệu năng hệ thống
├── did-frontend/
│   └── src/
│       ├── pages/
│       │   ├── IssuerPage.jsx       # Cổng Trường Đại học (Phát hành & Thu hồi)
│       │   ├── HolderPage.jsx       # Ví Sinh viên (Quản lý & Xuất trình VP)
│       │   └── VerifierPage.jsx     # Cổng Doanh nghiệp (Xác minh bằng cấp)
│       └── utils/
│           ├── contracts.js         # ABI & Địa chỉ Smart Contract
│           ├── web3.js              # Kết nối MetaMask & Provider
│           └── selectiveDisclosure.js  # Module Mật mã Tiết lộ có chọn lọc
├── hardhat.config.ts                # Cấu hình Hardhat & Danh sách Tài khoản Ganache
├── docker-compose.yml               # Cấu hình Docker toàn bộ hệ thống
└── deploy.sh                        # Script khởi động tự động
```

---

## 7. Yêu cầu Hệ thống & Cài đặt

### Cài đặt Development (Không Docker):
```bash
# 1. Clone và cài đặt dependencies
git clone https://github.com/LEMINHTU10/NCKH-BlockChain.git
cd NCKH-BlockChain
npm install
cd did-frontend && npm install && cd ..

# 2. Mở Ganache Desktop (port 7545)

# 3. Deploy Smart Contracts (tự động cấp quyền Issuer)
npx hardhat run scripts/deploy.ts --network ganache

# 4. Khởi động Frontend
cd did-frontend
npm run dev
# → Truy cập http://localhost:5173
```

### Cài đặt Production (Docker):
```bash
# Linux/Ubuntu:
sudo ./deploy.sh

# Windows (PowerShell):
docker-compose up -d
```

---

## 8. Chạy Thực nghiệm Khoa học

```bash
# Chạy kịch bản đo lường đầy đủ (Selective Disclosure + Anti-Replay Attack Test)
npx hardhat run scripts/test_advanced_features.ts --network ganache

# Chỉ đo lường Gas tiêu thụ
npx hardhat run scripts/measure-gas.ts --network ganache

# Đo lường hiệu năng tổng thể
npx hardhat run scripts/measure-performance.ts --network ganache
```

---

## 9. Quy trình Demo Đầy đủ cho Hội đồng NCKH

```
1. Mở Ganache → Khởi động ứng dụng → Kết nối MetaMask

2. [Trường ĐH — Tab Issuer — Ví issuer 0x66DD...]
   → Điền thông tin sinh viên: Tên, GPA, CCCD, Ngày sinh...
   → Bấm "Phát hành VC với Bảo mật Salted Claims"
   → Xác nhận giao dịch MetaMask

3. [Sinh viên — Tab Holder — Ví Holder 0x1d71...]
   → Bấm vào bằng cấp vừa nhận
   → Chọn chế độ "💼 Ứng tuyển việc làm"
     (Chỉ mở Tên, Ngành, Xếp loại — Ẩn GPA, CCCD, Ngày sinh)
   → Đặt thời hạn sống: 5 phút | Nhập đơn vị: "FPT Software"
   → Bấm "Ký số & Xuất trình Mã QR (VP)" → Sao chép VP JSON

4. [Doanh nghiệp — Tab Verifier — Ví Verifier hoặc Khách]
   → Dán VP JSON vào ô nhập
   → Bấm "Xác thực Danh tính"
   → Kết quả:
     ✅ HỢP LỆ — Lê Minh Tú | CNTT | Xuất sắc | 2026
     🔒 GPA: [Ẩn an toàn]
     🔒 CCCD: [Ẩn an toàn]
     🔒 Ngày sinh: [Ẩn an toàn]

5. [Demo Chống làm giả] Sửa một ký tự bất kỳ trong VP JSON
   → Bấm Xác thực lại → "❌ Phát hiện giả mạo"

6. [Demo Hết hạn] Đợi 5 phút sau khi tạo VP → Dán lại VP
   → "❌ Mã xuất trình (VP) đã HẾT HẠN"
```