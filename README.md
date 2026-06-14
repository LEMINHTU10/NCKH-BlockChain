# Hệ thống Quản lý Danh tính Phân tán (DID System)

Đây là dự án Nghiên cứu Khoa học (NCKH) xây dựng Hệ thống Quản lý Danh tính và Cấp phát Văn bằng dựa trên công nghệ Blockchain và mô hình Danh tính Phi tập trung (DID - Decentralized Identifiers).

## Các Thành viên Phát triển
- **Lê Minh Tú:** Viết Smart Contract & Hardhat Tests
- **Nguyễn Xuân Vinh:** Tích hợp Backend (Web3/Ethers.js) & Hardhat Scripts
- **Lương HM Anh:** Phát triển Frontend (React.js, Vite, Tailwind)
- **Nguyễn Lương An:** Đóng gói Docker & Triển khai môi trường ảo hóa (Ubuntu)
- **Duy Mạnh:** Cấu hình Mạng (Ganache), Đánh giá Hiệu năng & Bảo mật

---

## 1. Yêu cầu Hệ thống (Prerequisites)
Để chạy dự án, máy tính của bạn cần cài đặt sẵn:
- **Docker Desktop** (hoặc Docker Engine trên Linux).
- **Git** (để clone mã nguồn).

---

## 2. Hướng dẫn Cài đặt & Khởi chạy (Dành cho Giám khảo / Giảng viên)

Dự án đã được tự động hóa hoàn toàn thông qua Docker Compose. Bạn chỉ cần thực hiện 2 lệnh sau:

### Bước 1: Tải mã nguồn về máy
```bash
git clone https://github.com/LEMINHTU10/NCKH-BlockChain.git
cd NCKH-BlockChain
```

### Bước 2: Khởi động toàn bộ Hệ thống
```bash
# Trên Linux/Ubuntu:
sudo ./deploy.sh

# Trên Windows (Powershell/CMD):
docker-compose up -d
```

Sau khi chạy lệnh trên, Docker sẽ tự động:
1. Khởi tạo mạng Blockchain nội bộ (Ganache) tại port `7545`.
2. Khởi tạo giao diện Web Frontend (React) tại port `5173`.

> **Lưu ý:** Nếu chạy lần đầu tiên, Docker sẽ mất khoảng 1-2 phút để tải hình ảnh (images) Node.js và Truffle Ganache về máy. Các lần sau sẽ khởi động ngay lập tức (< 2 giây).

---

## 3. Trải nghiệm Hệ thống

- Mở trình duyệt và truy cập: **http://localhost:5173**
- Trong thư mục gốc, có sẵn file `deployed-addresses.json` và `.env` chứa các địa chỉ Smart Contract đã được deploy để frontend gọi đến.

---

## 4. Dành cho Nhà phát triển (Môi trường Dev)

Nếu bạn muốn chỉnh sửa mã nguồn hoặc chạy các kịch bản đánh giá bảo mật (Scripts):

### 4.1. Chạy các kịch bản (Scripts) đo lường
Bạn cần cài đặt Node.js, sau đó chạy:
```bash
npm install

# Đo lường Gas Cost
npx hardhat run scripts/measure-gas.ts

# Đánh giá hiệu năng (Thời gian phản hồi)
npx hardhat run scripts/measure-performance.ts

# Mô phỏng phòng thủ Replay Attack
npx hardhat run scripts/simulate-replay-attack.ts
```

### 4.2. Khởi động Frontend ở chế độ Dev
Mã nguồn thư mục `did-frontend` được mount trực tiếp vào Docker Container. Bạn có thể mở mã nguồn trên VS Code máy thật, chỉnh sửa file và giao diện Web trên Browser sẽ **tự động cập nhật (Hot-reload)** mà không cần restart Docker.

---

## Cấu trúc Thư mục Chính
- `/contracts`: Mã nguồn Smart Contract viết bằng Solidity.
- `/did-frontend`: Mã nguồn giao diện Web (React + Vite).
- `/scripts`: Các kịch bản tự động hóa (Deploy, Đo Gas, Test Hiệu năng, Mô phỏng Tấn công).
- `/test`: Unit Test cho Smart Contract.
- `docker-compose.yml`: Cấu hình ảo hóa hệ thống.
