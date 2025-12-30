export async function onRequestPost({ request, env }) {
    if (!env.DB) return new Response(JSON.stringify({ ok: false, error: "Missing DB" }), { status: 500 });
    
    const auth = request.headers.get("Authorization") || "";
    const token = auth.split(" ")[1];
    if (!token) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });

    const session = await env.DB.prepare("SELECT s.user_id, u.name, u.total_score FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?").bind(token).first();
    if (!session) return new Response(JSON.stringify({ ok: false, error: "Session invalid" }), { status: 401 });

    let body;
    try { body = await request.json(); } catch(e) { return new Response(JSON.stringify({ ok: false, error: "Bad JSON" }), { status: 400 }); }

    const inputReceiver = (body.receiver || "").trim();
    const amount = parseInt(body.amount);

    if (!inputReceiver) return new Response(JSON.stringify({ ok: false, error: "Vui lòng nhập tên hoặc ID người nhận" }), { status: 400 });
    if (isNaN(amount) || amount <= 0) return new Response(JSON.stringify({ ok: false, error: "Số tiền không hợp lệ" }), { status: 400 });
    if (amount > session.total_score) return new Response(JSON.stringify({ ok: false, error: "Số dư không đủ" }), { status: 400 });
    if (inputReceiver === session.name || inputReceiver == session.user_id) return new Response(JSON.stringify({ ok: false, error: "Không thể tự chuyển tiền" }), { status: 400 });

    let receiver;
    if (/^\d+$/.test(inputReceiver)) {
        receiver = await env.DB.prepare("SELECT id, name, total_score FROM users WHERE id = ?").bind(inputReceiver).first();
    } else {
        receiver = await env.DB.prepare("SELECT id, name, total_score FROM users WHERE name = ?").bind(inputReceiver).first();
    }

    if (!receiver) return new Response(JSON.stringify({ ok: false, error: "Người nhận không tồn tại" }), { status: 404 });

    const txId = crypto.randomUUID().split('-')[0].toUpperCase();
    const now = Math.floor(Date.now() / 1000);

    try {
        await env.DB.batch([
            env.DB.prepare("UPDATE users SET total_score = total_score - ? WHERE id = ?").bind(amount, session.user_id),
            env.DB.prepare("UPDATE users SET total_score = total_score + ? WHERE id = ?").bind(amount, receiver.id),
            env.DB.prepare("INSERT INTO transfers (id, sender_id, receiver_id, amount, created_at) VALUES (?, ?, ?, ?, ?)").bind(txId, session.user_id, receiver.id, amount, now)
        ]);
        
        return new Response(JSON.stringify({ 
            ok: true, 
            txId, 
            amount, 
            sender: session.name, 
            receiver: receiver.name,
            receiverId: receiver.id,
            date: now * 1000,
            newBalance: session.total_score - amount
        }), { status: 200 });

    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "Giao dịch lỗi" }), { status: 500 });
    }
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const auth = request.headers.get("Authorization") || "";
    const token = auth.split(" ")[1];
    if (!token) return new Response(JSON.stringify({ ok: false }), { status: 401 });

    const session = await env.DB.prepare("SELECT user_id FROM sessions WHERE id = ?").bind(token).first();
    if (!session) return new Response(JSON.stringify({ ok: false }), { status: 401 });

    const type = url.searchParams.get("type"); 

    if (type === "history") {
        const history = await env.DB.prepare(`
            SELECT t.id, t.amount, t.created_at, u_send.name as sender_name, u_recv.name as receiver_name, t.sender_id
            FROM transfers t
            JOIN users u_send ON t.sender_id = u_send.id
            JOIN users u_recv ON t.receiver_id = u_recv.id
            WHERE t.sender_id = ? OR t.receiver_id = ?
            ORDER BY t.created_at DESC LIMIT 50
        `).bind(session.user_id, session.user_id).all();
        
        return new Response(JSON.stringify({ ok: true, items: history.results, currentUserId: session.user_id }), { status: 200 });
    }

    if (type === "check") {
        const query = url.searchParams.get("q");
        if(!query) return new Response(JSON.stringify({ ok: false }), { status: 400 });
        
        let user;
        if (/^\d+$/.test(query)) {
            user = await env.DB.prepare("SELECT id, name FROM users WHERE id = ?").bind(query).first();
        } else {
            user = await env.DB.prepare("SELECT id, name FROM users WHERE name = ?").bind(query).first();
        }
        
        if(user) return new Response(JSON.stringify({ ok: true, name: user.name, id: user.id }), { status: 200 });
        return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ ok: false }), { status: 400 });
}
