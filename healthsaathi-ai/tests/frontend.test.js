"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { JSDOM, VirtualConsole } = require("jsdom");

const INDEX = path.join(__dirname, "..", "index.html");

/** Load the real index.html (and safety.js) in jsdom with a mocked fetch. */
async function load(fetchImpl, { timeoutMs } = {}) {
  const calls = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (e) => errors.push(String(e)));
  const dom = await JSDOM.fromFile(INDEX, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {};
      if (timeoutMs) w.HEALTHSAATHI_TIMEOUT_MS = timeoutMs;
      w.fetch = (url, opts) => {
        calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
        return fetchImpl ? fetchImpl(url, opts) : Promise.reject(new Error("no fetch mock"));
      };
    },
  });
  if (dom.window.document.readyState !== "complete") {
    await new Promise((r) => dom.window.addEventListener("load", r));
  }
  const d = dom.window.document;
  const api = {
    dom, d, calls, errors,
    messages: d.getElementById("messages"),
    input: d.getElementById("chatInput"),
    btn: d.getElementById("sendBtn"),
    async send(text) {
      api.input.value = text;
      d.getElementById("chatForm").dispatchEvent(new dom.window.Event("submit", { cancelable: true, bubbles: true }));
      await tick();
    },
    bubbles: () => [...d.querySelectorAll("#messages .bubble")],
    last: () => api.bubbles().pop(),
  };
  return api;
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const okJson = (obj, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => obj });

test("page loads with no script errors and keeps all five navigation items", async () => {
  const p = await load(() => okJson({ reply: "x", source: "gemini" }));
  assert.deepEqual(p.errors, []);
  const names = [...p.d.querySelectorAll(".nav button")].map((b) => b.dataset.page);
  assert.deepEqual(names, ["dashboard", "assistant", "reports", "medicines", "appointments"]);
  assert.ok(p.d.querySelector(".hero"), "dashboard hero preserved");
  assert.equal(p.d.querySelectorAll(".cards .card").length, 4, "dashboard cards preserved");
});

test("each navigation item opens the right section and title", async () => {
  const p = await load();
  const titles = { dashboard: "Good morning", assistant: "Health Assistant", reports: "Health Reports", medicines: "Medicines", appointments: "Appointments" };
  for (const [page, title] of Object.entries(titles)) {
    p.d.querySelector('.nav button[data-page="' + page + '"]').click();
    assert.ok(p.d.getElementById(page).classList.contains("active"), page + " visible");
    assert.equal(p.d.querySelectorAll(".page.active").length, 1);
    assert.ok(p.d.getElementById("pageTitle").textContent.includes(title), page + " title");
  }
});

test("hydration counter still works and caps at 8", async () => {
  const p = await load();
  for (let i = 0; i < 10; i++) p.d.getElementById("addWater").click();
  assert.equal(p.d.getElementById("water").textContent, "8");
});

test("assistant page has a persistent emergency banner, aria-live log, and a 500-character input limit", async () => {
  const p = await load();
  const banner = p.d.querySelector("#assistant .emergency-banner");
  assert.ok(banner);
  assert.match(banner.textContent, /112/);
  assert.equal(p.messages.getAttribute("aria-live"), "polite");
  assert.equal(p.messages.getAttribute("role"), "log");
  assert.equal(p.input.getAttribute("maxlength"), "500");
  assert.match(p.d.querySelector("#assistant .notice").textContent, /Privacy/);
});

test("routine question shows the real returned reply with an AI label", async () => {
  const p = await load(() => okJson({ reply: "Keep a regular sleep schedule.\n\nThis is general information, not a diagnosis.", source: "gemini" }));
  await p.send("How can I improve my sleep?");
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].url, "/api/chat");
  assert.equal(p.calls[0].opts.method, "POST");
  assert.deepEqual(p.calls[0].body, { message: "How can I improve my sleep?" });
  const last = p.last();
  assert.match(last.textContent, /Keep a regular sleep schedule/);
  assert.match(last.textContent, /AI-generated/);
  assert.equal(p.btn.disabled, false, "send button re-enabled");
});

test("two different questions show two different replies", async () => {
  const p = await load((u, o) => {
    const q = JSON.parse(o.body).message;
    return okJson({ reply: q.includes("sleep") ? "SLEEP ANSWER" : "FOOD ANSWER", source: "gemini" });
  });
  await p.send("How can I improve my sleep?");
  await p.send("What food gives energy?");
  const texts = p.bubbles().map((b) => b.textContent);
  assert.ok(texts.some((t) => t.includes("SLEEP ANSWER")));
  assert.ok(texts.some((t) => t.includes("FOOD ANSWER")));
});

test("emergency wording shows urgent guidance immediately and never calls the API", async () => {
  const p = await load(() => okJson({ reply: "should not be used", source: "gemini" }));
  for (const msg of [
    "I have severe chest pain and difficulty breathing.",
    "I can\u2019t breathe",
    "Mujhe saans nahi aa rahi aur seene mein bahut dard hai.",
    "My father's face is drooping and his speech is slurred",
    "I think I took an overdose of tablets",
  ]) {
    await p.send(msg);
    const b = p.last();
    assert.ok(b.classList.contains("emergency"), msg);
    assert.equal(b.getAttribute("role"), "alert");
    assert.match(b.textContent, /112/);
    assert.match(b.textContent, /Do not wait|Call 112/);
  }
  assert.equal(p.calls.length, 0, "no network call for emergencies");
});

test("emergency guidance is shown even if the AI service is completely down", async () => {
  const p = await load(() => Promise.reject(new TypeError("Failed to fetch")));
  await p.send("I have severe chest pain");
  assert.ok(p.last().classList.contains("emergency"));
  assert.equal(p.calls.length, 0);
});

test("educational mention of an emergency term is sent to the assistant, not treated as an emergency", async () => {
  const p = await load(() => okJson({ reply: "Stroke signs include face drooping.", source: "gemini" }));
  await p.send("What are common stroke symptoms to learn about?");
  assert.equal(p.calls.length, 1);
  assert.ok(!p.bubbles().some((b) => b.classList.contains("emergency")));
});

test("medicine-dose question gets the fixed safe answer and no API call", async () => {
  const p = await load(() => okJson({ reply: "no", source: "gemini" }));
  await p.send("How much paracetamol should I give my 2-year-old?");
  assert.equal(p.calls.length, 0);
  assert.match(p.last().textContent, /can't give medicine doses/i);
});

test("empty and whitespace input is ignored", async () => {
  const p = await load(() => okJson({ reply: "x", source: "gemini" }));
  const before = p.bubbles().length;
  await p.send("");
  await p.send("    ");
  assert.equal(p.bubbles().length, before);
  assert.equal(p.calls.length, 0);
});

test("over-long input is refused in the page without sending", async () => {
  const p = await load(() => okJson({ reply: "x", source: "gemini" }));
  await p.send("a".repeat(501));
  assert.equal(p.calls.length, 0);
  assert.match(p.last().textContent, /under 500 characters/);
  assert.equal(p.input.value.length, 501, "text is kept so the user can edit it");
});

test("duplicate submissions are blocked while a request is running", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const p = await load(() => gate.then(() => ({ ok: true, status: 200, json: async () => ({ reply: "done", source: "gemini" }) })));
  await p.send("tell me about sleep");
  assert.equal(p.btn.disabled, true, "button disabled while waiting");
  assert.ok(p.bubbles().some((b) => b.classList.contains("pending")));
  await p.send("tell me about sleep again");
  await p.send("and again");
  assert.equal(p.calls.length, 1, "only one request in flight");
  release();
  await tick(40);
  assert.equal(p.btn.disabled, false);
  assert.equal(p.bubbles().filter((b) => b.classList.contains("pending")).length, 0);
});

test("network failure shows a clear error with Retry; Retry succeeds without duplicating the user message", async () => {
  let n = 0;
  const p = await load(() => (++n === 1 ? Promise.reject(new TypeError("Failed to fetch")) : okJson({ reply: "Recovered answer", source: "gemini" })));
  await p.send("How can I improve my sleep?");
  const err = p.last();
  assert.ok(err.classList.contains("error"));
  assert.match(err.textContent, /Couldn't reach the assistant/);
  assert.match(err.textContent, /call 112/);
  const retry = [...err.querySelectorAll("button")].find((b) => b.textContent === "Retry");
  assert.ok(retry, "Retry button present");
  retry.click();
  await tick(40);
  assert.equal(p.calls.length, 2);
  assert.match(p.last().textContent, /Recovered answer/);
  assert.equal(p.bubbles().filter((b) => b.classList.contains("me")).length, 1, "user message not duplicated");
  assert.equal(p.bubbles().filter((b) => b.classList.contains("error")).length, 0, "error removed after retry");
});

test("a server error is shown as an error, never as a silent generic answer", async () => {
  const p = await load(() => okJson({ error: "ai_unavailable", message: "x" }, 502));
  await p.send("tell me about hydration");
  const b = p.last();
  assert.ok(b.classList.contains("error"));
  assert.match(b.textContent, /couldn't answer right now/i);
  assert.ok(!/AI-generated/.test(b.textContent));
});

test("missing API key (503) tells the user the AI is not set up and offers offline tips labelled as not AI", async () => {
  const p = await load(() => okJson({ error: "ai_not_configured", message: "x" }, 503));
  await p.send("How can I improve my sleep?");
  const b = p.last();
  assert.match(b.textContent, /isn't set up/i);
  [...b.querySelectorAll("button")].find((x) => x.textContent.includes("offline tips")).click();
  const tips = p.last();
  assert.match(tips.textContent, /sleep/i);
  assert.match(tips.textContent, /not AI-generated/i);
});

test("malformed success response (no reply field) is treated as an error", async () => {
  const p = await load(() => okJson({ unexpected: true }, 200));
  await p.send("tell me about sleep");
  assert.ok(p.last().classList.contains("error"));
});

test("rate-limit response shows a wait-and-retry message", async () => {
  const p = await load(() => okJson({ error: "rate_limited", message: "x" }, 429));
  await p.send("tell me about sleep");
  assert.match(p.last().textContent, /Too many requests/);
});

test("request timeout aborts the request and shows a timeout message with Retry", async () => {
  const p = await load(
    (url, opts) => new Promise((_, reject) => opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); })),
    { timeoutMs: 60 }
  );
  await p.send("tell me about sleep");
  await tick(150);
  const b = p.last();
  assert.ok(b.classList.contains("error"));
  assert.match(b.textContent, /took too long/);
  assert.ok([...b.querySelectorAll("button")].some((x) => x.textContent === "Retry"));
  assert.equal(p.btn.disabled, false);
});

test("a server-flagged emergency is displayed as an emergency", async () => {
  const p = await load(() => okJson({ reply: "Call 112 now. (server)", emergency: true, source: "emergency-rules" }));
  await p.send("tell me about my situation honestly");
  assert.ok(p.last().classList.contains("emergency"));
});

test("user and AI text are rendered as text, never as HTML", async () => {
  const p = await load(() => okJson({ reply: "<img src=x onerror=alert(1)> <b>bold</b>", source: "gemini" }));
  await p.send("<script>window.__pwned=1</script><img src=x onerror=alert(2)> sleep tips");
  assert.equal(p.messages.querySelectorAll("img, script, b").length, 0);
  assert.ok(p.messages.textContent.includes("<img src=x onerror=alert(1)>"));
  assert.equal(p.dom.window.__pwned, undefined);
});

test("reports, medicines and appointments: add and remove still work", async () => {
  const p = await load();
  const submit = (id) => p.d.getElementById(id).dispatchEvent(new p.dom.window.Event("submit", { cancelable: true, bubbles: true }));
  p.d.getElementById("reportTitle").value = "Check-up";
  p.d.getElementById("reportDate").value = "2026-10-01";
  submit("reportForm");
  assert.match(p.d.getElementById("reportList").textContent, /Check-up/);
  p.d.getElementById("medName").value = "Vitamin D reminder";
  p.d.getElementById("medTime").value = "08:00";
  submit("medForm");
  assert.match(p.d.getElementById("medList").textContent, /Vitamin D reminder/);
  p.d.getElementById("apptTitle").value = "Dental visit";
  p.d.getElementById("apptDate").value = "2026-10-20T10:00";
  submit("apptForm");
  assert.match(p.d.getElementById("apptList").textContent, /Dental visit/);
  [...p.d.querySelectorAll("#apptList button")].find((b) => b.textContent === "Remove").click();
  assert.match(p.d.getElementById("apptList").textContent, /No items added yet/);
});

test("static checks: no secrets or unsafe HTML insertion in client files", () => {
  for (const f of ["index.html", "safety.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/GEMINI_API_KEY|AIza[0-9A-Za-z_-]{20,}|x-goog-api-key/.test(src), f + " must not mention the key");
    assert.ok(!/\.innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(src), f + " must not insert raw HTML");
  }
});

test("mobile layout guard: one-column layout uses minmax(0,1fr) so the nav scrolls instead of widening the page", () => {
  const html = fs.readFileSync(INDEX, "utf8");
  assert.match(html, /@media\(max-width:650px\)\{\.layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(html, /\.nav\{display:flex;overflow:auto\}/, "original horizontally-scrolling nav rule must remain");
});
