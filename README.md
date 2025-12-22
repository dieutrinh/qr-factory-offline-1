# QR Factory Offline (Electron Portable) — 1-click .EXE

## Mục tiêu
- Double-click `.exe` chạy như app desktop (không mở trình duyệt)
- Offline 100% (không CDN, không server)
- Có 2 chức năng demo:
  1) Tạo QR (Generate)
  2) Scan QR bằng camera (BarcodeDetector)

## Yêu cầu build trên Windows
- Cài Node.js LTS (khuyến nghị 20+)
- Mở CMD/PowerShell tại thư mục dự án

## Chạy dev
```bat
npm install
npm start
```

## Build ra file portable .exe (1-click)
```bat
npm run dist:win
```

Sau đó lấy file:
- `dist\QR Factory Offline.exe`

## Lưu ý camera
- Nếu Windows hỏi quyền camera: Allow
- Nếu tab Scan báo không hỗ trợ BarcodeDetector:
  - Electron/Chromium quá cũ, hoặc policy bị tắt.
  - Nhắn mình để mình chuyển sang ZXing (hỗ trợ rộng hơn).

