// Test-only stand-in for Supabase, to run the built app against the REAL migrations:
//   /rest/v1/*  → PostgREST (same server Supabase uses) on the local test database
//   /auth/v1/*  → a tiny fake sign-in for the test logins (signs JWTs with the test secret)
//   everything else → the built app in ../../out-real
// Never used in production. Usage: node tests/real/server.mjs <port> <postgrest port> <jwt secret> <out dir>
import { createServer, request } from "node:http";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const [port, pgrst, secret, outDir] = process.argv.slice(2);
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export const jwt = (claims, key) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${createHmac("sha256", key).update(`${h}.${p}`).digest("base64url")}`; };
const USERS = JSON.parse(process.env.TEST_USERS || "{}");   // { email: user id }
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (url.pathname.startsWith("/rest/v1/")) {
    const fwd = request({ host: "127.0.0.1", port: pgrst, path: url.pathname.slice(8) + url.search, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${pgrst}` } }, r => { res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res); });
    fwd.on("error", e => { res.writeHead(502); res.end(String(e)); });
    return req.pipe(fwd);
  }
  if (url.pathname.startsWith("/auth/v1/")) {
    let body = ""; for await (const c of req) body += c;
    const j = body ? JSON.parse(body) : {};
    const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json", ...cors }); res.end(JSON.stringify(o)); };
    if (url.pathname.endsWith("/token")) {
      const email = url.searchParams.get("grant_type") === "refresh_token" ? j.refresh_token : String(j.email || "").toLowerCase();
      const id = USERS[email];
      if (!id || (j.password !== undefined && j.password !== "test-pass-1")) return send(400, { error_description: "Invalid login credentials" });
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return send(200, { access_token: jwt({ sub: id, role: "authenticated", exp }, secret), refresh_token: email, expires_in: 3600, expires_at: exp, user: { email } });
    }
    return send(200, {});
  }
  const file = normalize(join(outDir, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(normalize(outDir))) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(file); res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }); res.end(data); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(Number(port), () => console.log(`real-stack test server on :${port}`));
