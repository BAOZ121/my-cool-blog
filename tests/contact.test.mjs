import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = readFileSync(new URL("../static/js/contact.js", import.meta.url), "utf8");
const response = (success, ok = true, message) => ({ ok, json: async () => ({ success, message }) });

function page(fetchResponse, { valid = true } = {}) {
  const listeners = {};
  const timers = new Map();
  const calls = [];
  const values = { name: "A reader", email: "reader@example.org", message: "Please check this report." };
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }]));
  const status = { dataset: {}, textContent: "" };
  const button = { disabled: false, textContent: "Send Message" };
  const attributes = new Map();
  let resetCount = 0;
  const form = {
    dataset: {}, action: "https://example.invalid/contact", elements: { namedItem: name => fields[name] },
    querySelector: () => button,
    reportValidity: () => valid,
    setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, callback) => { listeners[name] = callback; },
    reset: () => { resetCount++; Object.values(fields).forEach(field => { field.value = ""; }); },
  };
  vm.runInNewContext(script, {
    document: { getElementById: id => id === "contact-form" ? form : status },
    FormData: class { constructor() { this.values = { ...values }; } },
    AbortController,
    fetch: (url, options) => { calls.push({ url, ...options }); return fetchResponse(url, options); },
    setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    button, status, form, fields, attributes, calls, timers,
    submit: () => listeners.submit({ preventDefault() {} }),
    expire: () => [...timers.values()].forEach(timer => timer.callback()),
    get resetCount() { return resetCount; },
  };
}

function assertRestored(p) {
  assert.equal(p.button.disabled, false);
  assert.equal(p.button.textContent, "Send Message");
  assert.equal(p.attributes.get("aria-busy"), "false");
  assert.equal(p.timers.size, 0);
}

test("a slow submission is locked and a second submit cannot send a duplicate", async () => {
  let resolveRequest;
  const p = page(() => new Promise(resolve => { resolveRequest = resolve; }));
  const first = p.submit();
  assert.equal(p.button.disabled, true);
  assert.equal(p.attributes.get("aria-busy"), "true");
  assert.equal(p.status.dataset.state, "sending");
  await p.submit();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].method, "POST");
  resolveRequest(response(true));
  await first;
  assert.equal(p.status.dataset.state, "success");
  assert.equal(p.resetCount, 1);
  assertRestored(p);
});

test("service rejection preserves the draft and permits a deliberate later retry", async () => {
  let accepted = false;
  const p = page(() => Promise.resolve(response(accepted, true, "Please check the supplied address.")));
  await p.submit();
  assert.equal(p.status.dataset.state, "rejected");
  assert.match(p.status.textContent, /check the supplied address/);
  assert.equal(p.fields.message.value, "Please check this report.");
  assert.equal(p.resetCount, 0);
  assertRestored(p);
  accepted = true;
  await p.submit();
  assert.equal(p.calls.length, 2);
  assert.equal(p.status.dataset.state, "success");
  assertRestored(p);
});

test("HTTP errors cannot clear the draft even if an unexpected body says success", async () => {
  const p = page(() => Promise.resolve(response(true, false)));
  await p.submit();
  assert.equal(p.status.dataset.state, "rejected");
  assert.equal(p.resetCount, 0);
  assertRestored(p);
});

test("network failure preserves text and does not claim the message was delivered", async () => {
  const p = page(() => Promise.reject(new TypeError("Failed to fetch")));
  await p.submit();
  assert.equal(p.status.dataset.state, "error");
  assert.match(p.status.textContent, /could not confirm delivery/i);
  assert.equal(p.fields.email.value, "reader@example.org");
  assert.equal(p.resetCount, 0);
  assert.equal(p.calls.length, 1);
  assertRestored(p);
});

test("a stalled response times out, aborts and unlocks without resending or losing the draft", async () => {
  const p = page(() => new Promise(() => {}));
  const submission = p.submit();
  assert.equal([...p.timers.values()][0].delay, 20000);
  p.expire();
  await submission;
  assert.equal(p.calls[0].signal.aborted, true);
  assert.equal(p.status.dataset.state, "timeout");
  assert.match(p.status.textContent, /could not confirm delivery/i);
  assert.equal(p.calls.length, 1);
  assert.equal(p.resetCount, 0);
  assert.equal(p.fields.message.value, "Please check this report.");
  assertRestored(p);
});

test("a late successful response cannot erase edits made while the request was pending", async () => {
  let resolveRequest;
  const p = page(() => new Promise(resolve => { resolveRequest = resolve; }));
  const submission = p.submit();
  p.fields.message.value = "A new detail to send separately.";
  resolveRequest(response(true));
  await submission;
  assert.equal(p.status.dataset.state, "success");
  assert.equal(p.resetCount, 0);
  assert.equal(p.fields.message.value, "A new detail to send separately.");
  assert.match(p.status.textContent, /new edits are still here/);
  assertRestored(p);
});

test("invalid fields prevent a request before the form is locked", async () => {
  const p = page(() => { throw new Error("Should not send"); }, { valid: false });
  await p.submit();
  assert.equal(p.calls.length, 0);
  assert.equal(p.button.disabled, false);
  assert.equal(p.timers.size, 0);
});
