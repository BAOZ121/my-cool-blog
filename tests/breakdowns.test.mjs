import test from "node:test";
import assert from "node:assert/strict";
import { initStages } from "../assets/js/breakdowns.mjs";

class Control extends EventTarget {
  constructor(props = {}) { super(); Object.assign(this, { hidden: true, value: "", textContent: "", attributes: {} }, props); }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
}
test("native disclosures, expand/collapse control and print restore state", () => {
  const savedWindow = global.window;
  const events = new Control();
  global.window = events;
  try {
    const toggle = new Control();
    const details = [new Control({ open: false }), new Control({ open: true }), new Control({ open: false })];
    initStages({ querySelector: () => toggle, querySelectorAll: () => details });
    assert.equal(toggle.hidden, false);
    toggle.dispatchEvent(new Event("click"));
    assert.equal(details.every((item) => item.open), true);
    assert.equal(toggle.attributes["aria-expanded"], "true");
    details[0].open = false;
    details[0].dispatchEvent(new Event("toggle"));
    assert.equal(toggle.attributes["aria-expanded"], "false");
    events.dispatchEvent(new Event("beforeprint"));
    assert.equal(details.every((item) => item.open), true);
    events.dispatchEvent(new Event("afterprint"));
    assert.deepEqual(details.map((item) => item.open), [false, true, true]);
    toggle.dispatchEvent(new Event("click"));
    toggle.dispatchEvent(new Event("click"));
    assert.equal(details.every((item) => !item.open), true);
  } finally { global.window = savedWindow; }
});
test("enhancement safely skips unrelated pages", () => {
  initStages({ querySelector: () => null });
});
