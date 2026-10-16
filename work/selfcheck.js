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
// Student fee payment: amount checks, partial then full, receipt, admin sees it
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const due = DB.myFees().find((f) => f.balance > 0 && f.term === "Year 2");
if (!due) fails.push("Ravi should have a Year 2 fee with a balance");
else {
  for (const [v, why] of [["", "empty"], ["0", "zero"], ["-5", "negative"], ["abc", "text"], ["12.345", "3 decimals"], [String(due.balance + 1), "over balance"]]) expectErr(`pay amount ${why}`, () => DB.checkPayAmount(due.id, v), "amount");
  expectErr("UTR must be 12 digits", () => DB.payMyFee(due.id, { amount: 100, payer: "R", ref: "12345" }), "ref");
  expectErr("Payer required", () => DB.payMyFee(due.id, { amount: 100, payer: "", ref: "123456789012" }), "payer");
  P.setUI({ pm: { fee: due.id, mode: "full", amount: due.balance, step: "choose" } }); renderAs("student/pay-choose", "/portal/student");
  P.setUI({ pm: { fee: due.id, mode: "partial", amount: 1000, step: "qr" } });
  if (!/upi:\/\/pay\?pa=shaalix@upi&amp;pn=Sri%20Vidya%20Junior%20College&amp;am=1000\.00&amp;cu=INR&amp;tn=/.test(renderAs("student/pay-qr", "/portal/student"))) fails.push("UPI link in the QR step is wrong");
  const r1 = DB.payMyFee(due.id, { amount: "20000", payer: "Ravi", app: "PhonePe", ref: "111122223333" });
  if (r1.fee.balance !== due.balance - 20000 || r1.fee.status !== "Partial") fails.push("Partial payment did not reduce the balance");
  expectErr("Duplicate UTR", () => DB.payMyFee(due.id, { amount: 1, payer: "R", ref: "111122223333" }), "ref");
  const r2 = DB.payMyFee(due.id, { amount: String(r1.fee.balance), payer: "Ravi", ref: "111122224444" });
  if (r2.fee.balance !== 0 || r2.fee.status !== "Paid") fails.push("Full payment did not clear the fee");
  expectErr("Paid fee cannot be paid again", () => DB.checkPayAmount(due.id, "1"));
  P.setUI({ pm: { fee: due.id, step: "done", receipt: r2 } }); if (!/Payment Done/.test(renderAs("student/pay-done", "/portal/student"))) fails.push("Receipt step missing");
  P.setUI({ pm: null }); const sh = renderAs("student/after-pay", "/portal/student");
  if (!new RegExp(`data-fee="${due.id}"[\\s\\S]*?x-paid`).test(sh) || new RegExp(`data-act="pmOpen" data-id="${due.id}"`).test(sh)) fails.push("Paid fee should show Paid without a Pay Fee button");
  if (DB.myPayments().length !== 2) fails.push("Student payment history should have 2 payments");
  DB.login("admin", "admin@srividya.demo", "Demo@1234");
  if (DB.getPayments().filter((p) => p.ref.startsWith("11112222")).length !== 2) fails.push("Admin does not see the student's payments");
}
// Excel import: export -> replace gives identical data; errors are caught; merge adds and updates
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const toRows = (ex) => ex.sheets.map((sh) => ({ name: sh.name, rows: [sh.cols.map((c) => c.header), ...sh.rows] }));
const before = DB.snapshot(), file = toRows(DB.exportSheets());
const pre = DB.analyzeImport(file, "replace");
if (pre.totals.some((t) => t.skipped)) fails.push("Round trip: export has rows the import rejects: " + JSON.stringify(pre.sheets.flatMap((x) => x.problems).slice(0, 3)));
DB.applyImport(file, "replace");
if (DB.snapshot() !== before) fails.push("Round trip: export + replace import changed the data");
const stuSheet = file.find((x) => x.name === "Students");
const bad = [{ name: "Students", rows: [stuSheet.rows[0], ["SV9001", "New One", "MPC 1st Year", "Sec A", "new1@x.in", "9876500001", "Approved", ""], ["SV9001", "Dup Roll", "MPC 1st Year", "Sec A", "new2@x.in", "9876500002", "", ""], ["SV9002", "Bad Mail", "MPC 1st Year", "Sec A", "nope", "9876500003", "", ""], ["", "No Roll", "MPC 1st Year", "Sec A", "n3@x.in", "9876500004", "", ""], [stuSheet.rows[1][0], "Renamed", stuSheet.rows[1][2], stuSheet.rows[1][3], stuSheet.rows[1][4], stuSheet.rows[1][5], "Approved", ""]] },
  { name: "Fees", rows: [["Roll No", "Semester / Year", "Fee Head", "Amount (₹)", "Due Date"], ["SV9001", "Year 1", "Tuition", "abc", "2026-11-01"], ["SV9001", "Year 1", "Tuition", 5000, "31-02-2026"], ["SV9001", "Year 1", "Tuition", 5000, "01-11-2026"], ["ZZ1", "Year 1", "Tuition", 5000, "01-11-2026"]] },
  { name: "Marks", rows: [["Roll No", "Exam"], ["SV9001", "Unit Test 1"]] }, { name: "Teachers", rows: [["Name"], ["A"]] }];
const an = DB.analyzeImport(bad, "merge"), st = an.sheets.find((x) => x.sheet === "Students"), fe = an.sheets.find((x) => x.sheet === "Fees"), mk = an.sheets.find((x) => x.sheet === "Marks"), te = an.sheets.find((x) => x.sheet === "Teachers");
if (!(st.valid === 2 && st.skipped === 3 && st.added === 1 && st.updated === 1)) fails.push("Import students validation: " + JSON.stringify({ v: st.valid, s: st.skipped, a: st.added, u: st.updated, p: st.problems }));
if (!(fe.valid === 1 && fe.skipped === 3)) fails.push("Import fees validation: " + JSON.stringify(fe.problems));
if (!(mk.missing.includes("Subject") && mk.valid === 0)) fails.push("Import marks: missing columns not reported");
if (!te.ignored) fails.push("Unknown sheet should be ignored");
P.setUI({ tab: "data", imp: { file: "bad.xlsx", sheets: bad }, impMode: "replace" }); if (!/Replace deletes data/.test(renderAs("admin/data+preview", "/portal/admin"))) fails.push("Replace warning missing");
P.setUI({ imp: null, impMode: "merge", tab: "overview" });
const res = DB.applyImport(bad, "merge");
if (res.students.added !== 1 || res.students.updated !== 1 || res.fees.added !== 1) fails.push("Merge result: " + JSON.stringify(res));
if (!DB.getStudents().find((x) => x.roll === "SV9001") || DB.getStudents().find((x) => x.roll === stuSheet.rows[1][0]).name !== "Renamed") fails.push("Merge did not add/update students");
DB.applyImport(file, "replace");
if (DB.snapshot() !== before) fails.push("Replace with the earlier export did not restore the data");
DB.resetDemo();
if (DB.getPayments().some((p) => p.ref.startsWith("11112222"))) fails.push("Reset demo data kept payments");
console.log("portal: admin tabs, forms, student views, isolation, fee payment and Excel import checked");
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
