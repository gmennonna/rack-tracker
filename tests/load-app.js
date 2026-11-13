// Loads the app <script> from index.html into a sandbox with minimal browser stubs,
// so its pure functions can be called from Node. init() is not run.
const fs = require('fs'), vm = require('vm');

function loadSource(html){
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/) || html.match(/<script>([\s\S]*)<\/script>/);
  let code = m[1].replace(/\ninit\(\);\s*$/, '\n');
  // Top-level let/const are not properties of the sandbox: expose read/write access to them.
  code += '\n;globalThis.__get = n => eval(n); globalThis.__set = (n, v) => eval(n + " = v");';
  const store = {};
  const el = new Proxy(function(){}, { get:(t, k)=> k === Symbol.toPrimitive ? ()=> '' : el, apply:()=> el, set:()=> true });
  const ctx = { console, Date, Math, JSON, Intl, setTimeout, clearTimeout,
    localStorage:{ getItem:k=> k in store ? store[k] : null, setItem:(k, v)=>{ store[k] = String(v); }, removeItem:k=>{ delete store[k]; } },
    document: el, window: el, navigator: {}, indexedDB: undefined };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'index.html' });
  return ctx;
}

function load(path){
  return loadSource(fs.readFileSync(path, 'utf8'));
}

module.exports = { load, loadSource };
