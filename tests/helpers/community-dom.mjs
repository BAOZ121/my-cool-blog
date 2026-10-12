/** Minimal deterministic DOM fixture. Not a substitute for browser/rendering QA. */
import { readFileSync } from 'node:fs';
const voidTags = new Set(['INPUT', 'META', 'LINK', 'BR', 'IMG', 'HR']);
const camel = name => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.events = new Map(); this.value = ''; this.defaultValue = ''; this.hidden = false; this.disabled = false; this.checked = false; this.open = false; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Unsafe HTML assignment in connected UI'); }
  append(...nodes) { for (const child of nodes) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'id') this.id = String(value); if (name === 'class') this.className = String(value); if (name === 'name') this.name = String(value); if (name === 'type') this.type = String(value); if (name === 'value') this.value = this.defaultValue = String(value); if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = String(value); if (['disabled', 'hidden', 'required', 'checked'].includes(name)) this[name] = true; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(name, listener) { const list = this.events.get(name) || []; list.push(listener); this.events.set(name, list); }
  dispatch(name, details = {}) { const event = { target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; }, ...details }; for (const listener of this.events.get(name) || []) listener(event); return event; }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.focused = true; }
  showModal() { if (this.open) throw new Error('Already open'); this.open = true; }
  close() { if (!this.open) return; this.open = false; queueMicrotask(() => this.dispatch('close')); }
  querySelectorAll(selector) { const result = []; const visit = parent => { for (const child of parent.children) { if (matches(child, selector)) result.push(child); visit(child); } }; visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { let current = this; while (current) { if (matches(current, selector)) return current; current = current.parentElement; } return null; }
  reset() { for (const element of this.querySelectorAll('input, textarea, select')) element.value = element.defaultValue; }
  reportValidity() { return true; }
}
function matches(element, selector) {
  return selector.split(',').some(part => {
    const tokens = part.trim().split(/\s+/); const last = tokens.pop();
    if (!simple(element, last)) return false;
    let current = element.parentElement;
    while (tokens.length) { const required = tokens.pop(); while (current && !simple(current, required)) current = current.parentElement; if (!current) return false; current = current.parentElement; }
    return true;
  });
}
function simple(element, selector) {
  const id = selector.match(/#([\w-]+)/)?.[1]; if (id && element.id !== id) return false;
  const tag = selector.match(/^[a-z]+/i)?.[0]; if (tag && element.tagName !== tag.toUpperCase()) return false;
  for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    const value = match[1].startsWith('data-') ? element.dataset[camel(match[1].slice(5))] : element.attrs[match[1]];
    if (value === undefined || match[2] !== undefined && value !== match[2]) return false;
  }
  return true;
}
function partial(name) { return readFileSync(new URL(`../../layouts/_partials/community/${name}.html`, import.meta.url), 'utf8').replace(/\{\{ partial "community\/([^".]+)\.html" \. \}\}/g, (_, next) => partial(next)); }
export function createDom(mode = 'forum') {
  const document = new Element('document'); document.visibilityState = 'visible'; document.createElement = tag => new Element(tag); document.getElementById = id => document.querySelector(`#${id}`);
  let source;
  if (['callback', 'recovery'].includes(mode)) source = `<div id="rc-root" data-community-mode="${mode}"><p id="rc-status"></p><form id="rc-recovery-form" hidden><fieldset disabled><input name="password" type="password"><input name="confirmPassword" type="password"></fieldset></form><button id="rc-recovery-mfa" hidden></button><button id="rc-recovery-retry" data-auth-open="reset" hidden></button>${partial('auth')}</div>`;
  else source = partial(mode);
  const stack = [document];
  for (const part of source.replace(/\{\{[\s\S]*?\}\}/g, '').match(/<[^>]+>|[^<]+/g) || []) {
    if (part.startsWith('<!--')) continue;
    if (part.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (part.startsWith('<')) {
      const tag = part.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
      const element = new Element(tag);
      const attrs = part.slice(tag.length + 1, -1);
      for (const match of attrs.matchAll(/([\w:-]+)(?:="([^"]*)"|'([^']*)'|=([^\s>]+))?/g)) element.setAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
      stack.at(-1).append(element); if (!voidTags.has(element.tagName)) stack.push(element);
    } else stack.at(-1)._text += part;
  }
  const window = new Element('window');
  window.location = { href: `https://community.test/test/${mode === 'admin' ? 'forum-admin-v1' : mode === 'forum' ? 'forum-v1' : `auth/${mode}-v1`}/`, hash: '', assign(url) { window.assigned = url; } };
  window.setInterval = () => 1; window.clearInterval = () => {};
  window.FormData = class {
    constructor(form) {
      this.values = new Map();
      for (const input of form.querySelectorAll('input, textarea, select')) {
        let disabled = input.disabled, parent = input.parentElement;
        while (parent && parent !== form) { disabled ||= parent.tagName === 'FIELDSET' && parent.disabled; parent = parent.parentElement; }
        if (!disabled && input.name && (input.type !== 'checkbox' || input.checked)) this.values.set(input.name, input.value);
      }
    }
    get(name) { return this.values.get(name) ?? null; }
  };
  return { document, window, $: id => document.getElementById(id), fill(id, values) { const form = document.getElementById(id); for (const [key, value] of Object.entries(values)) form.querySelector(`[name="${key}"]`).value = value; }, submit(id) { document.getElementById(id).dispatch('submit'); } };
}
