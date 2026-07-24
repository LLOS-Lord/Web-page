/* ==================== Proxy Key Manager v3 ==================== *
 * Thay đổi v3:
 *   - Tạo key: 1 nút bấm, không cần nhập tên
 *   - Hiển thị key + link rút gọn đã tạo
 *   - Xoá phần API khỏi tab người dùng (chỉ admin thấy trong tab Thông tin)
 *   - Phân quyền: tài khoản đầu tiên = admin
 */

// ==================== CONFIG ====================
const SHORTEN_API = 'https://link4m.co/st?api=6a634b8d92bd1143e5115c65&url=';
const KEY_DURATION_DAYS = 30;
const LS_KEYS = 'pkm_keys';
const LS_AUTH_IPS = 'pkm_authorized_ips';
const LS_API_SERVER = 'pkm_api_server';
const LS_USERS = 'pkm_users';
const LS_SESSION = 'pkm_session';

// ==================== STORAGE ====================
function getApiServer() { return localStorage.getItem(LS_API_SERVER) || ''; }
function hasServer() { return getApiServer().length > 0; }
function loadLocalKeys() { try { return JSON.parse(localStorage.getItem(LS_KEYS)) || {}; } catch { return {}; } }
function saveLocalKeys(k) { localStorage.setItem(LS_KEYS, JSON.stringify(k)); }
function loadLocalAuthIPs() { try { return JSON.parse(localStorage.getItem(LS_AUTH_IPS)) || {}; } catch { return {}; } }
function saveLocalAuthIPs(m) { localStorage.setItem(LS_AUTH_IPS, JSON.stringify(m)); }
function loadUsers() { try { return JSON.parse(localStorage.getItem(LS_USERS)) || {}; } catch { return {}; } }
function saveUsers(u) { localStorage.setItem(LS_USERS, JSON.stringify(u)); }
function getSession() { try { return JSON.parse(localStorage.getItem(LS_SESSION)) || null; } catch { return null; } }
function setSession(s) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(LS_SESSION); }

// ==================== API HELPER ====================
async function apiCall(path, method = 'GET', body = null) {
    const server = getApiServer();
    if (!server) return null;
    const url = server.replace(/\/+$/, '') + path;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    return resp.json();
}

// ==================== AUTH ====================
let authMode = 'login';

function switchAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('registerNameGroup').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authTitle').textContent = mode === 'register' ? 'Đăng ký' : 'Đăng nhập';
    document.getElementById('authSub').textContent = mode === 'register' ? 'Tạo tài khoản mới' : 'Đăng nhập để quản lý key';
    document.getElementById('authBtn').textContent = mode === 'register' ? 'Đăng ký' : 'Đăng nhập';
    document.getElementById('authResult').style.display = 'none';
}

async function doAuth() {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value.trim();
    const resultBox = document.getElementById('authResult');

    if (!username || !password) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = 'Vui lòng nhập đầy đủ.';
        return;
    }

    if (hasServer()) {
        try {
            const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
            const payload = authMode === 'register' ? { username, password, name } : { username, password };
            const data = await apiCall(endpoint, 'POST', payload);
            resultBox.style.display = 'block';
            if (data && data.success) {
                setSession({ username: data.username, name: data.name || username, isAdmin: data.is_admin || false, token: data.token || '' });
                showApp();
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ ' + (data?.error || 'Lỗi');
            }
        } catch (e) {
            resultBox.style.display = 'block';
            resultBox.className = 'result-box result-error';
            resultBox.textContent = '❌ Lỗi kết nối server';
        }
    } else {
        const users = loadUsers();
        resultBox.style.display = 'block';

        if (authMode === 'register') {
            if (users[username]) {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Tên đăng nhập đã tồn tại.';
                return;
            }
            // First user = admin
            const isFirstUser = Object.keys(users).length === 0;
            users[username] = { name: name || username, password: btoa(password), isAdmin: isFirstUser };
            saveUsers(users);
            setSession({ username, name: name || username, isAdmin: isFirstUser });
            resultBox.className = 'result-box result-success';
            resultBox.textContent = isFirstUser
                ? '✅ Đăng ký thành công! Bạn là Admin (tài khoản đầu tiên).'
                : '✅ Đăng ký thành công!';
            setTimeout(() => showApp(), 1000);
        } else {
            if (!users[username] || users[username].password !== btoa(password)) {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Sai tên đăng nhập hoặc mật khẩu.';
                return;
            }
            setSession({ username, name: users[username].name, isAdmin: users[username].isAdmin || false });
            resultBox.className = 'result-box result-success';
            resultBox.textContent = '✅ Đăng nhập thành công!';
            setTimeout(() => showApp(), 600);
        }
    }
}

function logout() {
    clearSession();
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authName').value = '';
}

function showApp() {
    const session = getSession();
    if (!session) return;
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userName').textContent = session.name || session.username;

    // Show admin-only sections
    if (session.isAdmin) {
        document.getElementById('adminBadge').style.display = 'inline-block';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('visible'));
    } else {
        document.getElementById('adminBadge').style.display = 'none';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('visible'));
    }

    loadApiServerInput();
    fetchUserIP();
    loadKeys();
    loadRecentKeys();
    checkUrlForKey();
}

// ==================== TAB SWITCHING ====================
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// ==================== CLOCK ====================
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    document.getElementById('currentTime').textContent = `${h}:${m}:${s}`;
    document.getElementById('currentDate').textContent = `${d}/${mo}/${y}`;
}
setInterval(updateClock, 1000);
updateClock();

// ==================== KEY UTILS ====================
function generateKey() {
    const raw = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    })).replace(/-/g, '').toUpperCase().slice(0, 12);
    return `PKM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function keyInfoLocal(key, keysData) {
    if (!keysData[key]) return null;
    const k = keysData[key];
    const now = Date.now();
    const expires = new Date(k.expires_at).getTime();
    const remainingSec = Math.max(0, Math.floor((expires - now) / 1000));
    const days = Math.floor(remainingSec / 86400);
    const hours = Math.floor((remainingSec % 86400) / 3600);
    const mins = Math.floor((remainingSec % 3600) / 60);
    return {
        key, owner: k.owner || '',
        created_at: k.created_at, expires_at: k.expires_at,
        remaining_seconds: remainingSec,
        remaining_text: `${days} ngày ${hours} giờ ${mins} phút`,
        expired: remainingSec <= 0,
        authorized_ip: k.authorized_ip || null,
        short_url: k.short_url || null,
    };
}

// ==================== FETCH USER IP ====================
async function fetchUserIP() {
    try {
        const resp = await fetch('https://api.ipify.org?format=json');
        const data = await resp.json();
        if (data.ip) {
            document.getElementById('userIP').textContent = data.ip;
            document.getElementById('authUserIP').textContent = data.ip;
            checkIPAuthStatus(data.ip);
            return data.ip;
        }
    } catch (e) {
        try {
            const resp2 = await fetch('https://ipapi.co/json/');
            const data2 = await resp2.json();
            if (data2.ip) {
                document.getElementById('userIP').textContent = data2.ip;
                document.getElementById('authUserIP').textContent = data2.ip;
                checkIPAuthStatus(data2.ip);
                return data2.ip;
            }
        } catch (e2) {
            document.getElementById('userIP').textContent = 'Không xác định';
            document.getElementById('authUserIP').textContent = 'Không xác định';
        }
    }
    return null;
}

async function checkIPAuthStatus(ip) {
    if (hasServer()) {
        try {
            const data = await apiCall(`/api/check-ip/${ip}?token=admin`);
            if (data && data.authorized) {
                document.getElementById('ipStatus').textContent = 'Đã cấp phép ✓';
                document.getElementById('ipStatus').style.color = 'var(--success)';
            }
        } catch (e) {}
    } else {
        const authIPs = loadLocalAuthIPs();
        if (authIPs[ip]) {
            document.getElementById('ipStatus').textContent = 'Đã cấp phép ✓';
            document.getElementById('ipStatus').style.color = 'var(--success)';
        }
    }
}

// ==================== LOAD KEYS ====================
async function loadKeys() {
    if (hasServer()) {
        try {
            const data = await apiCall('/api/list-keys');
            if (data && data.keys) { renderKeys(data.keys); return; }
        } catch (e) {}
    }
    const keysData = loadLocalKeys();
    const session = getSession();
    const result = Object.keys(keysData)
        .filter(k => !session || keysData[k].owner === session.username || !keysData[k].owner)
        .map(k => keyInfoLocal(k, keysData)).filter(Boolean);
    renderKeys(result);
}

function renderKeys(keys) {
    const tbody = document.getElementById('keysTableBody');
    if (!keys || keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Chưa có key nào. Vào tab "Tạo key & Link" để tạo.</td></tr>';
        return;
    }
    tbody.innerHTML = keys.map(k => `
        <tr>
            <td class="key-cell">${k.key}</td>
            <td class="link-cell">${k.short_url ? `<span onclick="copyToClipboard('${k.short_url}')" style="cursor:pointer;text-decoration:underline">${k.short_url}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${k.expired ? '<span style="color:var(--danger)">Hết hạn</span>' : k.remaining_text}</td>
            <td>${k.authorized_ip || '<span style="color:var(--text-muted)">Chưa cấp</span>'}</td>
            <td>${k.expired ? '<span class="badge badge-expired">Hết hạn</span>' : '<span class="badge badge-active">Hoạt động</span>'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteKey('${k.key}')">Xoá</button></td>
        </tr>
    `).join('');
}

// ==================== CREATE KEY (one click) ====================
async function createKeyAndShorten() {
    const btn = document.getElementById('createKeyBtn');
    const resultBox = document.getElementById('createResult');

    btn.disabled = true;
    btn.innerHTML = '<span>Đang tạo key & rút gọn...</span>';

    try {
        if (hasServer()) {
            const session = getSession();
            const data = await apiCall('/api/create-key-and-shorten', 'POST', {
                owner: session?.username || ''
            });
            resultBox.style.display = 'block';
            if (data && data.success) {
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `
                    <strong>✅ Tạo key thành công!</strong><br>
                    Key: <code style="color:var(--success)">${data.key}</code><br>
                    Link rút gọn: <span class="short-url" onclick="copyToClipboard('${data.short_url}')">${data.short_url}</span>
                    <small style="display:block;margin-top:6px;color:var(--text-muted);">Gửi link này cho người dùng. Họ mở link → vào tab Cấp phép IP → nhập key.</small>
                `;
                loadKeys();
                loadRecentKeys();
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ ' + (data?.error || 'Lỗi') + (data?.raw ? ` (API: ${data.raw})` : '');
            }
        } else {
            // Local mode
            const keysData = loadLocalKeys();
            const session = getSession();
            const key = generateKey();
            const now = new Date();
            const expires = new Date(now.getTime() + KEY_DURATION_DAYS * 86400000);

            // Build URL with key — use current page URL as base
            const baseUrl = window.location.origin + window.location.pathname;
            const fullUrl = baseUrl + '?key=' + key;

            // Shorten
            let shortUrl = '';
            try {
                const apiResp = await fetch(SHORTEN_API + encodeURIComponent(fullUrl));
                shortUrl = (await apiResp.text()).trim();
            } catch (e) {
                shortUrl = fullUrl;
            }
            if (!shortUrl.startsWith('http')) shortUrl = fullUrl;

            keysData[key] = {
                owner: session?.username || '',
                created_at: now.toISOString(),
                expires_at: expires.toISOString(),
                authorized_ip: null,
                short_url: shortUrl,
            };
            saveLocalKeys(keysData);

            resultBox.style.display = 'block';
            resultBox.className = 'result-box result-success';
            resultBox.innerHTML = `
                <strong>✅ Tạo key thành công!</strong><br>
                Key: <code style="color:var(--success)">${key}</code><br>
                Link rút gọn: <span class="short-url" onclick="copyToClipboard('${shortUrl}')">${shortUrl}</span>
                <small style="display:block;margin-top:6px;color:var(--text-muted);">Gửi link này cho người dùng. Họ mở link → vào tab Cấp phép IP → nhập key.</small>
            `;
            loadKeys();
            loadRecentKeys();
        }
    } catch (e) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = '❌ Lỗi: ' + e.message + '\n\nNếu là lỗi CORS, hãy dùng Server mode (Cloudflare Worker).';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Tạo key';
    }
}

// ==================== RECENT KEYS ====================
function loadRecentKeys() {
    if (hasServer()) {
        apiCall('/api/list-keys').then(data => {
            if (data && data.keys) {
                const sorted = data.keys.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
                renderRecentKeys(sorted);
            }
        }).catch(() => {});
    } else {
        const keysData = loadLocalKeys();
        const session = getSession();
        const all = Object.keys(keysData)
            .filter(k => !session || keysData[k].owner === session.username || !keysData[k].owner)
            .map(k => keyInfoLocal(k, keysData))
            .filter(Boolean)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 20);
        renderRecentKeys(all);
    }
}

function renderRecentKeys(keys) {
    const el = document.getElementById('recentKeys');
    if (!keys || keys.length === 0) {
        el.innerHTML = '<p class="empty-text">Chưa có key nào. Nhấn "Tạo key" để bắt đầu.</p>';
        return;
    }
    el.innerHTML = keys.map(k => `
        <div class="recent-key-item">
            <div class="rk-key">🔑 ${k.key}</div>
            ${k.short_url ? `<div class="rk-link" onclick="copyToClipboard('${k.short_url}')">⚡ ${k.short_url}</div>` : ''}
            <div class="rk-info">⏰ ${k.remaining_text} · ${k.expired ? 'Hết hạn' : 'Hoạt động'}${k.authorized_ip ? ' · IP: ' + k.authorized_ip : ''}</div>
            <div class="rk-actions">
                <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${k.key}')">Copy key</button>
                ${k.short_url ? `<button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${k.short_url}')">Copy link</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteKey('${k.key}')">Xoá</button>
            </div>
        </div>
    `).join('');
}

// ==================== DELETE KEY ====================
async function deleteKey(key) {
    if (!confirm(`Xoá key ${key}?`)) return;
    if (hasServer()) {
        try {
            const data = await apiCall('/api/delete-key', 'POST', { key });
            if (data && data.success) { loadKeys(); loadRecentKeys(); }
        } catch (e) { alert('Lỗi kết nối server'); }
    } else {
        const keysData = loadLocalKeys();
        const authIPs = loadLocalAuthIPs();
        const authIP = keysData[key]?.authorized_ip;
        if (authIP && authIPs[authIP]) { delete authIPs[authIP]; saveLocalAuthIPs(authIPs); }
        delete keysData[key];
        saveLocalKeys(keysData);
        loadKeys();
        loadRecentKeys();
    }
}

// ==================== AUTHORIZE IP ====================
async function authorizeIP() {
    const key = document.getElementById('authKey').value.trim();
    const btn = document.getElementById('authBtn');
    const resultBox = document.getElementById('authResult');

    if (!key) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = 'Vui lòng nhập key.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>Đang cấp phép...</span>';

    try {
        if (hasServer()) {
            const data = await apiCall('/api/authorize-ip', 'POST', { key });
            resultBox.style.display = 'block';
            if (data && data.success) {
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `<strong>✅ Cấp phép thành công!</strong><br>IP: <code style="color:var(--success)">${data.ip}</code><br>Key: <code style="color:var(--success)">${data.key}</code><br>Còn lại: ${data.remaining}<br>Hết hạn: ${data.expires_at}`;
                updateInfoAfterAuth(data);
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ ' + (data?.error || 'Không thể cấp phép');
            }
        } else {
            const keysData = loadLocalKeys();
            const info = keyInfoLocal(key, keysData);
            if (!info) {
                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Key không hợp lệ.';
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 5.5m0 0l5 5L22 9l-5-5"/></svg> Cấp phép IP';
                return;
            }
            if (info.expired) {
                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Key đã hết hạn.';
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 5.5m0 0l5 5L22 9l-5-5"/></svg> Cấp phép IP';
                return;
            }
            const ip = document.getElementById('authUserIP').textContent;
            keysData[key].authorized_ip = ip;
            saveLocalKeys(keysData);
            const authIPs = loadLocalAuthIPs();
            authIPs[ip] = key;
            saveLocalAuthIPs(authIPs);

            resultBox.style.display = 'block';
            resultBox.className = 'result-box result-success';
            resultBox.innerHTML = `<strong>✅ Cấp phép thành công!</strong><br>IP: <code style="color:var(--success)">${ip}</code><br>Key: <code style="color:var(--success)">${key}</code><br>Còn lại: ${info.remaining_text}<br>Hết hạn: ${info.expires_at}`;
            updateInfoAfterAuth({ ip, key, remaining: info.remaining_text, expires_at: info.expires_at });
        }
    } catch (e) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = '❌ Lỗi kết nối server';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 5.5m0 0l5 5L22 9l-5-5"/></svg> Cấp phép IP';
    }
}

function updateInfoAfterAuth(data) {
    document.getElementById('ipStatus').textContent = 'Đã cấp phép ✓';
    document.getElementById('ipStatus').style.color = 'var(--success)';
    document.getElementById('activeKey').textContent = data.key;
    document.getElementById('keyRemaining').textContent = data.remaining;
    document.getElementById('timeRemaining').textContent = data.remaining;
    document.getElementById('expireDate').textContent = 'Hết hạn: ' + data.expires_at;
}

// ==================== API SERVER CONFIG (admin only) ====================
function saveApiServer() {
    const val = document.getElementById('apiServerInput').value.trim();
    localStorage.setItem(LS_API_SERVER, val);
    const statusEl = document.getElementById('apiServerStatus');
    if (val) {
        statusEl.innerHTML = `<span style="color:var(--success)">✅ Server: ${val}</span>`;
    } else {
        statusEl.innerHTML = `<span style="color:var(--warning)">⚠️ Chế độ localStorage.</span>`;
    }
    loadKeys();
    loadRecentKeys();
}

function loadApiServerInput() {
    const val = getApiServer();
    document.getElementById('apiServerInput').value = val;
    const statusEl = document.getElementById('apiServerStatus');
    if (val) {
        statusEl.innerHTML = `<span style="color:var(--success)">✅ Server: ${val}</span>`;
    } else {
        statusEl.innerHTML = `<span style="color:var(--text-muted)">Chế độ localStorage.</span>`;
    }
}

// ==================== URL KEY AUTO-FILL ====================
function checkUrlForKey() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (key) {
        switchTab('authorize');
        document.getElementById('authKey').value = key;
        const resultBox = document.getElementById('authResult');
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-success';
        resultBox.innerHTML = `<strong>🔑 Đã nhận key từ link!</strong><br>Key: <code style="color:var(--success)">${key}</code><br>Nhấn "Cấp phép IP" để ghi nhận IP máy bạn.`;
    }
}

// ==================== CLIPBOARD ====================
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--success);color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;z-index:9999;animation:fadeIn 0.2s ease;';
        toast.textContent = '✅ Đã copy: ' + text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });
}

// ==================== INIT ====================
(function init() {
    const session = getSession();
    if (session) {
        showApp();
    } else {
        document.getElementById('authOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
})();
