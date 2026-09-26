/**
 * Program Review Check: passcode proxy for the Anthropic API (Cloudflare Worker).
 *
 * Keeps your Anthropic API key on the server. The web page sends a passcode;
 * the Worker checks it, then forwards the request to Anthropic with your key.
 *
 * Settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
 *   ANTHROPIC_API_KEY  (Secret)  your Anthropic API key
 *   PASSCODES          (Secret)  comma-separated passcodes, e.g. "physics-team-7Qx,ee-team-4Lm"
 *   ALLOWED_ORIGINS    (Text)    comma-separated sites allowed to call this Worker,
 *                                e.g. "https://mqaissaunee-bcc.github.io"
 *   MODEL              (Text, optional)  defaults to "claude-opus-5-5"
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? origin : (allowed[0] || "null"),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-passcode",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const reply = (status, obj) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: { type: "method", message: "Use POST." } });
    if (!originOk) return reply(403, { error: { type: "origin", message: "This site isn't allowed to use this service." } });

    const passcode = request.headers.get("x-passcode") || "";
    const codes = (env.PASSCODES || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!passcode || !codes.includes(passcode)) {
      return reply(401, { error: { type: "passcode", message: "Passcode not accepted." } });
    }

    let body;
    try { body = await request.json(); }
    catch { return reply(400, { error: { type: "bad_request", message: "Invalid request body." } }); }

    // Only forward what the tool needs; the model and output length are fixed here.
    const forward = {
      model: env.MODEL || "claude-opus-5-5",
      max_tokens: Math.min(Math.max(Number(body.max_tokens) || 4000, 1), 16000),
      messages: Array.isArray(body.messages) ? body.messages.slice(0, 4) : [],
    };

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(forward),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, "content-type": "application/json" } });
  },
};
