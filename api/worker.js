/**
 * Proxy Key Manager - Cloudflare Worker Backend
 * ==============================================
 * Deploy: https://workers.cloudflare.com → New Worker → paste this file
 *
 * API endpoints:
 *   GET  /api/check-ip/<ip>?token=<ADMIN_TOKEN>   → {"authorized": true/false}
 *   POST /api/create-key    body: {"name":"..."}  → tạo key
 *   GET  /api/list-keys                             → danh sách key
 *   POST /api/shorten       body: {"key","url"}    → rút gọn link
 *   POST /api/authorize-ip  body: {"key"}          → cấp phép IP (lấy IP từ request)
 *   GET  /api/stats/<key>                           → thông tin key
 *   POST /api/delete-key    body: {"key"}          → xoá key
 *   GET  /api/my-ip                                 → IP của caller
 *
 * Storage: Cloudflare KV namespace "PKM_DATA"
 *   (Workers → KV → Create namespace "PKM_DATA" → bind in wrangler.toml)
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
    const xf = request.headers.get('X-Forwarded-For');
    if (xf) return xf.split(',')[0].trim();
    const xr = request.headers.get('X-Real-IP');
    if (xr) return xr;
    // CF-Connecting-IP is set by Cloudflare
    const cfip = request.headers.get('CF-Connecting-IP');
    if (cfip) return cfip;
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

function keyInfo(key, k) {
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

// ==================== MAIN HANDLER ====================
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS preflight
        if (method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // ==================== ROUTES ====================

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

        // --- GET /api/list-keys ---
        if (path === '/api/list-keys' && method === 'GET') {
            const keys = await loadKeys(env);
            const result = Object.entries(keys).map(([k, v]) => keyInfo(k, v));
            return jsonResponse({ keys: result });
        }

        // --- POST /api/create-key ---
        if (path === '/api/create-key' && method === 'POST') {
            const body = await request.json();
            const keys = await loadKeys(env);
            const key = generateKey();
            const now = new Date();
            const expires = new Date(now.getTime() + KEY_DURATION_DAYS * 86400000);
            keys[key] = {
                name: body.name || '',
                created_at: now.toISOString(),
                expires_at: expires.toISOString(),
                authorized_ip: null,
                shorten_count: 0,
                shorten_history: [],
            };
            await saveKeys(env, keys);
            return jsonResponse({ success: true, key, expires_at: expires.toISOString() });
        }

        // --- POST /api/shorten ---
        if (path === '/api/shorten' && method === 'POST') {
            const body = await request.json();
            const { key, url: longUrl } = body;
            if (!key || !longUrl) return jsonResponse({ success: false, error: 'missing_key_or_url' }, 400);

            const keys = await loadKeys(env);
            const k = keys[key];
            if (!k) return jsonResponse({ success: false, error: 'invalid_key' }, 404);
            const info = keyInfo(key, k);
            if (info.expired) return jsonResponse({ success: false, error: 'key_expired' }, 403);

            try {
                const resp = await fetch(SHORTEN_API + longUrl);
                const shortUrl = (await resp.text()).trim();
                if (shortUrl.startsWith('http')) {
                    k.shorten_count = (k.shorten_count || 0) + 1;
                    k.shorten_history = k.shorten_history || [];
                    k.shorten_history.unshift({ original: longUrl, shortened: shortUrl, time: new Date().toISOString() });
                    k.shorten_history = k.shorten_history.slice(0, 50);
                    await saveKeys(env, keys);
                    return jsonResponse({ success: true, short_url: shortUrl, original: longUrl });
                } else {
                    return jsonResponse({ success: false, error: 'api_error', raw: shortUrl }, 502);
                }
            } catch (e) {
                return jsonResponse({ success: false, error: e.message }, 500);
            }
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

        // --- GET /api/stats/<key> ---
        if (path.startsWith('/api/stats/') && method === 'GET') {
            const key = path.replace('/api/stats/', '');
            const keys = await loadKeys(env);
            const k = keys[key];
            if (!k) return jsonResponse({ error: 'invalid_key' }, 404);
            return jsonResponse(keyInfo(key, k));
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

        // --- 404 ---
        return jsonResponse({ error: 'not_found', path }, 404);
    },
};
