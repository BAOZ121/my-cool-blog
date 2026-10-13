/** Deterministic account-widget fixture. Browser/layout QA remains separate. */
class Target {
  constructor() { this.events = new Map(); }
  addEventListener(type, listener) {
    if (!this.events.has(type)) this.events.set(type, new Set());
    this.events.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.events.get(type)?.delete(listener); }
  dispatch(type, detail = {}) {
    const event = { type, target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...detail };
    for (const listener of this.events.get(type) || []) listener(event);
    return event;
  }
}
class Element extends Target {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map();
    this.dataset = {}; this.hidden = false; this.disabled = false; this.open = false; this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Account UI must render plain text.'); }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
  }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) {
    this.attrs.delete(name);
    if (name === 'hidden') this.hidden = false;
    if (name === 'disabled') this.disabled = false;
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  matches(selector) {
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attribute = selector.match(/^\[([^\]]+)\]$/);
    return attribute ? this.hasAttribute(attribute[1]) : this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (selector.split(',').some(part => child.matches(part.trim()))) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus(options) { this.focused = true; this.focusOptions = options; }
  click() { if (!this.disabled) return this.dispatch('click'); }
}
export function createSiteAccountDom() {
  const document = new Element('document');
  document.visibilityState = 'visible'; document.hidden = false;
  document.getElementById = id => document.querySelector(`#${id}`);
  document.createElement = tag => new Element(tag);
  const nodes = {};
  const add = (name, tag, parent, text = '') => {
    const element = new Element(tag); element.setAttribute(`data-site-account${name ? '-' + name : ''}`, '');
    element.textContent = text; parent.append(element); nodes[name || 'root'] = element; return element;
  };
  const root = add('', 'section', document);
  const guest = add('guest', 'div', root);
  const signin = new Element('a'); signin.setAttribute('href', '/test/forum-v1/#signin'); signin.textContent = 'Sign in';
  const register = new Element('a'); register.setAttribute('href', '/test/forum-v1/#register'); register.textContent = 'Register';
  guest.append(signin, register);
  const member = add('member', 'details', root); member.hidden = true;
  const summary = new Element('summary'); summary.textContent = 'Your account'; member.append(summary);
  add('avatar', 'span', summary);
  const account = add('account', 'a', member, 'Account & sign out'); account.setAttribute('href', '/test/forum-v1/#account');
  add('status', 'p', root);
  const window = new Target();
  window.location = { origin: 'https://community.test', pathname: '/post/example/', href: 'https://community.test/post/example/' };
  const timers = new Map(); let timerId = 0;
  window.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  return { document, window, nodes, signin, register, account, timers,
    runTimers() { const pending = [...timers]; timers.clear(); for (const [, timer] of pending) timer.callback(); },
    visibility(hidden) { document.hidden = hidden; document.visibilityState = hidden ? 'hidden' : 'visible'; document.dispatch('visibilitychange'); } };
}
