# Proxy Key Manager v2

## Flow hoạt động

```
Admin đăng nhập → Tạo key → Web tự rút gọn link chứa key
  → Admin copy link rút gọn gửi cho user
  → User mở link → web tự lấy key từ URL → tab Cấp phép IP
  → User nhập key → IP máy user được ghi nhận
  → Proxy (máy khác) gọi API check-ip → true/false
```

## Cấu trúc

```
proxy-key-pages/
├── index.html       # Frontend (GitHub Pages)
├── styles.css       # Giao diện
├── app.js           # Logic (auth + key + shorten + authorize)
├── api/worker.js    # Cloudflare Worker backend
├── wrangler.toml    # Config Worker
└── README.md
```

## Deploy

### 1. GitHub Pages
```bash
git init && git add . && git commit -m "Proxy Key Manager v2"
git push origin main
# Settings → Pages → Source: main → Web live
```

### 2. Cloudflare Worker
```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create PKM_DATA
# Copy ID → wrangler.toml
wrangler deploy
```

### 3. Kết nối
Mở web → đăng ký tài khoản → tab Thông tin → nhập Worker URL → Lưu

## API cho Proxy

```
GET https://<worker>/api/check-ip/<ip>?token=admin
→ {"authorized": true}  hoặc  {"authorized": false}
```

```python
import requests
def is_authorized(ip):
    r = requests.get(f"https://your-worker.workers.dev/api/check-ip/{ip}", params={"token": "admin"}, timeout=5)
    return r.json().get("authorized", False)
```

## Tabs

1. **Thông tin** — Đồng hồ, IP, key đang dùng, thời gian còn lại, danh sách key, cấu hình server
2. **Tạo key & Link** — Tạo key → tự rút gọn link chứa key → copy link gửi cho user
3. **Cấp phép IP** — User nhập key → IP được ghi → proxy check via API
