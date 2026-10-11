// Self-check: runs the page script against a stub DOM, renders every route,
// and verifies every href="#..." (static markup + generated HTML) resolves.
const fs = require("fs"), vm = require("vm"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const code = scripts[scripts.length - 1];
fs.writeFileSync("/tmp/shaalix-inline.js", code);
const markup = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

const els = {};
const noop = () => {};
function el(sel) {
  const e = {
    sel, _html: "", hidden: true, dataset: {}, style: { setProperty: noop, scrollBehavior: "" },
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop,
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    contains: () => false, closest: () => null, getBoundingClientRect: () => ({ bottom: 64 }),
    insertAdjacentHTML(_, h) { this._html += h; },
    get innerHTML() { return this._html; }, set innerHTML(h) { this._html = h; },
  };
  return e;
}
const $el = (s) => (els[s] = els[s] || el(s));
const listeners = [];
const ctx = {
  console, setTimeout, clearTimeout, Date, Math, JSON, encodeURIComponent, decodeURIComponent, String, Object, Array,
  location: { hash: "", replace(h) { this.hash = h; } },
  history: { replaceState: (a, b, h) => (ctx.location.hash = h) },
  matchMedia: () => ({ matches: true, addEventListener: noop }),
  requestAnimationFrame: (f) => f(), scrollTo: noop, open: noop,
  addEventListener: (t) => listeners.push("window:" + t),
  document: {
    title: "", documentElement: el("html"),
    querySelector: $el, querySelectorAll: () => [], getElementById: () => null,
    addEventListener: (t) => listeners.push("document:" + t),
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { ROUTES, PAGES } = vm.runInContext("({ ROUTES, PAGES })", ctx);
const norm = vm.runInContext("norm", ctx), ALIASES = vm.runInContext("ALIASES", ctx);
const resolve = (h) => { let p = norm(h); return ALIASES[p] !== undefined ? ALIASES[p] : p; };

const fails = [];
// 1. Every data page has a route (no "Coming soon")
for (const p of Object.keys(PAGES)) if (!ROUTES[p]) fails.push(`PAGES entry without a route: ${p}`);

// 2. Collect HTML: static markup, generated nav/footer/home, and every route's output
const sources = [["static markup", markup]];
for (const s of ["#x-menu", "#x-foot", "#x-blog", "#x-products"]) sources.push([s, $el(s).innerHTML]);
const ids = (h) => new Set([...h.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const staticIds = ids(markup);
let routeCount = 0;
for (const [p, fn] of Object.entries(ROUTES)) {
  $el("#v-dyn").innerHTML = "";
  try { fn(); } catch (err) { fails.push(`Route ${p} threw: ${err.message}`); continue; }
  routeCount++;
  if ($el("#v-dyn").innerHTML) sources.push(["route " + p, $el("#v-dyn").innerHTML]);
}
// 2b. Demo portal: guarded routes redirect when signed out, then render every state signed in
const P = vm.runInContext("({ DB, setUI: (o) => Object.assign(UI, o), PANES, ADMIN_TABS })", ctx);
const DB = P.DB;
const renderAs = (label, path) => {
  $el("#v-dyn").innerHTML = "";
  let r; try { r = ROUTES[path](); } catch (err) { fails.push(`Portal ${label} threw: ${err.stack}`); return ""; }
  if (typeof r === "string") fails.push(`Portal ${label} redirected to ${r}`);
  sources.push(["portal " + label, $el("#v-dyn").innerHTML]); return $el("#v-dyn").innerHTML;
};
for (const p of ["/portal/admin", "/portal/student"]) { DB.logout(); if (ROUTES[p]() !== "/portal") fails.push(`${p} should redirect to /portal when signed out`); }
const expectErr = (label, fn, field) => { try { fn(); fails.push(`${label}: expected an error`); } catch (e) { if (field && e.field !== field) fails.push(`${label}: error on ${e.field}, want ${field} (${e.message})`); } };
expectErr("wrong password", () => DB.login("admin", "admin@srividya.demo", "nope"), "password");
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const sv = DB.getStudents();
if (sv.length !== 7 || sv.filter((s) => s.status === "pending").length !== 1) fails.push(`Sri Vidya seed: ${sv.length} students`);
for (const [tab] of P.ADMIN_TABS) { P.setUI({ tab }); renderAs("admin/" + tab, "/portal/admin"); }
P.setUI({ tab: "students", edit: "new" }); renderAs("admin/students+form", "/portal/admin");
P.setUI({ tab: "fees", edit: null, feeEdit: "new" }); renderAs("admin/fees+form", "/portal/admin");
const fee0 = DB.getFees()[0]; P.setUI({ feeEdit: null, pay: fee0.id }); renderAs("admin/fees+pay", "/portal/admin");
P.setUI({ pay: null, tab: "overview" });
// Isolation: another college's records are out of reach for this admin
DB.login("admin", "admin@greenvalley.demo", "Demo@1234");
const gv = DB.getStudents(), gvFee = DB.getFees()[0];
if (gv.some((s) => sv.find((x) => x.id === s.id))) fails.push("Isolation: Green Valley admin sees Sri Vidya students");
DB.login("admin", "admin@srividya.demo", "Demo@1234");
expectErr("Isolation: edit other college's student", () => DB.updateStudent(gv[0].id, { ...gv[0], name: "X" }));
expectErr("Isolation: approve other college's student", () => DB.setStudentStatus(gv.find((s) => s.status === "pending").id, "approved"));
expectErr("Isolation: pay other college's fee", () => DB.recordPayment(gvFee.id, 1));
expectErr("Isolation: mark other college's attendance", () => DB.markAttendance(vm.runInContext("todayISO()", ctx), { [gv[0].id]: "P" }));
expectErr("Duplicate roll", () => DB.addStudent({ name: "A", roll: sv[0].roll, cls: "MPC 1st Year", sec: "Sec A", email: "a1@x.in", phone: "9876543210" }), "roll");
expectErr("Duplicate email", () => DB.registerCollege({ name: "X", type: "Degree", city: "X", state: "X", admin: "X", email: "admin@srividya.demo", phone: "9876543210", password: "abcdefgh", confirm: "abcdefgh" }), "email");
expectErr("Short password", () => DB.registerCollege({ name: "X", type: "Degree", city: "X", state: "X", admin: "X", email: "n@x.in", phone: "9876543210", password: "abc", confirm: "abc" }), "password");
// Students: own records only, read-only API
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const studentHtml = renderAs("student", "/portal/student");
if (!/Ravi/.test(studentHtml) || /Lakshmi/.test(studentHtml)) fails.push("Student dashboard shows another student's data");
expectErr("Student cannot list students", () => DB.getStudents());
expectErr("Student cannot write fees", () => DB.upsertFee({ head: "x", amount: 1, due: "2026-01-01" }));
DB.login("student", "anil@srividya.demo", "Demo@1234");
if (!/Waiting for your college to approve/.test(renderAs("student/pending", "/portal/student"))) fails.push("Pending student does not see the waiting message");
expectErr("Pending student cannot read fees", () => DB.myFees());
// New college flow: register, code format, student joins by code, admin approves
const c = DB.registerCollege({ name: "Test College", type: "Engineering", city: "Vizag", state: "AP", admin: "T", email: "t@test.in", phone: "9876543210", password: "abcdefgh", confirm: "abcdefgh" });
if (!/^SHX-\d{4}$/.test(c.code)) fails.push("College code format: " + c.code);
renderAs("admin/new-college", "/portal/admin");
DB.registerStudent({ code: c.code, name: "New S", roll: "1", cls: "CSE 1st Year", sec: "Sec A", email: "s@test.in", phone: "9876543211", password: "abcdefgh", confirm: "abcdefgh" });
if (DB.me().student.status !== "pending") fails.push("New student should be pending");
DB.logout();
for (const p of ["/portal", "/portal/register-college", "/portal/register-student"]) renderAs("signed-out " + p, p);
console.log("portal: admin tabs, forms, student views and isolation checked");
const checked = new Set();
for (const [where, h] of sources) {
  const local = new Set([...ids(h), ...staticIds]);
  for (const m of h.matchAll(/href="#([^"]*)"/g)) {
    const v = m[1];
    if (v[0] === "/" || v === "") {
      const r = resolve(v); checked.add(r);
      if (!ROUTES[r]) fails.push(`${where}: href="#${v}" -> no route`);
    } else if (!local.has(v)) fails.push(`${where}: anchor href="#${v}" has no matching id`);
  }
  if (/coming soon/i.test(h)) fails.push(`${where}: still says "Coming soon"`);
}
// 3. Router edge cases
for (const [h, want] of [["", "/"], ["/", "/"], ["/about/", "/about"], ["//products//erp/", "/products/erp"], ["/Blog", "/blog"], ["/team", "/about/team"], ["/nope", "/nope"]]) {
  const got = resolve(h); if (got !== want) fails.push(`norm("${h}") = ${got}, want ${want}`);
}
if (ROUTES["/nope"]) fails.push("unknown slug should 404");
console.log(`routes: ${Object.keys(ROUTES).length} (rendered ${routeCount}), pages: ${Object.keys(PAGES).length}, distinct link targets: ${checked.size}`);
console.log(`listeners: ${listeners.join(", ")}`);
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS: every link resolves to a defined route");
process.exit(fails.length ? 1 : 0);
