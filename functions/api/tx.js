export async function onRequestPost({ request, env }) {
    if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: "Missing DB binding" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    const auth = request.headers.get("Authorization") || "";
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const token = parts[1];
    const session = await env.DB.prepare("SELECT s.id, s.user_id, u.name, u.total_score AS score, u.total_wins, u.max_win FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?").bind(token).first();
    if (!session) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid session" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    let body;
    try {
        body = await request.json();
    } catch (_) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    let amount = Number(body.amount || 0);
    const game = (body.game || "").trim() || "Game";
    
    if (game === 'SYNC' && amount === 0) {
        return new Response(JSON.stringify({ ok: true, score: session.score, totalWins: session.total_wins, maxWin: session.max_win }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!Number.isFinite(amount)) amount = 0;
    const now = Math.floor(Date.now() / 1000);
    const newScore = session.score + amount;
    let newWins = session.total_wins;
    let newMax = session.max_win;
    if (amount > 0) {
        newWins += 1;
        if (amount > newMax) newMax = amount;
    }
    await env.DB.batch([
        env.DB.prepare("UPDATE users SET total_score = ?, total_wins = ?, max_win = ?, last_active_at = ? WHERE id = ?").bind(newScore, newWins, newMax, now, session.user_id),
        env.DB.prepare("INSERT INTO history (user_id, game, amount, created_at) VALUES (?, ?, ?, ?)").bind(session.user_id, game, amount, now)
    ]);
    const resBody = { ok: true, score: newScore };
    return new Response(JSON.stringify(resBody), { status: 200, headers: { "Content-Type": "application/json" } });
}
