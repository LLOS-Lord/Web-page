# Proxy Key Manager v3

## Flow

```
Admin đăng nhập → Nhấn "Tạo key" → Key tự tạo + link tự rút gọn
  → Copy link rút gọn gửi cho user
  → User mở link → web tự lấy key → tab Cấp phép IP
  → User nhập key → IP máy user được ghi
  → Proxy gọi API check-ip → true/false
```

## Phân quyền

- **Tài khoản đầu tiên** đăng ký = Admin (tự động)
- Admin thấy: badge "ADMIN", phần cấu hình API Server + API check-ip (tab Thông tin)
- Người dùng thường: chỉ thấy 3 tab, không thấy phần API

## Deploy

### GitHub Pages
```bash
git init && git add . && git commit -m "Proxy Key Manager v3"
git push origin main
# Settings → Pages → Source: main
```

### Cloudflare Worker
```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create PKM_DATA
# Copy ID → wrangler.toml
wrangler deploy
```

### Kết nối
Admin đăng nhập → tab Thông tin → nhập Worker URL → Lưu

## API cho Proxy (admin only)
```
GET https://<worker>/api/check-ip/<ip>?token=admin
→ {"authorized": true/false}
```
