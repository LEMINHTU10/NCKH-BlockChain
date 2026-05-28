#!/bin/bash

echo "==================================================="
echo " Khởi chạy Hệ thống DID (Blockchain & Frontend)..."
echo "==================================================="

# Kiểm tra docker-compose
if ! command -v docker-compose &> /dev/null
then
    echo "Lỗi: Bạn chưa cài đặt Docker hoặc Docker Compose!"
    exit 1
fi

echo "Đang build và khởi động các container..."
docker-compose up -d --build

echo "==================================================="
echo " KHỞI CHẠY THÀNH CÔNG!"
echo "==================================================="
echo "- Ganache (Blockchain Local) đang chạy tại: http://localhost:7545"
echo "- Frontend (React App) đang chạy tại: http://localhost:5173"
echo "==================================================="
echo "Lưu ý: Mở mã nguồn frontend và chỉnh sửa, web sẽ tự cập nhật (Hot Reloading)."
echo "Để xem log hệ thống, hãy gõ lệnh: docker-compose logs -f"
echo "Để dừng hệ thống, hãy gõ lệnh: docker-compose down"
