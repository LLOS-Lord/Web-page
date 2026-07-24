# Proxy Key Manager — GitHub Pages Edition

Web app quản lý key rút gọn link + cấp phép IP cho MITM Proxy.
Chạy hoàn toàn trên **GitHub Pages** (static) + **Cloudflare Worker** (API backend).

## 📁 Cấu trúc

```
proxy-key-pages/
├── index.html          # Frontend (GitHub Pages)
├── styles.css          # Giao diện dark theme
├── app.js              # Logic client-side (dual mode: local + server)
├── api/
│   └── worker.js       # Cloudflare Worker backend
├── wrangler.toml       # Config Cloudflare Worker
└── README.md
```

## 🚀 Cách deploy

### 1. GitHub Pages (Frontend)

```bash
# Tạo repo mới trên GitHub, push code lên
git init
git add .
git commit -m "Proxy Key Manager"
git push origin main

# Vào Settings → Pages → Source: main branch → / (root)
# → Web chạy tại: https://<username>.github.io/<repo>/
```

### 2. Cloudflare Worker (Backend API)

```bash
# Cài wrangler CLI
npm install -g wrangler

# Login Cloudflare
wrangler login

# Tạo KV namespace
wrangler kv namespace create PKM_DATA
# → Copy ID vào wrangler.toml (thay YOUR_KV_NAMESPACE_ID)

# Deploy worker
wrangler deploy
# → Worker URL: https://proxy-key-manager.<your-subdomain>.workers.dev
```

### 3. Kết nối

1. Mở web trên GitHub Pages
2. Tab **Thông tin** → nhập Worker URL vào ô "API Server URL" → Lưu
3. Web tự động chuyển sang Server mode (gọi API thay vì localStorage)

## 🔧 Chế độ hoạt động

| Chế độ | Mô tả | Cần server? |
|--------|-------|-------------|
| **Local** (mặc định) | Lưu key/IP trong localStorage trình duyệt | ❌ Không |
| **Server** | Gọi API Cloudflare Worker, data lưu KV | ✅ Có |

- **Local mode**: Tất cả thao tác tạo key, rút link, cấp phép IP đều chạy trên trình duyệt. Proxy không check được IP (vì data nằm trong browser).
- **Server mode**: Data lưu trên Cloudflare KV. Proxy gọi `/api/check-ip/<ip>?token=admin` để check.

## 📡 API cho MITM Proxy

```
GET https://<worker-url>/api/check-ip/<ip>?token=admin
```

**Trả về:**
```json
// Đã cấp phép
{"authorized": true, "ip": "1.2.3.4", "key": "PKM-...", "remaining": "29 ngày..."}

// Chưa cấp phép
{"authorized": false, "reason": "ip_not_authorized"}

// Sai token
{"authorized": false, "error": "invalid_token"}  // HTTP 403
```

### Ví dụ dùng trong proxy (Python):

```python
import requests

def is_authorized(client_ip):
    resp = requests.get(
        f"https://your-worker.workers.dev/api/check-ip/{client_ip}",
        params={"token": "admin"},
        timeout=5
    )
    data = resp.json()
    return data.get("authorized", False)

# Trong proxy handler:
if is_authorized(client_ip):
    # Cho phép qua proxy
    pass
else:
    # Từ chối / yêu cầu cấp phép
    pass
```

## ⚙️ Cấu hình

### Trong `api/worker.js`:
- `ADMIN_TOKEN` — token admin (mặc định: `admin`)
- `KEY_DURATION_DAYS` — số ngày hết hạn (mặc định: 30)
- `SHORTEN_API` — API link4m.co

### Trong `app.js`:
- `SHORTEN_API` — API link4m.co (dùng trong local mode)
- `KEY_DURATION_DAYS` — số ngày hết hạn (local mode)

## 📋 Tabs

1. **Thông tin** — Đồng hồ, IP máy, key đang dùng, thời gian còn lại, danh sách key + tạo/xoá key, cấu hình API server
2. **Rút gọn link** — Nhập key + URL → rút gọn qua link4m.co, xem lịch sử theo key
3. **Cấp phép IP** — Nhập key → ghi nhận IP cho proxy, kiểm tra IP đã cấp phép chưa

## ⚠️ Lưu ý CORS

Trong **local mode**, việc gọi API link4m.co trực tiếp từ trình duyệt có thể bị chặn bởi CORS. Nếu gặp lỗi, hãy:
1. Deploy Cloudflare Worker
2. Nhập Worker URL vào tab Thông tin → chuyển sang Server mode
3. Worker sẽ gọi API link4m.co thay bạn (không bị CORS)
