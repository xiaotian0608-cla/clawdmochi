const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function resp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function checkAuth(req, env) {
  const token = env.MCP_TOKEN;
  if (!token) return true;
  return (req.headers.get("Authorization") || "") === `Bearer ${token}`;
}

function bm25score(text, query) {
  if (!query) return 0;
  const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 1);
  const t = text.toLowerCase();
  return tokens.reduce((s, tok) => {
    const n = (t.match(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    return s + (n > 0 ? 1 + Math.log(n) : 0);
  }, 0);
}

async function listAll(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, ...(cursor ? { cursor } : {}), limit: 1000 });
    for (const k of page.keys) {
      const v = await kv.get(k.name, "json");
      if (v) out.push(v);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" && request.method === "GET") {
      const count = (await env.MEM.list({ prefix: "mem:" })).keys.length;
      return resp({ status: "ok", service: "latent-memory", memories: count });
    }

    if (!checkAuth(request, env)) return resp({ error: "unauthorized" }, 401);

    let body = {};
    if (request.method === "POST") {
      try { body = await request.json(); } catch {}
    }

    // ── 人格文件 ──
    if (path === "/persona") {
      if (request.method === "GET") {
        return resp({ persona: await env.MEM.get("persona") || "" });
      }
      if (request.method === "POST") {
        await env.MEM.put("persona", body.content || body.persona || "");
        return resp({ status: "ok" });
      }
    }

    // ── latent_session_start ──
    if (path === "/tools/latent_session_start") {
      const persona = await env.MEM.get("persona") || "";
      const threads = (await listAll(env.MEM, "thread:"))
        .sort((a, b) => b.ts - a.ts).slice(0, 3);
      const unresolved = (await listAll(env.MEM, "unres:"))
        .filter(u => u.status === "open");
      const memCount = (await env.MEM.list({ prefix: "mem:" })).keys.length;
      return resp({ persona, recent_threads: threads, unresolved, memory_count: memCount });
    }

    // ── latent_search ──
    if (path === "/tools/latent_search") {
      const q = body.query || "";
      const mems = (await listAll(env.MEM, "mem:")).filter(m => !m.gone);
      const results = mems
        .map(m => ({ ...m, _score: bm25score(m.text, q) }))
        .filter(m => m._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, body.limit || 6);
      return resp({ results, query: q });
    }

    // ── latent_append ──
    if (path === "/tools/latent_append") {
      const text = body.text || body.content || "";
      if (!text) return resp({ error: "text required" }, 400);
      const id = `mem:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await env.MEM.put(id, JSON.stringify({
        id, text, tags: body.tags || [], ts: Date.now(), gone: false,
      }));
      return resp({ id, status: "saved" });
    }

    // ── latent_correct ──
    if (path === "/tools/latent_correct") {
      const { old_id, text, tags } = body;
      if (old_id) {
        const old = await env.MEM.get(old_id, "json");
        if (old) {
          old.gone = true;
          old.gone_at = Date.now();
          await env.MEM.put(old_id, JSON.stringify(old));
        }
      }
      let new_id = null;
      if (text) {
        new_id = `mem:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await env.MEM.put(new_id, JSON.stringify({
          id: new_id, text, tags: tags || [], ts: Date.now(), gone: false, corrects: old_id,
        }));
      }
      return resp({ old_id, new_id, status: "corrected" });
    }

    // ── latent_unresolved ──
    if (path === "/tools/latent_unresolved") {
      const { action = "list", id, text } = body;

      if (action === "list") {
        const items = (await listAll(env.MEM, "unres:")).filter(u => u.status === "open");
        return resp({ items });
      }
      if (action === "add") {
        const nid = `unres:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await env.MEM.put(nid, JSON.stringify({ id: nid, text, status: "open", ts: Date.now() }));
        return resp({ id: nid, status: "added" });
      }
      if (action === "update" || action === "close") {
        const item = await env.MEM.get(id, "json");
        if (!item) return resp({ error: "not found" }, 404);
        if (text) item.text = text;
        if (action === "close") item.status = "closed";
        item.updated = Date.now();
        await env.MEM.put(id, JSON.stringify(item));
        return resp({ id, status: action === "close" ? "closed" : "updated" });
      }
      return resp({ error: "unknown action" }, 400);
    }

    // ── latent_thread_close ──
    if (path === "/tools/latent_thread_close") {
      const id = `thread:${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await env.MEM.put(id, JSON.stringify({
        id, ts: Date.now(),
        summary: body.summary || body.text || "",
        state: body.current_state || "",
        unfinished: body.unfinished || "",
      }));
      return resp({ id, status: "saved" });
    }

    return resp({ error: "not found" }, 404);
  },
};
