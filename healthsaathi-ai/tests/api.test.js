"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/chat.js");

const FAKE_KEY = "test-key-NOT-REAL-123";
let ipCounter = 0;
let fetchCalls = [];
const realFetch = global.fetch;
const logged = [];
const realConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };

function geminiOk(text) {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }) };
}
function setFetch(fn) {
  fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return fn(url, opts);
  };
}
function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null, raw: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.raw = b || ""; r.body = b ? JSON.parse(b) : null; };
  return r;
}
async function call(body, { method = "POST", ip } = {}) {
  const req = { method, headers: { "x-forwarded-for": ip || "10.0." + Math.floor(++ipCounter / 250) + "." + (ipCounter % 250) }, body };
  const res = mockRes();
  await handler(req, res);
  return res;
}

test.beforeEach(() => {
  process.env.GEMINI_API_KEY = FAKE_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_TIMEOUT_MS;
  delete process.env.CHAT_RATE_LIMIT;
  logged.length = 0;
  for (const k of Object.keys(realConsole)) console[k] = (...a) => logged.push(a.map(String).join(" "));
  setFetch(async () => { throw new Error("fetch should not have been called"); });
});
test.afterEach(() => {
  Object.assign(console, realConsole);
  global.fetch = realFetch;
});

test("GET returns 405 with an Allow header", async () => {
  const r = await call(undefined, { method: "GET" });
  assert.equal(r.statusCode, 405);
  assert.equal(r.headers.allow, "POST");
  assert.equal(r.body.error, "method_not_allowed");
  assert.equal(fetchCalls.length, 0);
});

test("empty, whitespace-only, missing and non-string messages are rejected without calling Gemini", async () => {
  for (const body of [{ message: "" }, { message: "   \n " }, {}, { message: 42 }, { message: ["a"] }, { message: null }, [], "x"]) {
    const r = await call(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.ok(r.body.error);
  }
  assert.equal(fetchCalls.length, 0);
});

test("oversized message is rejected; exactly 500 characters is accepted", async () => {
  const tooLong = await call({ message: "a".repeat(501) });
  assert.equal(tooLong.statusCode, 400);
  assert.equal(tooLong.body.error, "message_too_long");
  setFetch(async () => geminiOk("ok"));
  const ok = await call({ message: "a".repeat(500) });
  assert.equal(ok.statusCode, 200);
});

test("invalid JSON body returns 400", async () => {
  const r = await call("{not json");
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error, "invalid_json");
});

test("routine question goes to Gemini and returns the model's text plus a disclaimer", async () => {
  setFetch(async () => geminiOk("Drinking water regularly is a helpful habit."));
  const r = await call({ message: "How much water should I drink in a day?" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.source, "gemini");
  assert.match(r.body.reply, /Drinking water regularly/);
  assert.match(r.body.reply, /not a diagnosis/i);
  assert.equal(fetchCalls.length, 1);
});

test("request uses the official generateContent format, default model, and server-side key header", async () => {
  setFetch(async () => geminiOk("fine"));
  await call({ message: "How can I improve my sleep?" });
  const c = fetchCalls[0];
  assert.equal(c.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
  assert.equal(c.opts.method, "POST");
  assert.equal(c.opts.headers["x-goog-api-key"], FAKE_KEY);
  assert.equal(c.body.contents[0].role, "user");
  assert.equal(c.body.contents[0].parts[0].text, "How can I improve my sleep?");
  assert.match(c.body.systemInstruction.parts[0].text, /not a doctor/);
  assert.ok(c.body.generationConfig.maxOutputTokens > 0);
  assert.ok(!JSON.stringify(c.body).includes(FAKE_KEY), "key must not be in the request body");
});

test("GEMINI_MODEL is configurable and unsafe values fall back to the default", async () => {
  setFetch(async () => geminiOk("x"));
  process.env.GEMINI_MODEL = "my-model-1";
  await call({ message: "hello there" });
  assert.match(fetchCalls[0].url, /models\/my-model-1:generateContent$/);
  process.env.GEMINI_MODEL = "../../evil?x=";
  await call({ message: "hello again" });
  assert.match(fetchCalls[1].url, /models\/gemini-3\.1-flash-lite:generateContent$/);
});

test("sleep, nutrition and stress questions receive different answers", async () => {
  setFetch(async (url, opts) => {
    const q = JSON.parse(opts.body).contents[0].parts[0].text.toLowerCase();
    if (q.includes("sleep")) return geminiOk("SLEEP: keep regular sleep and wake times.");
    if (q.includes("food") || q.includes("eat")) return geminiOk("NUTRITION: eat a variety of vegetables and whole grains.");
    return geminiOk("GENERAL: ask a clinician.");
  });
  const a = await call({ message: "How can I improve my sleep?" });
  const b = await call({ message: "What food is good for energy?" });
  assert.match(a.body.reply, /^SLEEP/);
  assert.match(b.body.reply, /^NUTRITION/);
  assert.notEqual(a.body.reply, b.body.reply);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].body.contents[0].parts[0].text, "How can I improve my sleep?");
  assert.equal(fetchCalls[1].body.contents[0].parts[0].text, "What food is good for energy?");
});

test("emergency messages never reach Gemini, even when Gemini is working", async () => {
  setFetch(async () => geminiOk("this must not be used"));
  const msgs = [
    "I have severe chest pain and difficulty breathing.",
    "I can\u2019t breathe",
    "Mujhe saans nahi aa rahi aur seene mein bahut dard hai.",
    "My father's face is drooping and his speech is slurred",
    "I think I took an overdose of tablets",
    "Bee sting and my throat is closing",
    "I want to end my life",
  ];
  for (const m of msgs) {
    const r = await call({ message: m });
    assert.equal(r.statusCode, 200, m);
    assert.equal(r.body.emergency, true, m);
    assert.equal(r.body.source, "emergency-rules", m);
    assert.match(r.body.reply, /112/, m);
  }
  assert.equal(fetchCalls.length, 0, "Gemini must not be called for emergencies");
});

test("emergency guidance works with no API key and when Gemini is down", async () => {
  delete process.env.GEMINI_API_KEY;
  let r = await call({ message: "I have severe chest pain" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.emergency, true);
  process.env.GEMINI_API_KEY = FAKE_KEY;
  setFetch(async () => { throw new Error("network down"); });
  r = await call({ message: "I have severe chest pain" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.emergency, true);
});

test("educational mention of an emergency term is sent to Gemini, not treated as an emergency", async () => {
  setFetch(async () => geminiOk("Common stroke signs include face drooping, arm weakness and speech trouble."));
  const r = await call({ message: "What are common stroke symptoms to learn about?" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.source, "gemini");
  assert.ok(!r.body.emergency);
  assert.equal(fetchCalls.length, 1);
});

test("medicine-dose requests get a fixed safe reply and no Gemini call", async () => {
  const r = await call({ message: "How much paracetamol should I give my 2-year-old?" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.source, "safety-rules");
  assert.match(r.body.reply, /can't give medicine doses/i);
  assert.doesNotMatch(r.body.reply, /\b\d+\s?(?:mg|ml)\b/i);
  assert.equal(fetchCalls.length, 0);
});

test("missing API key returns a clear 503 and no Gemini call", async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await call({ message: "How can I improve my sleep?" });
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.error, "ai_not_configured");
  assert.equal(r.body.reply, undefined, "must not return a fake answer");
  assert.equal(fetchCalls.length, 0);
});

test("Gemini HTTP errors map to safe errors and never leak provider details or the key", async () => {
  const leaky = { ok: false, status: 403, json: async () => ({ error: { message: "API key " + FAKE_KEY + " is invalid" } }), text: async () => "secret detail" };
  setFetch(async () => leaky);
  let r = await call({ message: "How can I improve my sleep?" });
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.error, "ai_unavailable");
  assert.ok(!r.raw.includes(FAKE_KEY) && !r.raw.includes("secret detail"));
  setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  r = await call({ message: "tell me about hydration" });
  assert.equal(r.statusCode, 502);
  setFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  r = await call({ message: "tell me about nutrition" });
  assert.equal(r.statusCode, 429);
  assert.equal(r.body.error, "ai_rate_limited");
});

test("network failure returns 502 ai_unreachable", async () => {
  setFetch(async () => { throw new TypeError("fetch failed: getaddrinfo ENOTFOUND " + FAKE_KEY); });
  const r = await call({ message: "How can I improve my sleep?" });
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.error, "ai_unreachable");
  assert.ok(!r.raw.includes(FAKE_KEY));
});

test("malformed or unexpected Gemini responses are handled safely", async () => {
  const bad = [
    { ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } },
    { ok: true, status: 200, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ candidates: [] }) },
    { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [] } }] }) },
    { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 42 }] } }] }) },
    { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "   " }] } }] }) },
    { ok: true, status: 200, json: async () => ({ candidates: [{ content: null }] }) },
  ];
  for (const b of bad) {
    setFetch(async () => b);
    const r = await call({ message: "How can I improve my sleep?" });
    assert.equal(r.statusCode, 502);
    assert.equal(r.body.error, "ai_bad_response");
    assert.equal(r.body.reply, undefined);
  }
});

test("a response blocked by Gemini safety filters returns 422 with a helpful message", async () => {
  setFetch(async () => ({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) }));
  let r = await call({ message: "tell me about sleep" });
  assert.equal(r.statusCode, 422);
  assert.equal(r.body.error, "ai_blocked");
  setFetch(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }) }));
  r = await call({ message: "tell me about sleep" });
  assert.equal(r.statusCode, 422);
});

test("request timeout returns 504 and aborts the Gemini request", async () => {
  process.env.GEMINI_TIMEOUT_MS = "50";
  let aborted = false;
  setFetch((url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener("abort", () => {
      aborted = true;
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      reject(e);
    });
  }));
  const t0 = Date.now();
  const r = await call({ message: "How can I improve my sleep?" });
  assert.equal(r.statusCode, 504);
  assert.equal(r.body.error, "ai_timeout");
  assert.ok(aborted);
  assert.ok(Date.now() - t0 < 2000);
});

test("rate limit returns 429 after the configured number of requests from one IP", async () => {
  process.env.CHAT_RATE_LIMIT = "3";
  setFetch(async () => geminiOk("ok"));
  const ip = "203.0.113.77";
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call({ message: "tell me about sleep" }, { ip })).statusCode);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test("messages and the API key are never written to logs; the key is never returned", async () => {
  const secretMessage = "my private note about sleep zebra-quartz-9981";
  setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  const r1 = await call({ message: secretMessage });
  setFetch(async () => { throw new Error("boom " + secretMessage); });
  const r2 = await call({ message: secretMessage });
  setFetch(async () => geminiOk("fine"));
  const r3 = await call({ message: secretMessage });
  const all = logged.join("\n");
  assert.ok(!all.includes("zebra-quartz-9981"), "message leaked to logs");
  assert.ok(!all.includes(FAKE_KEY), "key leaked to logs");
  for (const r of [r1, r2, r3]) assert.ok(!r.raw.includes(FAKE_KEY));
});

test("responses are marked no-store and nosniff", async () => {
  const r = await call({ message: "" });
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
});

test("handler also accepts a JSON string or Buffer body", async () => {
  setFetch(async () => geminiOk("ok"));
  let r = await call(JSON.stringify({ message: "tell me about sleep" }));
  assert.equal(r.statusCode, 200);
  r = await call(Buffer.from(JSON.stringify({ message: "tell me about food" })));
  assert.equal(r.statusCode, 200);
});
