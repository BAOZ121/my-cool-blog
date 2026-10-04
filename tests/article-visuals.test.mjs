import test from "node:test";
import assert from "node:assert/strict";
import { escapeHTML, validateMap, toMarkmapTree, validateShare, pieOptions, safeVendorURL, mapWheelPixels, mapScaleExtent, stageVisualOffFlow } from "../assets/js/article-visuals.mjs";

const example = () => ({
  title: "Foundry share", scope: "Foundry services", geography: "Global", metric: "Revenue", period: "2025", unit: "%",
  series: [{ name: "Company A", value: 68.5 }, { name: "Company B", value: 15.5 }, { name: "Others", value: 16 }],
  source: { title: "Source report", publisher: "Research institute", url: "https://example.org/report", published: "2026-02-01" },
});

test("partial markets cannot be normalized into misleading whole-market pie charts", () => {
  const data = example(); data.series.pop();
  assert.throws(() => validateShare(data), /denominator/);
  assert.throws(() => pieOptions(data), /denominator/);
});
test("shares reject nonnumeric, negative, nonfinite and duplicate company values", () => {
  for (const value of ["68.5", null, NaN, Infinity, -1, 101]) {
    const data = example(); data.series[0].value = value;
    assert.throws(() => validateShare(data));
  }
  const data = example(); data.series[1].name = " company A ";
  assert.throws(() => validateShare(data), /value/);
});
test("only a documented rounding note allows a small discrepancy from 100 percent", () => {
  const data = example(); data.series[2].value = 16.1;
  assert.throws(() => validateShare(data), /denominator/);
  data.rounding_note = "Totals differ from 100% because the publisher rounded individual values.";
  assert.equal(validateShare(data), data);
  data.series[2].value = 16.3;
  assert.throws(() => validateShare(data), /denominator/);
});
test("share charts require an explicit statistical scope, period and verifiable provenance", () => {
  for (const key of ["period", "scope", "geography", "metric"]) {
    const data = example(); delete data[key]; assert.throws(() => validateShare(data));
  }
  const data = example(); data.source.url = "javascript:alert(1)";
  assert.throws(() => validateShare(data), /source URL/);
});
test("pie interaction cannot hide competitors, and labels use the source's raw share", () => {
  const data = example(); data.rounding_note = "Rounded"; data.series[2].value = 16.1;
  const options = pieOptions(data);
  assert.equal(options.legend.selectedMode, false);
  assert.equal(options.series[0].selectedMode, false);
  assert.deepEqual(options.series[0].data, data.series);
  assert.match(options.tooltip.formatter({ name: "Company A", value: 68.5, percent: 68.431 }), /68\.5%/);
  assert.doesNotMatch(options.tooltip.formatter({ name: "<img onerror=evil>", value: 68.5 }), /<img/);
  assert.match(options.aria.label.description, /68\.5%/);
});
test("chart themes and mobile layout retain all data and respect reduced motion", () => {
  const data = example();
  const light = pieOptions(data);
  const mobile = pieOptions(data, { compact: true, dark: true, reducedMotion: true });
  assert.equal(mobile.animation, false);
  assert.equal(mobile.legend.show, false);
  assert.equal(mobile.series[0].label.show, true);
  assert.notEqual(mobile.textStyle.color, light.textStyle.color);
  assert.deepEqual(mobile.series[0].data, light.series[0].data);
});
test("map text is escaped before it reaches Markmap's HTML rendering", () => {
  const map = { title: "Industry", root: { name: 'A <script>alert("x")</script> & B', children: [{ name: "Upstream", children: [{ name: "Materials", children: [{ name: "Company" }] }] }] } };
  assert.equal(validateMap(map), map);
  const tree = toMarkmapTree(map.root);
  assert.match(tree.content, /&lt;script&gt;/);
  assert.doesNotMatch(tree.content, /<script>/);
  assert.equal(tree.children[0].payload.fold, 0);
  assert.equal(tree.children[0].children[0].payload.fold, 1);
  assert.equal(toMarkmapTree(map.root, true).children[0].children[0].payload.fold, 0);
  assert.equal(escapeHTML("'\"<>&"), "&#39;&quot;&lt;&gt;&amp;");
});
test("invalid or excessively nested trees fail safely without recursion overflow", () => {
  const root = { name: "Root" }; root.children = [root];
  assert.throws(() => validateMap({ title: "Map", root }), /tree/);
  assert.throws(() => validateMap({ title: "Map", root: { name: "A", children: "wrong" } }), /children/);
  let deep = { name: "Leaf" }; for (let i = 0; i < 15; i++) deep = { name: "Node", children: [deep] };
  assert.throws(() => validateMap({ title: "Map", root: deep }), /tree/);
});
test("runtime graphics modules are loaded only from the website's own origin", () => {
  assert.equal(safeVendorURL("/vendor/article-visuals/markmap.js", "https://thedexs.com/post/test/"), "https://thedexs.com/vendor/article-visuals/markmap.js");
  assert.throws(() => safeVendorURL("https://cdn.example.com/map.js", "https://thedexs.com/"), /self-hosted/);
  assert.throws(() => safeVendorURL("data:text/javascript,alert(1)", "https://thedexs.com/"), /self-hosted/);
});


test("map wheel zoom normalizes units without multiplying Ctrl sensitivity", () => {
  for (const modifier of [{}, { ctrlKey: true }, { metaKey: true }]) {
    assert.equal(mapWheelPixels({ deltaY: 2, deltaMode: 0, ...modifier }), 2);
    assert.equal(mapWheelPixels({ deltaY: -2, deltaMode: 1, ...modifier }), -32);
    assert.equal(mapWheelPixels({ deltaY: 1, deltaMode: 2, ...modifier }, 320), 80);
    assert.equal(mapWheelPixels({ deltaY: -100000, deltaMode: 0, ...modifier }), -80);
  }
  for (const deltaY of [NaN, Infinity, -Infinity, undefined]) assert.equal(mapWheelPixels({ deltaY }), 0);
  assert.equal(mapWheelPixels({ deltaY: 0, deltaMode: 0 }), 0);
});
test("map zoom limits allow very large trees to fit without unbounded magnification", () => {
  assert.deepEqual(mapScaleExtent(1), [0.25, 3]);
  assert.deepEqual(mapScaleExtent(0.4), [0.2, 3]);
  assert.deepEqual(mapScaleExtent(0.001), [0.0005, 3]);
  assert.ok(mapScaleExtent(0)[0] > 0);
});


test("loading graphics render out of flow and restore original styles atomically", () => {
  const stage = { hidden: true, style: { position: "", width: "", visibility: "", color: "red" } };
  const restore = stageVisualOffFlow(stage, 311.5);
  assert.equal(stage.hidden, false);
  assert.equal(stage.style.position, "absolute");
  assert.equal(stage.style.width, "311.5px");
  assert.equal(stage.style.visibility, "hidden");
  restore();
  assert.deepEqual(stage.style, { position: "", width: "", visibility: "", color: "red" });
});
