/**
 * Proxy Key Manager v2 - Cloudflare Worker Backend
 * ==============================================
 * API endpoints:
 *   POST /api/register          body: {username, password, name}     → đăng ký
 *   POST /api/login             body: {username, password}           → đăng nhập
 *   GET  /api/check-ip/<ip>?token=<ADMIN_TOKEN>                      → {"authorized": true/false}  (cho proxy)
 *   POST /api/create-key-and-shorten  body: {name, redirect_url, owner}  → tạo key + rút gọn link
 *   GET  /api/list-keys                                               → danh sách key
 *   POST /api/authorize-ip     body: {key}                            → cấp phép IP
 *   GET  /api/stats/<key>                                             → thông tin key
 *   POST /api/delete-key       body: {key}                            → xoá key
 *   GET  /api/my-ip                                                   → IP của caller
 *
 * Storage: Cloudflare KV namespace "PKM_DATA"
 */

const ADMIN_TOKEN = 'admin';
const SHORTEN_API = 'https://link4m.co/st?api=6a634b8d92bd1143e5115c65&url=';
const KEY_DURATION_DAYS = 30;

// ==================== UTILS ====================
function generateKey() {
    const raw = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12);
    return `PKM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function getClientIP(request) {
    const cfip = request.headers.get('CF-Connecting-IP');
    if (cfip) return cfip;
    const xf = request.headers.get('X-Forwarded-For');
    if (xf) return xf.split(',')[0].trim();
    const xr = request.headers.get('X-Real-IP');
    if (xr) return xr;
    return 'unknown';
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

async function loadKeys(env) {
    const raw = await env.PKM_DATA.get('keys');
    return raw ? JSON.parse(raw) : {};
}
async function saveKeys(env, keys) {
    await env.PKM_DATA.put('keys', JSON.stringify(keys));
}
async function loadAuthIPs(env) {
    const raw = await env.PKM_DATA.get('authorized_ips');
    return raw ? JSON.parse(raw) : {};
}
async function saveAuthIPs(env, map) {
    await env.PKM_DATA.put('authorized_ips', JSON.stringify(map));
}
async function loadUsers(env) {
    const raw = await env.PKM_DATA.get('users');
    return raw ? JSON.parse(raw) : {};
}
async function saveUsers(env, users) {
    await env.PKM_DATA.put('users', JSON.stringify(users));
}

function keyInfo(key, k) {
    const now = Date.now();
    const expires = new Date(k.expires_at).getTime();
    const remainingSec = Math.max(0, Math.floor((expires - now) / 1000));
    const days = Math.floor(remainingSec / 86400);
    const hours = Math.floor((remainingSec % 86400) / 3600);
    const mins = Math.floor((remainingSec % 3600) / 60);
    return {
        key, name: k.name || '', owner: k.owner || '',
        created_at: k.created_at, expires_at: k.expires_at,
        remaining_seconds: remainingSec,
        remaining_text: `${days} ngày ${hours} giờ ${mins} phút`,
        expired: remainingSec <= 0,
        authorized_ip: k.authorized_ip || null,
        short_url: k.short_url || null,
    };
}

// ==================== MAIN ====================
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // ==================== AUTH ====================

        // --- POST /api/register ---
        if (path === '/api/register' && method === 'POST') {
            const body = await request.json();
            const { username, password, name } = body;
            if (!username || !password) return jsonResponse({ success: false, error: 'missing_fields' }, 400);
            const users = await loadUsers(env);
            if (users[username]) return jsonResponse({ success: false, error: 'username_exists' }, 409);
            users[username] = { name: name || username, password: btoa(password) };
            await saveUsers(env, users);
            return jsonResponse({ success: true, username, name: name || username, token: btoa(username + ':' + password) });
        }

        // --- POST /api/login ---
        if (path === '/api/login' && method === 'POST') {
            const body = await request.json();
            const { username, password } = body;
            if (!username || !password) return jsonResponse({ success: false, error: 'missing_fields' }, 400);
            const users = await loadUsers(env);
            if (!users[username] || users[username].password !== btoa(password)) {
                return jsonResponse({ success: false, error: 'invalid_credentials' }, 401);
            }
            return jsonResponse({ success: true, username, name: users[username].name, token: btoa(username + ':' + password) });
        }

        // ==================== KEY MANAGEMENT ====================

        // --- POST /api/create-key-and-shorten ---
        if (path === '/api/create-key-and-shorten' && method === 'POST') {
            const body = await request.json();
            const { name, redirect_url, owner } = body;
            if (!redirect_url) return jsonResponse({ success: false, error: 'missing_redirect_url' }, 400);

            const keys = await loadKeys(env);
            const key = generateKey();
            const now = new Date();
            const expires = new Date(now.getTime() + KEY_DURATION_DAYS * 86400000);

            // Tạo link chứa key
            let fullUrl = redirect_url;
            if (!fullUrl.includes('key=')) {
                fullUrl += (fullUrl.includes('?') ? '&' : '?') + 'key=' + key;
            }

            // Rút gọn link
            let shortUrl = '';
            try {
                const resp = await fetch(SHORTEN_API + fullUrl);
                shortUrl = (await resp.text()).trim();
            } catch (e) {
                shortUrl = fullUrl;
            }
            if (!shortUrl.startsWith('http')) shortUrl = fullUrl;

            keys[key] = {
                name: name || '',
                owner: owner || '',
                created_at: now.toISOString(),
                expires_at: expires.toISOString(),
                authorized_ip: null,
                short_url: shortUrl,
            };
            await saveKeys(env, keys);

            return jsonResponse({ success: true, key, short_url: shortUrl, expires_at: expires.toISOString() });
        }

        // --- GET /api/list-keys ---
        if (path === '/api/list-keys' && method === 'GET') {
            const keys = await loadKeys(env);
            const result = Object.entries(keys).map(([k, v]) => keyInfo(k, v));
            return jsonResponse({ keys: result });
        }

        // --- POST /api/authorize-ip ---
        if (path === '/api/authorize-ip' && method === 'POST') {
            const body = await request.json();
            const { key } = body;
            if (!key) return jsonResponse({ success: false, error: 'missing_key' }, 400);
            const keys = await loadKeys(env);
            const k = keys[key];
            if (!k) return jsonResponse({ success: false, error: 'invalid_key' }, 404);
            const info = keyInfo(key, k);
            if (info.expired) return jsonResponse({ success: false, error: 'key_expired' }, 403);

            const ip = getClientIP(request);
            k.authorized_ip = ip;
            await saveKeys(env, keys);
            const authIPs = await loadAuthIPs(env);
            authIPs[ip] = key;
            await saveAuthIPs(env, authIPs);

            return jsonResponse({ success: true, ip, key, expires_at: info.expires_at, remaining: info.remaining_text });
        }

        // --- GET /api/check-ip/<ip>?token=xxx ---
        if (path.startsWith('/api/check-ip/') && method === 'GET') {
            const ip = path.replace('/api/check-ip/', '');
            const token = url.searchParams.get('token') || '';
            if (token !== ADMIN_TOKEN) return jsonResponse({ authorized: false, error: 'invalid_token' }, 403);

            const authIPs = await loadAuthIPs(env);
            const keys = await loadKeys(env);

            if (authIPs[ip]) {
                const key = authIPs[ip];
                const k = keys[key];
                if (k) {
                    const info = keyInfo(key, k);
                    if (!info.expired) {
                        return jsonResponse({ authorized: true, ip, key, expires_at: info.expires_at, remaining: info.remaining_text });
                    } else {
                        delete authIPs[ip];
                        await saveAuthIPs(env, authIPs);
                        return jsonResponse({ authorized: false, reason: 'key_expired' });
                    }
                }
            }
            return jsonResponse({ authorized: false, reason: 'ip_not_authorized' });
        }

        // --- GET /api/my-ip ---
        if (path === '/api/my-ip' && method === 'GET') {
            return jsonResponse({ ip: getClientIP(request) });
        }

        // --- GET /api/stats/<key> ---
        if (path.startsWith('/api/stats/') && method === 'GET') {
            const key = path.replace('/api/stats/', '');
            const keys = await loadKeys(env);
            if (!keys[key]) return jsonResponse({ error: 'invalid_key' }, 404);
            return jsonResponse(keyInfo(key, keys[key]));
        }

        // --- POST /api/delete-key ---
        if (path === '/api/delete-key' && method === 'POST') {
            const body = await request.json();
            const { key } = body;
            const keys = await loadKeys(env);
            if (!keys[key]) return jsonResponse({ success: false, error: 'key_not_found' }, 404);
            const authIPs = await loadAuthIPs(env);
            const authIP = keys[key].authorized_ip;
            if (authIP && authIPs[authIP]) { delete authIPs[authIP]; await saveAuthIPs(env, authIPs); }
            delete keys[key];
            await saveKeys(env, keys);
            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'not_found', path }, 404);
    },
};
