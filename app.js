/* ==================== Proxy Key Manager - GitHub Pages Edition ==================== *
 * Hoạt động ở 2 chế độ:
 *   1. Local mode (mặc định): lưu key/IP trong localStorage, không cần server
 *   2. Server mode: gọi API tới Cloudflare Worker (nhập URL trong tab Thông tin)
 *
 * GitHub Pages chỉ chạy static → không có backend.
 * API check-ip cho proxy cần server thật → deploy Cloudflare Worker (file api/worker.js)
 */

// ==================== CONFIG ====================
const SHORTEN_API = 'https://link4m.co/st?api=6a634b8d92bd1143e5115c65&url=';
const KEY_DURATION_DAYS = 30;
const LS_KEYS = 'pkm_keys';
const LS_AUTH_IPS = 'pkm_authorized_ips';
const LS_API_SERVER = 'pkm_api_server';

// ==================== STORAGE HELPERS ====================
function getApiServer() { return localStorage.getItem(LS_API_SERVER) || ''; }
function hasServer() { return getApiServer().length > 0; }

function loadLocalKeys() {
    try { return JSON.parse(localStorage.getItem(LS_KEYS)) || {}; } catch { return {}; }
}
function saveLocalKeys(keys) { localStorage.setItem(LS_KEYS, JSON.stringify(keys)); }

function loadLocalAuthIPs() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH_IPS)) || {}; } catch { return {}; }
}
function saveLocalAuthIPs(map) { localStorage.setItem(LS_AUTH_IPS, JSON.stringify(map)); }

// ==================== API HELPER ====================
async function apiCall(path, method = 'GET', body = null) {
    const server = getApiServer();
    if (!server) return null; // local mode → caller handles
    const url = server.replace(/\/+$/, '') + path;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    return resp.json();
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
        key, name: k.name || '',
        created_at: k.created_at, expires_at: k.expires_at,
        remaining_seconds: remainingSec,
        remaining_text: `${days} ngày ${hours} giờ ${mins} phút`,
        expired: remainingSec <= 0,
        authorized_ip: k.authorized_ip || null,
        shorten_count: k.shorten_count || 0,
        shorten_history: k.shorten_history || [],
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
        // Fallback
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
            } else {
                document.getElementById('ipStatus').textContent = 'Chưa cấp phép';
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
    // Local mode
    const keysData = loadLocalKeys();
    const result = Object.keys(keysData).map(k => keyInfoLocal(k, keysData)).filter(Boolean);
    renderKeys(result);
}

function renderKeys(keys) {
    const tbody = document.getElementById('keysTableBody');
    if (!keys || keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Chưa có key nào. Nhấn "Tạo key mới" để bắt đầu.</td></tr>';
        return;
    }
    tbody.innerHTML = keys.map(k => `
        <tr>
            <td class="key-cell">${k.key}</td>
            <td>${k.name || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${k.expired ? '<span style="color:var(--danger)">Đã hết hạn</span>' : k.remaining_text}</td>
            <td>${k.authorized_ip || '<span style="color:var(--text-muted)">Chưa cấp</span>'}</td>
            <td>${k.shorten_count}</td>
            <td>${k.expired ? '<span class="badge badge-expired">Hết hạn</span>' : '<span class="badge badge-active">Hoạt động</span>'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteKey('${k.key}')">Xoá</button></td>
        </tr>
    `).join('');
}

// ==================== CREATE KEY ====================
async function createKey() {
    const name = prompt('Nhập tên cho key (tuỳ chọn):', '');
    if (hasServer()) {
        try {
            const data = await apiCall('/api/create-key', 'POST', { name: name || '' });
            if (data && data.success) {
                alert(`Key mới: ${data.key}\nHết hạn: ${data.expires_at}`);
                loadKeys();
            } else { alert('Lỗi: ' + (data?.error || 'Không tạo được key')); }
        } catch (e) { alert('Lỗi kết nối server'); }
    } else {
        const keysData = loadLocalKeys();
        const key = generateKey();
        const now = new Date();
        const expires = new Date(now.getTime() + KEY_DURATION_DAYS * 86400000);
        keysData[key] = {
            name: name || '', created_at: now.toISOString(), expires_at: expires.toISOString(),
            authorized_ip: null, shorten_count: 0, shorten_history: [],
        };
        saveLocalKeys(keysData);
        alert(`Key mới: ${key}\nHết hạn: ${expires.toLocaleString('vi-VN')}`);
        loadKeys();
    }
}

// ==================== DELETE KEY ====================
async function deleteKey(key) {
    if (!confirm(`Xoá key ${key}?`)) return;
    if (hasServer()) {
        try {
            const data = await apiCall('/api/delete-key', 'POST', { key });
            if (data && data.success) loadKeys();
            else alert('Lỗi: ' + (data?.error || 'Không xoá được'));
        } catch (e) { alert('Lỗi kết nối server'); }
    } else {
        const keysData = loadLocalKeys();
        const authIPs = loadLocalAuthIPs();
        const authIP = keysData[key]?.authorized_ip;
        if (authIP && authIPs[authIP]) { delete authIPs[authIP]; saveLocalAuthIPs(authIPs); }
        delete keysData[key];
        saveLocalKeys(keysData);
        loadKeys();
    }
}

// ==================== SHORTEN LINK ====================
async function shortenLink() {
    const key = document.getElementById('shortenKey').value.trim();
    const url = document.getElementById('originalUrl').value.trim();
    const btn = document.getElementById('shortenBtn');
    const resultBox = document.getElementById('shortenResult');

    if (!key || !url) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = 'Vui lòng nhập đầy đủ key và link.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>Đang rút gọn...</span>';

    try {
        if (hasServer()) {
            // Server mode: server gọi API rút gọn
            const data = await apiCall('/api/shorten', 'POST', { key, url });
            resultBox.style.display = 'block';
            if (data && data.success) {
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `<strong>✅ Thành công!</strong><span class="short-url" onclick="copyToClipboard('${data.short_url}')">${data.short_url}</span><small style="display:block;margin-top:6px;color:var(--text-muted);">Nhấn vào link để copy</small>`;
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ ' + (data?.error || 'Lỗi') + (data?.raw ? ` (API: ${data.raw})` : '');
            }
        } else {
            // Local mode: client gọi API link4m.co trực tiếp (CORS permitting)
            const keysData = loadLocalKeys();
            const info = keyInfoLocal(key, keysData);
            if (!info) {
                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Key không hợp lệ.';
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Rút gọn';
                return;
            }
            if (info.expired) {
                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ Key đã hết hạn.';
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Rút gọn';
                return;
            }

            // Gọi API rút gọn trực tiếp
            const apiResp = await fetch(SHORTEN_API + encodeURIComponent(url));
            const shortUrl = (await apiResp.text()).trim();

            if (shortUrl.startsWith('http')) {
                // Lưu history
                keysData[key].shorten_count = info.shorten_count + 1;
                keysData[key].shorten_history.unshift({
                    original: url, shortened: shortUrl, time: new Date().toISOString(),
                });
                keysData[key].shorten_history = keysData[key].shorten_history.slice(0, 50);
                saveLocalKeys(keysData);

                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `<strong>✅ Thành công!</strong><span class="short-url" onclick="copyToClipboard('${shortUrl}')">${shortUrl}</span><small style="display:block;margin-top:6px;color:var(--text-muted);">Nhấn vào link để copy</small>`;
            } else {
                resultBox.style.display = 'block';
                resultBox.className = 'result-box result-error';
                resultBox.textContent = '❌ API trả về: ' + shortUrl;
            }
        }
    } catch (e) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = '❌ Lỗi: ' + e.message + '\n\nNếu là lỗi CORS, hãy dùng Server mode (Cloudflare Worker).';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Rút gọn';
    }
}

// ==================== LOAD HISTORY ====================
async function loadHistory() {
    const key = document.getElementById('historyKey').value.trim();
    const listEl = document.getElementById('historyList');
    if (!key) { listEl.innerHTML = '<p class="empty-text">Vui lòng nhập key.</p>'; return; }

    listEl.innerHTML = '<p class="empty-text">Đang tải...</p>';

    try {
        if (hasServer()) {
            const data = await apiCall(`/api/stats/${key}`);
            if (data && !data.error) {
                renderHistory(data.shorten_history || []);
            } else {
                listEl.innerHTML = `<p class="empty-text">❌ ${data?.error || 'Không tìm thấy key'}</p>`;
            }
        } else {
            const keysData = loadLocalKeys();
            const info = keyInfoLocal(key, keysData);
            if (!info) { listEl.innerHTML = '<p class="empty-text">❌ Key không hợp lệ.</p>'; return; }
            renderHistory(info.shorten_history);
        }
    } catch (e) {
        listEl.innerHTML = '<p class="empty-text">❌ Lỗi kết nối</p>';
    }
}

function renderHistory(history) {
    const listEl = document.getElementById('historyList');
    if (history.length === 0) {
        listEl.innerHTML = '<p class="empty-text">Chưa có link nào được rút gọn.</p>';
        return;
    }
    listEl.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="h-original">🔗 ${h.original}</div>
            <div class="h-short" onclick="copyToClipboard('${h.shortened}')">⚡ ${h.shortened}</div>
            <div class="h-time">⏰ ${new Date(h.time).toLocaleString('vi-VN')}</div>
        </div>
    `).join('');
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
            // Local mode
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

// ==================== CHECK IP ====================
async function checkIP() {
    const ip = document.getElementById('checkIPInput').value.trim();
    const token = document.getElementById('checkToken').value.trim();
    const resultBox = document.getElementById('checkResult');

    if (!ip || !token) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box result-error';
        resultBox.textContent = 'Vui lòng nhập IP và token.';
        return;
    }

    const server = getApiServer();
    const exampleFull = server
        ? `${server.replace(/\/+$/, '')}/api/check-ip/${ip}?token=${token}`
        : `/api/check-ip/${ip}?token=${token}`;
    document.getElementById('apiExampleFull').textContent = exampleFull;

    if (hasServer()) {
        try {
            const data = await apiCall(`/api/check-ip/${ip}?token=${token}`);
            resultBox.style.display = 'block';
            if (data && data.authorized) {
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `<strong>✅ IP đã được cấp phép!</strong><br>IP: <code style="color:var(--success)">${data.ip}</code><br>Key: <code style="color:var(--success)">${data.key}</code><br>Còn lại: ${data.remaining || 'N/A'}`;
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.innerHTML = `<strong>❌ IP chưa được cấp phép</strong><br>Lý do: ${data?.reason || 'unknown'}${data?.error ? '<br>Token: ' + data.error : ''}`;
            }
        } catch (e) {
            resultBox.style.display = 'block';
            resultBox.className = 'result-box result-error';
            resultBox.textContent = '❌ Lỗi kết nối server';
        }
    } else {
        // Local mode: check localStorage
        const authIPs = loadLocalAuthIPs();
        const keysData = loadLocalKeys();
        resultBox.style.display = 'block';
        if (authIPs[ip]) {
            const key = authIPs[ip];
            const info = keyInfoLocal(key, keysData);
            if (info && !info.expired) {
                resultBox.className = 'result-box result-success';
                resultBox.innerHTML = `<strong>✅ IP đã được cấp phép (local)!</strong><br>IP: <code style="color:var(--success)">${ip}</code><br>Key: <code style="color:var(--success)">${key}</code><br>Còn lại: ${info.remaining_text}`;
            } else {
                resultBox.className = 'result-box result-error';
                resultBox.innerHTML = `<strong>❌ Key đã hết hạn</strong>`;
            }
        } else {
            resultBox.className = 'result-box result-error';
            resultBox.innerHTML = `<strong>❌ IP chưa được cấp phép (local)</strong>`;
        }
    }
}

// ==================== API SERVER CONFIG ====================
function saveApiServer() {
    const val = document.getElementById('apiServerInput').value.trim();
    localStorage.setItem(LS_API_SERVER, val);
    const statusEl = document.getElementById('apiServerStatus');
    if (val) {
        statusEl.innerHTML = `<span style="color:var(--success)">✅ Đã lưu. Server: ${val}</span>`;
    } else {
        statusEl.innerHTML = `<span style="color:var(--warning)">⚠️ Đã xoá. Đang dùng chế độ localStorage.</span>`;
    }
    loadKeys();
}

function loadApiServerInput() {
    const val = getApiServer();
    document.getElementById('apiServerInput').value = val;
    const statusEl = document.getElementById('apiServerStatus');
    if (val) {
        statusEl.innerHTML = `<span style="color:var(--success)">✅ Server: ${val}</span>`;
    } else {
        statusEl.innerHTML = `<span style="color:var(--text-muted)">Chế độ localStorage (không cần server).</span>`;
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
loadApiServerInput();
fetchUserIP();
loadKeys();
