/**
 * Proxy Key Manager v3 - Cloudflare Worker
 * API: register, login, create-key-and-shorten, list-keys, authorize-ip, check-ip, delete-key, my-ip
 * Storage: KV namespace "PKM_DATA"
 */
const ADMIN_TOKEN = 'admin';
const SHORTEN_API = 'https://link4m.co/st?api=6a634b8d92bd1143e5115c65&url=';
const KEY_DURATION_DAYS = 30;

function generateKey() {
    const raw = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12);
    return `PKM-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}
function getClientIP(request) {
    const cfip = request.headers.get('CF-Connecting-IP');
    if (cfip) return cfip;
    const xf = request.headers.get('X-Forwarded-For');
    if (xf) return xf.split(',')[0].trim();
    return request.headers.get('X-Real-IP') || 'unknown';
}
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
}
async function loadKeys(env) { const r = await env.PKM_DATA.get('keys'); return r ? JSON.parse(r) : {}; }
async function saveKeys(env, k) { await env.PKM_DATA.put('keys', JSON.stringify(k)); }
async function loadAuthIPs(env) { const r = await env.PKM_DATA.get('authorized_ips'); return r ? JSON.parse(r) : {}; }
async function saveAuthIPs(env, m) { await env.PKM_DATA.put('authorized_ips', JSON.stringify(m)); }
async function loadUsers(env) { const r = await env.PKM_DATA.get('users'); return r ? JSON.parse(r) : {}; }
async function saveUsers(env, u) { await env.PKM_DATA.put('users', JSON.stringify(u)); }

function keyInfo(key, k) {
    const now = Date.now();
    const expires = new Date(k.expires_at).getTime();
    const rem = Math.max(0, Math.floor((expires - now) / 1000));
    return {
        key, owner: k.owner || '', created_at: k.created_at, expires_at: k.expires_at,
        remaining_seconds: rem, remaining_text: `${Math.floor(rem/86400)} ngày ${Math.floor((rem%86400)/3600)} giờ ${Math.floor((rem%3600)/60)} phút`,
        expired: rem <= 0, authorized_ip: k.authorized_ip || null, short_url: k.short_url || null,
    };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (method === 'OPTIONS') {
            return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
        }

        // --- AUTH ---
        if (path === '/api/register' && method === 'POST') {
            const { username, password, name } = await request.json();
            if (!username || !password) return jsonResponse({ success: false, error: 'missing_fields' }, 400);
            const users = await loadUsers(env);
            if (users[username]) return jsonResponse({ success: false, error: 'username_exists' }, 409);
            const isFirst = Object.keys(users).length === 0;
            users[username] = { name: name || username, password: btoa(password), is_admin: isFirst };
            await saveUsers(env, users);
            return jsonResponse({ success: true, username, name: name || username, is_admin: isFirst, token: btoa(username + ':' + password) });
        }

        if (path === '/api/login' && method === 'POST') {
            const { username, password } = await request.json();
            if (!username || !password) return jsonResponse({ success: false, error: 'missing_fields' }, 400);
            const users = await loadUsers(env);
            if (!users[username] || users[username].password !== btoa(password)) return jsonResponse({ success: false, error: 'invalid_credentials' }, 401);
            return jsonResponse({ success: true, username, name: users[username].name, is_admin: users[username].is_admin || false, token: btoa(username + ':' + password) });
        }

        // --- CREATE KEY + SHORTEN (one click, no name) ---
        if (path === '/api/create-key-and-shorten' && method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const owner = body.owner || '';
            const keys = await loadKeys(env);
            const key = generateKey();
            const now = new Date();
            const expires = new Date(now.getTime() + KEY_DURATION_DAYS * 86400000);

            // Build redirect URL — use the origin from request
            const baseUrl = url.origin + url.pathname.replace('/api/create-key-and-shorten', '/');
            const fullUrl = baseUrl + '?key=' + key;

            let shortUrl = '';
            try {
                const resp = await fetch(SHORTEN_API + fullUrl);
                shortUrl = (await resp.text()).trim();
            } catch (e) { shortUrl = fullUrl; }
            if (!shortUrl.startsWith('http')) shortUrl = fullUrl;

            keys[key] = { owner, created_at: now.toISOString(), expires_at: expires.toISOString(), authorized_ip: null, short_url: shortUrl };
            await saveKeys(env, keys);
            return jsonResponse({ success: true, key, short_url: shortUrl, expires_at: expires.toISOString() });
        }

        // --- LIST KEYS ---
        if (path === '/api/list-keys' && method === 'GET') {
            const keys = await loadKeys(env);
            return jsonResponse({ keys: Object.entries(keys).map(([k, v]) => keyInfo(k, v)) });
        }

        // --- AUTHORIZE IP ---
        if (path === '/api/authorize-ip' && method === 'POST') {
            const { key } = await request.json();
            if (!key) return jsonResponse({ success: false, error: 'missing_key' }, 400);
            const keys = await loadKeys(env);
            if (!keys[key]) return jsonResponse({ success: false, error: 'invalid_key' }, 404);
            const info = keyInfo(key, keys[key]);
            if (info.expired) return jsonResponse({ success: false, error: 'key_expired' }, 403);
            const ip = getClientIP(request);
            keys[key].authorized_ip = ip;
            await saveKeys(env, keys);
            const authIPs = await loadAuthIPs(env);
            authIPs[ip] = key;
            await saveAuthIPs(env, authIPs);
            return jsonResponse({ success: true, ip, key, expires_at: info.expires_at, remaining: info.remaining_text });
        }

        // --- CHECK IP (for proxy) ---
        if (path.startsWith('/api/check-ip/') && method === 'GET') {
            const ip = path.replace('/api/check-ip/', '');
            const token = url.searchParams.get('token') || '';
            if (token !== ADMIN_TOKEN) return jsonResponse({ authorized: false, error: 'invalid_token' }, 403);
            const authIPs = await loadAuthIPs(env);
            const keys = await loadKeys(env);
            if (authIPs[ip]) {
                const k = keys[authIPs[ip]];
                if (k) {
                    const info = keyInfo(authIPs[ip], k);
                    if (!info.expired) return jsonResponse({ authorized: true, ip, key: authIPs[ip], expires_at: info.expires_at, remaining: info.remaining_text });
                    delete authIPs[ip]; await saveAuthIPs(env, authIPs);
                    return jsonResponse({ authorized: false, reason: 'key_expired' });
                }
            }
            return jsonResponse({ authorized: false, reason: 'ip_not_authorized' });
        }

        // --- MY IP ---
        if (path === '/api/my-ip' && method === 'GET') return jsonResponse({ ip: getClientIP(request) });

        // --- STATS ---
        if (path.startsWith('/api/stats/') && method === 'GET') {
            const key = path.replace('/api/stats/', '');
            const keys = await loadKeys(env);
            if (!keys[key]) return jsonResponse({ error: 'invalid_key' }, 404);
            return jsonResponse(keyInfo(key, keys[key]));
        }

        // --- DELETE KEY ---
        if (path === '/api/delete-key' && method === 'POST') {
            const { key } = await request.json();
            const keys = await loadKeys(env);
            if (!keys[key]) return jsonResponse({ success: false, error: 'key_not_found' }, 404);
            const authIPs = await loadAuthIPs(env);
            const aip = keys[key].authorized_ip;
            if (aip && authIPs[aip]) { delete authIPs[aip]; await saveAuthIPs(env, authIPs); }
            delete keys[key]; await saveKeys(env, keys);
            return jsonResponse({ success: true });
        }

        return jsonResponse({ error: 'not_found', path }, 404);
    },
};
