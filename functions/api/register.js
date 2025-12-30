export async function onRequestPost({ request, env }) {
    if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: "Missing DB binding" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    let body;
    try {
        body = await request.json();
    } catch (_) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const name = (body.name || "").trim();
    const password = (body.password || "").trim();
    if (!name || !password) {
        return new Response(JSON.stringify({ ok: false, error: "Thiếu tên hoặc mật khẩu" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (name.length > 40) {
        return new Response(JSON.stringify({ ok: false, error: "Tên quá dài" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE name = ?").bind(name).first();
    if (existing) {
        return new Response(JSON.stringify({ ok: false, error: "Tên đã tồn tại, chọn tên khác" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const hash = await hashPassword(password);
    const now = Math.floor(Date.now() / 1000);
    
    await env.DB.prepare("INSERT INTO users (name, password_hash, total_score, total_wins, max_win, created_at, last_active_at) VALUES (?, ?, 5000, 0, 0, ?, ?)").bind(name, hash, now, now).run();
    
    const user = await env.DB.prepare("SELECT id, name, total_score, total_wins, max_win FROM users WHERE name = ?").bind(name).first();
    
    const token = randomToken();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)").bind(token, user.id, now).run();
    
    const safeUser = {
        id: user.id,
        name: user.name,
        score: user.total_score,
        totalWins: 0,
        bestWin: 0,
        history: []
    };

    const resBody = { ok: true, user: safeUser, token };
    return new Response(JSON.stringify(resBody), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function hashPassword(pwd) {
    const enc = new TextEncoder();
    const data = enc.encode(pwd);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
