import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escapeHTML, validateMap, toMarkmapTree, validateShare, pieOptions, safeVendorURL, mapWheelPixels, mapScaleExtent, stageVisualOffFlow, commitVisualLayout, visualNearViewport, initVisual } from "../assets/js/article-visuals.mjs";

const example = () => ({
  title: "Foundry share", scope: "Foundry services", geography: "Global", metric: "Revenue", period: "2025", unit: "%",
  series: [{ name: "Company A", value: 68.5 }, { name: "Company B", value: 15.5 }, { name: "Others", value: 16 }],
  source: { title: "Source report", publisher: "Research institute", url: "https://example.org/report", published: "2026-02-01" },
});

const retailExample = () => ({
  ...example(), title: "India tractor retail registrations", period: "FY2025–26", geography: "India", metric: "Share of covered retail registrations",
  percentDecimals: 2, totalUnits: 1050077, unitsLabel: "retail units",
  rounding_note: "Published percentages total 100.01% because of rounding; slice areas retain the integer registrations.",
  series: [
    { name: "Mahindra & Mahindra (Tractor)", value: 23.81, units: 249973 },
    { name: "Mahindra & Mahindra (Swaraj Division)", value: 18.76, units: 196975 },
    { name: "International Tractors", value: 12.76, units: 134030 },
    { name: "TAFE", value: 11.27, units: 118326 },
    { name: "Escorts Kubota", value: 10.90, units: 114468 },
    { name: "John Deere India", value: 7.63, units: 80086 },
    { name: "Eicher Tractors", value: 6.21, units: 65215 },
    { name: "CNH Industrial (India)", value: 4.49, units: 47122 },
    { name: "Others", value: 4.18, units: 43882 },
  ],
  colors: ["#d6b56f", "#67b8b0", "#7ea5dc", "#e58b78", "#a995d3", "#a4bd7e", "#d78fb3", "#8baeb8", "#c6ab8a"],
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
test("integer registrations determine slice geometry while every label retains the published share", () => {
  const data = retailExample();
  const original = structuredClone(data);
  assert.equal(validateShare(data), data);
  for (const compact of [false, true]) for (const dark of [false, true]) {
    const options = pieOptions(data, { compact, dark });
    assert.deepEqual(options.series[0].data.map((item) => item.value), data.series.map((item) => item.units));
    assert.equal(options.series[0].data.reduce((sum, item) => sum + item.value, 0), data.totalUnits);
    const row = options.series[0].data.find((item) => item.name === "Escorts Kubota");
    const tooltip = options.tooltip.formatter({ ...row, percent: 10.900915 });
    assert.match(tooltip, /10\.90%/);
    assert.match(tooltip, /114,468 retail units/);
    assert.doesNotMatch(tooltip, /114468%|114,468%|10\.900915/);
    assert.equal(options.legend.formatter(row.name), "Escorts Kubota  10.90%");
    assert.equal(options.series[0].label.formatter(row), "10.90%");
    const small = options.series[0].data.find((item) => item.name === "Others");
    assert.equal(options.series[0].label.formatter(small), "", "Small-slice label decisions use the share rather than the raw count");
    assert.match(options.aria.label.description, /Escorts Kubota: 10\.90%/);
    assert.doesNotMatch(options.aria.label.description, /114468%|114,468%/);
    assert.deepEqual(options.color, data.colors);
  }
  assert.deepEqual(data, original, "Preparing raw-unit charts does not mutate their source data");
});
test("raw-unit charts reject missing, mixed, unsafe and inconsistent denominators", () => {
  for (const units of [undefined, null, "249973", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const data = retailExample(); data.series[0].units = units;
    assert.throws(() => validateShare(data), /raw units/);
  }
  for (const total of [undefined, null, "1050077", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const data = retailExample(); data.totalUnits = total;
    assert.throws(() => validateShare(data), /integer total/);
  }
  const missing = retailExample(); delete missing.series[0].units;
  assert.throws(() => validateShare(missing), /incomplete raw units/);
  const wrongTotal = retailExample(); wrongTotal.totalUnits++;
  assert.throws(() => validateShare(wrongTotal), /raw unit denominator/);
  const wrongShare = retailExample(); wrongShare.series[4].value = 10.91;
  assert.throws(() => validateShare(wrongShare), /share disagrees/);
  const missingPrecision = retailExample(); delete missingPrecision.percentDecimals;
  assert.throws(() => validateShare(missingPrecision), /percentage precision/);
  const zero = { ...retailExample(), totalUnits: 10, series: [{ name: "A", value: 100, units: 10 }, { name: "B", value: 0, units: 0 }] };
  assert.equal(validateShare(zero), zero, "A disclosed zero-unit category is retained");
});
test("explicit generic percentage precision preserves trailing zeros without changing legacy defaults", () => {
  const legacy = pieOptions(example());
  assert.equal(legacy.legend.formatter("Company B"), "Company B  15.5%");
  const data = example(); data.percentDecimals = 2;
  const options = pieOptions(data, { compact: true });
  assert.equal(options.legend.formatter("Company B"), "Company B  15.50%");
  assert.equal(options.series[0].label.formatter(data.series[1]), "15.50%");
  assert.match(options.tooltip.formatter(data.series[1]), /15\.50%/);
  assert.match(options.aria.label.description, /Company B: 15\.50%/);
  for (const precision of [-1, 1.5, "2", 7, Infinity]) {
    const invalid = example(); invalid.percentDecimals = precision;
    assert.throws(() => validateShare(invalid), /precision/);
  }
});
test("valid explicit palettes work in both schemes and invalid palettes retain the existing colors", () => {
  const data = retailExample();
  for (const dark of [false, true]) assert.deepEqual(pieOptions(data, { dark }).color, data.colors);
  const fallback = pieOptions(example()).color;
  for (const colors of [[], ["#123456"], ["#123456", "red", "#abcdef"], "#abcdef", [null, "#abcdef", "#123456"]]) {
    const invalid = example(); invalid.colors = colors;
    assert.deepEqual(pieOptions(invalid).color, fallback);
  }
  data.unitsLabel = "<img onerror=evil>";
  const tooltip = pieOptions(data).tooltip.formatter({ name: data.series[0].name, value: data.series[0].units });
  assert.match(tooltip, /249,973 &lt;img onerror=evil&gt;/);
  assert.doesNotMatch(tooltip, /<img/);
});
test("share charts retain distinct site or company colors with readable percentage labels", () => {
  const shares = JSON.parse(readFileSync(new URL("../data/article_visuals.json", import.meta.url))).shares;
  const expected = ["#d6b56f", "#67b8b0", "#7ea5dc", "#e58b78", "#a995d3", "#a4bd7e", "#d78fb3", "#8baeb8"];
  const nvidiaColors = ["#76b900", "#b7e36f", "#4f8b36", "#9dba85", "#6b8f5d", "#d5e7c8", "#86c748", "#c1df9b"];
  const nuclearColors = {
    light: ["#202020", "#a98428", "#969696", "#d3bd7b", "#eeeeee"],
    dark: ["#eeeeee", "#d6b56f", "#a4a4a4", "#f0dfb3", "#555555"],
  };
  const luminance = (hex) => {
    const [r, g, b] = hex.slice(1).match(/../g).map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const data of Object.values(shares)) {
    const original = structuredClone(data);
    for (const dark of [false, true]) for (const compact of [false, true]) {
      const options = pieOptions(data, { dark, compact });
      assert.deepEqual(options.color, data.theme === "nuclear-gold" ? nuclearColors[dark ? "dark" : "light"] : data.theme === "nvidia" ? nvidiaColors : expected);
      assert.equal(new Set(options.color.slice(0, data.series.length)).size, data.series.length);
      assert.deepEqual(options.series[0].data.map(({ name, value }) => ({ name, value })), data.series.map(({ name, value }) => ({ name, value })));
      if (data.theme !== "nuclear-gold") assert.ok(options.series[0].data.every((item) => !item.label), "Existing charts retain their label defaults");
      for (const [index, color] of options.color.entries()) {
        const labelColor = options.series[0].data[index]?.label?.color || options.series[0].label.color;
        const light = Math.max(luminance(color), luminance(labelColor));
        const dark = Math.min(luminance(color), luminance(labelColor));
        const contrast = (light + 0.05) / (dark + 0.05);
        assert.ok(contrast >= 4.5, `${color} must retain readable compact percentage labels`);
      }
    }
    assert.deepEqual(data, original, "Color selection must not mutate chart data");
  }
});

test("nuclear capacity shares preserve one decimal in every interactive percentage", () => {
  const data = JSON.parse(readFileSync(new URL("../data/article_visuals.json", import.meta.url))).shares["uranium-enrichment-capacity-2025"];
  const original = structuredClone(data);
  for (const dark of [false, true]) {
    const options = pieOptions(data, { dark, compact: true });
    const orano = data.series.find((item) => item.name === "Orano");
    assert.equal(orano.value, 11);
    assert.match(options.tooltip.formatter(orano), /11\.0%/);
    assert.match(options.legend.formatter("Orano"), /11\.0%/);
    assert.equal(options.series[0].label.formatter(orano), "11.0%");
    assert.match(options.aria.label.description, /Orano: 11\.0%/);
    assert.deepEqual(options.series[0].data.map(({ name, value }) => ({ name, value })), data.series.map(({ name, value }) => ({ name, value })));
  }
  assert.deepEqual(data, original);
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

test("graphic swaps settle position changes before releasing natural height", () => {
  const events = [];
  const figure = {
    style: { height: "auto" },
    getBoundingClientRect() { events.push(["measure", this.style.height]); return { height: 1234.5 }; },
  };
  commitVisualLayout(figure, () => events.push(["commit", figure.style.height]));
  assert.deepEqual(events, [["measure", "auto"], ["commit", "1234.5px"], ["measure", "1234.5px"]]);
  assert.equal(figure.style.height, "auto");
  assert.throws(() => commitVisualLayout(figure, () => { throw new Error("render failed"); }), /render failed/);
  assert.equal(figure.style.height, "auto", "failed enhancement never leaves a fixed-height article graphic");
});

test("stale lazy-graphic notifications cannot initialize offscreen or detached geometry", async () => {
  const rect = { width: 800, height: 1000, top: -1320, bottom: -320 };
  assert.equal(visualNearViewport(rect, 900), false, "Restored reading view is beyond the240px lazy margin");
  assert.equal(visualNearViewport({ ...rect, top: -1240, bottom: -240 }, 900), true);
  assert.equal(visualNearViewport({ ...rect, top: 1140, bottom: 2140 }, 900), true);
  assert.equal(visualNearViewport({ ...rect, top: 1141, bottom: 2141 }, 900), false);
  assert.equal(visualNearViewport({ ...rect, width: 0 }, 900), false);
  assert.equal(visualNearViewport({ ...rect, height: 0 }, 900), false);
  const figure = { dataset: {}, querySelector() { throw new Error("No rendering work should start"); } };
  assert.equal(await initVisual(figure, () => false), "deferred");
  assert.deepEqual(figure.dataset, {});
});
