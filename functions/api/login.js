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
    
    const user = await env.DB.prepare("SELECT id, name, password_hash, total_score, total_wins, max_win FROM users WHERE name = ?").bind(name).first();
    
    if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Không tìm thấy tài khoản" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    
    const hash = await hashPassword(password);
    if (hash !== user.password_hash) {
        return new Response(JSON.stringify({ ok: false, error: "Sai mật khẩu" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const historyResults = await env.DB.prepare("SELECT game, amount, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(user.id).all();
    
    const history = (historyResults.results || []).map(h => ({
        game: h.game,
        amount: h.amount,
        date: h.created_at * 1000
    })).reverse();

    const now = Math.floor(Date.now() / 1000);
    const token = randomToken();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)").bind(token, user.id, now).run();
    
    const safeUser = { 
        id: user.id, 
        name: user.name, 
        score: user.total_score,
        totalWins: user.total_wins || 0,
        bestWin: user.max_win || 0,
        history: history
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
