export async function onRequest({ request, env }) {
    if (!env.DB) {
        return new Response(JSON.stringify({ ok: false, error: "Missing DB binding" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "global";
    const now = Math.floor(Date.now() / 1000);
    let items = [];
    if (tab === "weekly") {
        const since = now - 7 * 24 * 60 * 60;
        const result = await env.DB.prepare("SELECT u.id, u.name, COALESCE(SUM(h.amount), 0) AS score FROM users u LEFT JOIN history h ON h.user_id = u.id AND h.created_at >= ? GROUP BY u.id, u.name ORDER BY score DESC LIMIT 20").bind(since).all();
        items = result.results || [];
    } else if (tab === "streak") {
        const result = await env.DB.prepare("SELECT h.id, u.name, h.game, h.amount, h.created_at FROM history h JOIN users u ON u.id = h.user_id ORDER BY h.created_at DESC LIMIT 30").all();
        items = result.results || [];
    } else {
        const result = await env.DB.prepare("SELECT id, name, total_score AS score FROM users ORDER BY total_score DESC LIMIT 20").all();
        items = result.results || [];
    }
    const body = { ok: true, items };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
