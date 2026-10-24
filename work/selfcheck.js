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
expectErr("Duplicate roll", () => DB.addStudent({ name: "A", roll: sv[0].roll, branch: "CSE", sec: "Sec A", email: "a1@x.in", phone: "9876543210" }), "roll");
expectErr("Duplicate email", () => DB.registerCollege({ name: "X", type: "Degree", city: "X", state: "X", admin: "X", email: "admin@srividya.demo", phone: "9876543210", password: "abcdefgh", confirm: "abcdefgh" }), "email");
expectErr("Short password", () => DB.registerCollege({ name: "X", type: "Degree", city: "X", state: "X", admin: "X", email: "n@x.in", phone: "9876543210", password: "abc", confirm: "abc" }), "password");
// Students: own records only, read-only API (except their own contact details)
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const studentHtml = renderAs("student", "/portal/student");
if (!/Ravi/.test(studentHtml) || /Lakshmi/.test(studentHtml)) fails.push("Student dashboard shows another student's data");
expectErr("Student cannot list students", () => DB.getStudents());
expectErr("Student cannot write fees", () => DB.upsertFee({ year: 1, type: "Tuition", amount: 1, due: "2026-01-01" }));
expectErr("Student cannot edit a full profile", () => DB.updateStudent(DB.me().student.id, { name: "X" }));
DB.login("student", "anil@srividya.demo", "Demo@1234");
if (!/Waiting for your college to approve/.test(renderAs("student/pending", "/portal/student"))) fails.push("Pending student does not see the waiting message");
expectErr("Pending student cannot read fees", () => DB.myFees());
expectErr("Pending student cannot edit contact", () => DB.updateMyContact({ phone: "9876543210", email: "anil2@x.in", address: "x" }));
// New college flow: register, code format, student joins by code, admin approves
const c = DB.registerCollege({ name: "Test College", type: "Engineering", city: "Vizag", state: "AP", admin: "T", email: "t@test.in", phone: "9876543210", password: "abcdefgh", confirm: "abcdefgh" });
if (!/^SHX-\d{4}$/.test(c.code)) fails.push("College code format: " + c.code);
renderAs("admin/new-college", "/portal/admin");
DB.registerStudent({ code: c.code, name: "New S", roll: "1", branch: "CSE", admType: "Lateral Entry", curYear: "2", sec: "Sec A", email: "s@test.in", phone: "9876543211", password: "abcdefgh", confirm: "abcdefgh" });
if (DB.me().student.status !== "pending") fails.push("New student should be pending");
if (DB.me().student.cls !== "B.Tech CSE 2nd Year") fails.push("Class should be derived from course, branch and year: " + DB.me().student.cls);
DB.login("admin", "t@test.in", "abcdefgh");
const ns = DB.getStudents()[0]; DB.setStudentStatus(ns.id, "approved");
const nsYears = DB.getFees(ns.id).map((f) => f.yearLabel + " " + f.type).join(",");
if (nsYears !== "Year 2 Tuition,Year 2 Affiliation,Year 3 Tuition,Year 3 Affiliation,Year 4 Tuition,Year 4 Affiliation") fails.push("Approving a lateral student should create Year 2-4 fees: " + nsYears);
expectErr("Lateral student: no Year 1 fee", () => DB.upsertFee({ student_id: ns.id, year: "1", type: "Tuition", amount: 85000, due: "2026-11-15" }), "year");
expectErr("Duplicate fee line", () => DB.upsertFee({ student_id: ns.id, year: "2", type: "Affiliation", amount: 6000, due: "2026-11-15" }), "type");
const ns2 = DB.addStudent({ name: "Reg S", roll: "2", branch: "ECE", admType: "Regular", curYear: "1", sec: "Sec A", email: "r2@test.in", phone: "9876543212" });
if (DB.getFees(ns2.id).length !== 8 || DB.getFees(ns2.id)[0].amount !== 85000 || DB.getFees(ns2.id)[1].amount !== 6000) fails.push("New regular student should get 8 fee lines (Year 1-4, Tuition 85000 + Affiliation 6000)");
expectErr("Regular -> Lateral with Year 1 fees", () => DB.updateStudent(ns2.id, { admType: "Lateral Entry", curYear: "2" }), "admType");
DB.logout();
for (const p of ["/portal", "/portal/register-college", "/portal/register-student"]) renderAs("signed-out " + p, p);

// B.Tech year-wise fees: regular Year 1-4, lateral Year 2-4; past paid, current open, future upcoming
const yearsOf = (fees) => [...new Set(fees.map((f) => f.year))].join(",");
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const rv = DB.myFees(), rvMe = DB.me().student;
if (rvMe.admType !== "Regular" || rvMe.curYear !== 3) fails.push("Ravi should be a regular Year 3 student");
if (yearsOf(rv) !== "1,2,3,4" || rv.length !== 8) fails.push("Regular student should have Year 1-4 with 2 lines each: " + yearsOf(rv));
if (!rv.every((f) => (f.type === "Tuition" ? f.amount === 85000 && f.head === "Tuition Fee (Full fee)" : f.amount === 6000 && f.head === "Affiliation Fee"))) fails.push("Fee lines should be Tuition Fee (Full fee) 85,000 and Affiliation Fee 6,000");
if (!rv.filter((f) => f.year < 3).every((f) => f.status === "Paid")) fails.push("Past years should be fully paid");
if (!rv.filter((f) => f.year === 3).some((f) => f.balance > 0)) fails.push("Current year should be partly or wholly unpaid");
if (!rv.filter((f) => f.year === 4).every((f) => f.paid === 0 && f.phase === "Upcoming")) fails.push("Future years should be upcoming");
if (rv.some((f) => "term" in f)) fails.push("Fees still carry a term field");
const rvHtml = renderAs("student/fees", "/portal/student");
for (const y of [1, 2, 3, 4]) if (!rvHtml.includes(`data-year="Year ${y}"`)) fails.push(`Regular student: missing Year ${y} table`);
if (!/data-course-total/.test(rvHtml) || !/Upcoming/.test(rvHtml)) fails.push("Student fees: course total or Upcoming missing");
if (!new RegExp(`data-act="pmOpen" data-id="${rv.find((f) => f.year === 4).id}"`).test(rvHtml)) fails.push("Upcoming year should still be payable");
DB.login("student", "lakshmi@srividya.demo", "Demo@1234");
const lk = DB.myFees(), lkMe = DB.me().student;
if (lkMe.admType !== "Lateral Entry" || lkMe.curYear !== 3) fails.push("Lakshmi should be a lateral entry Year 3 student");
if (yearsOf(lk) !== "2,3,4" || lk.length !== 6) fails.push("Lateral student should have Year 2-4 only: " + yearsOf(lk));
const lkHtml = renderAs("student/lateral", "/portal/student");
if (lkHtml.includes('data-year="Year 1"') || !/Not applicable · lateral entry joins directly in Year 2/.test(lkHtml)) fails.push("Lateral student: Year 1 should show as not applicable");
// Profile: masked Aadhaar with a reveal toggle, contact edit only
if (!lkMe.aadhaar || !/^\d{12}$/.test(lkMe.aadhaar)) fails.push("Seeded Aadhaar should be 12 digits");
if (!lkHtml.includes("XXXX XXXX " + lkMe.aadhaar.slice(-4)) || lkHtml.includes(lkMe.aadhaar) || lkHtml.includes(lkMe.aadhaar.replace(/(\d{4})(?=\d)/g, "$1 "))) fails.push("Aadhaar must render masked");
P.setUI({ showAad: true }); if (!renderAs("student/aadhaar-shown", "/portal/student").includes(lkMe.aadhaar.replace(/(\d{4})(?=\d)/g, "$1 "))) fails.push("Aadhaar reveal does not show the number"); P.setUI({ showAad: false });
for (const k of ["father", "mother", "dob", "gender", "blood", "address", "religion", "category", "caste", "income", "incomeCert", "incomeValid", "schEligible", "schScheme", "schStatus", "prevQual", "prevPct", "admYear"]) if (lkMe[k] === "" || lkMe[k] === undefined) fails.push(`Seed: Lakshmi has no ${k}`);
for (const t of ["Personal", "Identity", "Category / caste", "Income", "Scholarship", "Academic", "Lateral Entry"]) if (!lkHtml.includes(t)) fails.push(`Profile view: missing ${t}`);
expectErr("Contact: bad mobile", () => DB.updateMyContact({ phone: "123", email: lkMe.email, address: "x" }), "phone");
expectErr("Contact: email taken", () => DB.updateMyContact({ phone: lkMe.phone, email: "ravi@srividya.demo", address: "x" }), "email");
const upd = DB.updateMyContact({ phone: "9123456780", email: "lakshmi.p@srividya.demo", address: "D.No 1-2-3, Test Street, Visakhapatnam", name: "Hacker", aadhaar: "999999999999", category: "OC", curYear: 4 });
if (upd.phone !== "9123456780" || upd.email !== "lakshmi.p@srividya.demo" || upd.name !== lkMe.name || upd.aadhaar !== lkMe.aadhaar || upd.category !== lkMe.category || upd.curYear !== 3) fails.push("Student contact edit changed more than mobile, email and address");
DB.logout(); DB.login("student", "lakshmi.p@srividya.demo", "Demo@1234");
// Admin edits a profile: validation
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const lkA = DB.getStudents().find((x) => x.roll === lkMe.roll);
for (const [v, why] of [["12345678901", "11 digits"], ["1234567890123", "13 digits"], ["12345678901a", "letter"], ["012345678901", "starts with 0"]]) expectErr(`Aadhaar ${why}`, () => DB.updateStudent(lkA.id, { aadhaar: v }), "aadhaar");
expectErr("Category not in list", () => DB.updateStudent(lkA.id, { category: "GEN" }), "category");
expectErr("Income not numeric", () => DB.updateStudent(lkA.id, { income: "two lakh" }), "income");
expectErr("Lateral in Year 1", () => DB.updateStudent(lkA.id, { curYear: "1" }), "curYear");
expectErr("Duplicate Aadhaar", () => DB.updateStudent(lkA.id, { aadhaar: DB.getStudents().find((x) => x.id !== lkA.id && x.aadhaar).aadhaar }), "aadhaar");
const ed = DB.updateStudent(lkA.id, { aadhaar: "9999 8888 7777", category: "bc a", income: "1,75,000", schStatus: "Disbursed", father: "K. Appa Rao Garu" });
if (ed.aadhaar !== "999988887777" || ed.category !== "BC-A" || ed.income !== 175000 || ed.schStatus !== "Disbursed" || ed.father !== "K. Appa Rao Garu" || ed.name !== lkA.name) fails.push("Admin profile edit did not save: " + JSON.stringify({ a: ed.aadhaar, c: ed.category, i: ed.income }));
P.setUI({ tab: "students", view: lkA.id }); const pvHtml = renderAs("admin/students+profile", "/portal/admin");
if (!pvHtml.includes("XXXX XXXX 7777") || pvHtml.includes("999988887777")) fails.push("Admin profile view must mask Aadhaar");
P.setUI({ view: null, edit: lkA.id }); const efHtml = renderAs("admin/students+edit", "/portal/admin");
for (const n of ["father", "mother", "dob", "gender", "blood", "address", "aadhaar", "apaar", "religion", "category", "caste", "casteCert", "income", "incomeCert", "incomeValid", "schEligible", "schScheme", "schStatus", "roll", "branch", "admType", "admYear", "curYear", "prevQual", "prevPct"]) if (!efHtml.includes(`name="${n}"`)) fails.push(`Admin edit form: missing field ${n}`);
P.setUI({ edit: null, tab: "overview" });

// Student fee payment on a Year line: amount checks, partial then full, receipt, admin sees it
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const due = DB.myFees().find((f) => f.balance > 0 && f.year === 3 && f.type === "Tuition");
if (!due) fails.push("Ravi should have a Year 3 Tuition fee with a balance");
else {
  for (const [v, why] of [["", "empty"], ["0", "zero"], ["-5", "negative"], ["abc", "text"], ["12.345", "3 decimals"], [String(due.balance + 1), "over balance"]]) expectErr(`pay amount ${why}`, () => DB.checkPayAmount(due.id, v), "amount");
  expectErr("UTR must be 12 digits", () => DB.payMyFee(due.id, { amount: 100, payer: "R", ref: "12345" }), "ref");
  expectErr("Payer required", () => DB.payMyFee(due.id, { amount: 100, payer: "", ref: "123456789012" }), "payer");
  P.setUI({ pm: { fee: due.id, mode: "full", amount: due.balance, step: "choose" } }); renderAs("student/pay-choose", "/portal/student");
  P.setUI({ pm: { fee: due.id, mode: "partial", amount: 1000, step: "qr" } });
  if (!/upi:\/\/pay\?pa=shaalix@upi&amp;pn=Sri%20Vidya%20Institute%20of%20Technology&amp;am=1000\.00&amp;cu=INR&amp;tn=Year%203%20-%20Tuition%20Fee/.test(renderAs("student/pay-qr", "/portal/student"))) fails.push("UPI link in the QR step is wrong");
  const r1 = DB.payMyFee(due.id, { amount: "20000", payer: "Ravi", app: "PhonePe", ref: "111122223333" });
  if (r1.fee.balance !== due.balance - 20000 || r1.fee.status !== "Partial") fails.push("Partial payment did not reduce the balance");
  if (r1.payment.fee_label !== "Year 3 · Tuition Fee (Full fee)") fails.push("Payment label should be year-wise: " + r1.payment.fee_label);
  expectErr("Duplicate UTR", () => DB.payMyFee(due.id, { amount: 1, payer: "R", ref: "111122223333" }), "ref");
  const r2 = DB.payMyFee(due.id, { amount: String(r1.fee.balance), payer: "Ravi", ref: "111122224444" });
  if (r2.fee.balance !== 0 || r2.fee.status !== "Paid") fails.push("Full payment did not clear the fee");
  expectErr("Paid fee cannot be paid again", () => DB.checkPayAmount(due.id, "1"));
  P.setUI({ pm: { fee: due.id, step: "done", receipt: r2 } }); const rc = renderAs("student/pay-done", "/portal/student");
  if (!/Payment Done/.test(rc) || !/Year 3 · Tuition Fee \(Full fee\)/.test(rc) || !/B\.Tech CSE · Regular/.test(rc)) fails.push("Receipt step missing year-wise fee or course");
  P.setUI({ pm: null }); const sh = renderAs("student/after-pay", "/portal/student");
  if (!new RegExp(`data-fee="${due.id}"[\\s\\S]*?x-paid`).test(sh) || new RegExp(`data-act="pmOpen" data-id="${due.id}"`).test(sh)) fails.push("Paid fee should show Paid without a Pay Fee button");
  if (DB.myPayments().length !== 2) fails.push("Student payment history should have 2 payments");
  DB.login("admin", "admin@srividya.demo", "Demo@1234");
  if (DB.getPayments().filter((p) => p.ref.startsWith("11112222")).length !== 2) fails.push("Admin does not see the student's payments");
}
// Faculty: admin-managed staff records (education, position, salary). There is NO faculty login.
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const facRec = DB.addFaculty({ name: "Test Faculty", email: "faculty.test@srividya.demo", phone: "9876543210", dept: "CSE", designation: "Professor", qualification: "Ph.D", subjects: "DBMS", salary: "85000", doj: "2024-06-01" });
if (!facRec || facRec.salary !== 85000 || facRec.qualification !== "Ph.D" || facRec.designation !== "Professor") fails.push("Faculty record fields (education/position/salary) not saved");
if (DB.getFaculty().length !== 1) fails.push("Admin faculty list broken");
expectErr("Faculty record must not create a login", () => DB.login("faculty", "faculty.test@srividya.demo", "Welcome@123"));
expectErr("Student cannot manage faculty records", () => { DB.login("student", "ravi@srividya.demo", "Demo@1234"); DB.getFaculty(); });
DB.login("admin", "admin@srividya.demo", "Demo@1234");
DB.removeFaculty(facRec.id);
if (DB.getFaculty().length !== 0) fails.push("Faculty record removal broken");
// Green Valley is year-wise too
DB.login("admin", "admin@greenvalley.demo", "Demo@1234");
const gvf = DB.getFees();
if (!gvf.length || gvf.some((f) => !(f.year >= 1 && f.year <= 4) || !["Tuition", "Affiliation"].includes(f.type) || "term" in f)) fails.push("Green Valley fees are not year-wise");
if (!DB.getStudents().some((x) => x.admType === "Lateral Entry") || !DB.getStudents().some((x) => x.admType === "Regular")) fails.push("Green Valley should have regular and lateral students");
for (const st of DB.getStudents().filter((x) => x.admType === "Lateral Entry" && x.status === "approved")) if (DB.getFees(st.id).some((f) => f.year === 1)) fails.push(`${st.name}: lateral student has Year 1 fees`);
// Excel import: export -> replace gives identical data; errors are caught; merge adds and updates
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const toRows = (ex) => ex.sheets.map((sh) => ({ name: sh.name, rows: [sh.cols.map((c) => c.header), ...sh.rows] }));
const ex0 = DB.exportSheets(), stuCols = ex0.sheets.find((x) => x.name === "Students").cols.map((c) => c.header), feeCols = ex0.sheets.find((x) => x.name === "Fees").cols.map((c) => c.header);
for (const h of ["Admission Type", "Admission Year", "Current Year", "Branch", "Father's Name", "Mother's Name", "Date of Birth", "Gender", "Blood Group", "Address", "Aadhaar No", "APAAR / ABC ID", "Religion", "Category", "Caste", "Caste Certificate No", "Annual Family Income (₹)", "Income Certificate No", "Income Certificate Valid Till", "Scholarship Eligible", "Scholarship Scheme", "Scholarship Status", "Previous Qualification", "Previous Marks (%)"]) if (!stuCols.includes(h)) fails.push("Students export: missing column " + h);
if (feeCols.slice(0, 6).join("|") !== "Fee ID|Roll No|Student Name|Year|Fee Type|Fee Line" || feeCols.some((h) => /sem|term/i.test(h))) fails.push("Fees export columns: " + feeCols.join("|"));
const before = DB.snapshot(), file = toRows(ex0);
const pre = DB.analyzeImport(file, "replace");
if (pre.totals.some((t) => t.skipped)) fails.push("Round trip: export has rows the import rejects: " + JSON.stringify(pre.sheets.flatMap((x) => x.problems).slice(0, 3)));
DB.applyImport(file, "replace");
if (DB.snapshot() !== before) fails.push("Round trip: export + replace import changed the data");
const stuSheet = file.find((x) => x.name === "Students"), H = stuSheet.rows[0], ix = (h) => H.indexOf(h);
const row = (over) => { const r = H.map(() => ""); Object.entries(over).forEach(([h, v]) => (r[ix(h)] = v)); return r; };
const okRow = { "Roll No": "26SV1A0599", Name: "New One", Branch: "CSE", "Admission Type": "Regular", "Current Year": "Year 1", Section: "Sec A", Email: "new1@x.in", Mobile: "9876500001", Status: "Approved", "Aadhaar No": "9876 5432 1098", Category: "BC-B", "Annual Family Income (₹)": "2,10,000" };
const bad = [{ name: "Students", rows: [H, row(okRow), row({ ...okRow, Name: "Dup Roll", Email: "new2@x.in" }), row({ ...okRow, "Roll No": "SV9002", Email: "nope" }), row({ ...okRow, "Roll No": "", Email: "n3@x.in" }),
    row({ ...okRow, "Roll No": "SV9003", Email: "n4@x.in", "Aadhaar No": "12345" }), row({ ...okRow, "Roll No": "SV9004", Email: "n5@x.in", "Aadhaar No": "", Category: "General" }), row({ ...okRow, "Roll No": "SV9005", Email: "n6@x.in", "Aadhaar No": "", "Annual Family Income (₹)": "two lakh" }),
    row({ ...okRow, "Roll No": "SV9006", Email: "n7@x.in", "Aadhaar No": "", "Admission Type": "Lateral Entry", "Current Year": "Year 1" }), row({ ...okRow, "Roll No": "26SV5A0599", Email: "lat@x.in", "Aadhaar No": "", "Admission Type": "Lateral Entry", "Current Year": "Year 2" }),
    stuSheet.rows[1].map((v, i) => (i === ix("Name") ? "Renamed" : v))] },
  { name: "Fees", rows: [["Roll No", "Year", "Fee Type", "Amount (₹)", "Due Date"], ["26SV1A0599", "Year 1", "Tuition", "abc", "2026-11-01"], ["26SV1A0599", "Year 1", "Tuition", 5000, "31-02-2026"], ["26SV1A0599", "Year 1", "Tuition", 85000, "15-11-2026"], ["ZZ1", "Year 1", "Tuition", 5000, "01-11-2026"], ["26SV1A0599", "Sem 3", "Tuition", 5000, "01-11-2026"], ["26SV1A0599", "Year 1", "Bus fee", 5000, "01-11-2026"], ["26SV5A0599", "Year 1", "Affiliation", 6000, "01-11-2026"], ["26SV5A0599", "2", "Affiliation fee", 6000, "15-12-2026"]] },
  { name: "Marks", rows: [["Roll No", "Exam"], ["26SV1A0599", "Unit Test 1"]] }, { name: "Teachers", rows: [["Name"], ["A"]] }];
const an = DB.analyzeImport(bad, "merge"), st = an.sheets.find((x) => x.sheet === "Students"), fe = an.sheets.find((x) => x.sheet === "Fees"), mk = an.sheets.find((x) => x.sheet === "Marks"), te = an.sheets.find((x) => x.sheet === "Teachers");
const probs = (x) => x.problems.map((p) => p.msg).join(" | ");
if (!(st.valid === 3 && st.skipped === 7 && st.added === 2 && st.updated === 1)) fails.push("Import students validation: " + JSON.stringify({ v: st.valid, s: st.skipped, a: st.added, u: st.updated, p: probs(st) }));
for (const m of ["Aadhaar number must be exactly 12 digits", "Category must be one of OC, BC-A", "Annual family income must be a number", "A lateral entry student is in Year 2, 3 or 4"]) if (!probs(st).includes(m)) fails.push("Import students: missing problem " + m);
if (!(fe.valid === 2 && fe.skipped === 6)) fails.push("Import fees validation: " + JSON.stringify({ v: fe.valid, s: fe.skipped, p: probs(fe) }));
for (const m of ['Year "Sem 3" must be Year 1, 2, 3 or 4', 'Fee type "Bus fee" must be Tuition or Affiliation', "is a lateral entry student (joins in Year 2), so a Year 1 fee is not allowed"]) if (!probs(fe).includes(m)) fails.push("Import fees: missing problem " + m);
if (!(mk.missing.includes("Subject") && mk.valid === 0)) fails.push("Import marks: missing columns not reported");
if (!te.ignored) fails.push("Unknown sheet should be ignored");
P.setUI({ tab: "data", imp: { file: "bad.xlsx", sheets: bad }, impMode: "replace" }); if (!/Replace deletes data/.test(renderAs("admin/data+preview", "/portal/admin"))) fails.push("Replace warning missing");
P.setUI({ imp: null, impMode: "merge", tab: "overview" });
const res = DB.applyImport(bad, "merge");
if (res.students.added !== 2 || res.students.updated !== 1 || res.fees.added !== 2) fails.push("Merge result: " + JSON.stringify(res));
const imported = DB.getStudents().find((x) => x.roll === "26SV1A0599");
if (!imported || imported.aadhaar !== "987654321098" || imported.category !== "BC-B" || imported.income !== 210000 || imported.cls !== "B.Tech CSE 1st Year") fails.push("Merge did not normalise the new student's profile: " + JSON.stringify(imported && { a: imported.aadhaar, c: imported.category, i: imported.income, cls: imported.cls }));
if (DB.getStudents().find((x) => x.roll === stuSheet.rows[1][0]).name !== "Renamed") fails.push("Merge did not update students");
// A Students sheet without the new columns keeps each student's existing profile
const slim = [{ name: "Students", rows: [["Roll No", "Name", "Section", "Email", "Mobile"], [lkMe.roll, "Lakshmi Prasanna", "Sec A", "lakshmi.p@srividya.demo", "9123456780"]] }];
DB.applyImport(slim, "merge");
const lk2 = DB.getStudents().find((x) => x.roll === lkMe.roll);
if (lk2.aadhaar !== "999988887777" || lk2.admType !== "Lateral Entry" || lk2.father !== "K. Appa Rao Garu") fails.push("Import without profile columns wiped the profile");
DB.applyImport(file, "replace");
if (DB.snapshot() !== before) fails.push("Replace with the earlier export did not restore the data");
DB.resetDemo();
if (DB.getPayments().some((p) => p.ref.startsWith("11112222"))) fails.push("Reset demo data kept payments");
if (!/shaalix-demo-db-v2/.test(code) || /shaalix-demo-db-v1"\s*,\s*SESSION/.test(code)) fails.push("localStorage key should be bumped to v2");
// No semester / term naming left in any portal view
for (const [label, h] of sources.filter(([w]) => /^portal /.test(w) && !/data\+preview/.test(w))) if (/\bSem(ester)?\b|\bTerm\b|term\s?\d/i.test(h)) fails.push(`${label}: still says semester/term`);
// No entrance-rank field anywhere
if (/rank|EAMCET|ECET/i.test(code.slice(code.indexOf("DEMO PORTAL"))) || stuCols.some((h) => /rank/i.test(h)) || "rank" in lkMe) fails.push("Entrance rank (EAMCET/ECET) must not exist");

// ---- New features: college logo, student photo, admission documents, fee receipts,
//      marks supplies, certificates, ID card, notice attachments ----
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const colUp = DB.updateCollege({ logo: PNG1, feeTuition: 90000 });
if (colUp.logo !== PNG1 || colUp.feeTuition !== 90000 || colUp.feeAffil !== 6000) fails.push("updateCollege: logo / fee structure not saved");
P.setUI({ tab: "college" }); const colHtml = renderAs("admin/college", "/portal/admin");
if (!colHtml.includes(PNG1) || !/College information/.test(colHtml) || !/feeTuition/.test(colHtml)) fails.push("College pane: logo or fee form missing");
DB.updateCollege({ feeTuition: 85000 });
const raviA = DB.getStudents().find((x) => x.email === "ravi@srividya.demo");
DB.setStudentPhoto(raviA.id, PNG1);
if (DB.getStudents().find((x) => x.id === raviA.id).photo !== PNG1) fails.push("Admin setStudentPhoto not saved");
expectErr("Student cannot set another student's photo", () => { DB.login("student", "ravi@srividya.demo", "Demo@1234"); DB.setStudentPhoto(raviA.id, PNG1); });
DB.setMyPhoto(PNG1);
if (DB.myProfile().photo !== PNG1) fails.push("Student setMyPhoto not saved");
const doc1 = DB.addDocument({ kind: "Aadhaar Card", name: "aadhaar.png", size: 12345, mime: "image/png", data: PNG1 });
if (doc1.status !== "Pending" || doc1.data !== PNG1) fails.push("addDocument: wrong defaults");
const docBig = DB.addDocument({ kind: "SSC Memo", name: "ssc.pdf", size: 900000, mime: "application/pdf", data: "data:application/pdf;base64," + "A".repeat(600000) });
if (docBig.data !== null || docBig.size !== 900000) fails.push("Oversized document: data should drop, metadata kept");
DB.login("admin", "admin@srividya.demo", "Demo@1234");
DB.verifyDocument(doc1.id, "Verified");
if (!DB.getDocuments(raviA.id).some((d) => d.id === doc1.id && d.status === "Verified")) fails.push("verifyDocument not reflected for admin");
P.setUI({ tab: "students", view: raviA.id }); const admProf = renderAs("admin/profile-docs-id", "/portal/admin");
if (!/Admission documents/.test(admProf) || !/Verified/.test(admProf) || !/ID Card/.test(admProf)) fails.push("Admin profile: documents or ID card missing");
P.setUI({ view: null });
DB.login("student", "ravi@srividya.demo", "Demo@1234");
if (!DB.myDocuments().some((d) => d.id === doc1.id && d.status === "Verified")) fails.push("Student does not see the Verified document");
const profHtml2 = renderAs("student/profile-docs", "/portal/student");
if (!/Admission documents/.test(profHtml2) || !/ID Card/.test(profHtml2) || !profHtml2.includes(PNG1)) fails.push("Student profile: documents, ID card or photo missing");
// Receipt anytime: make a payment, then open its receipt from the Payments tab data
const dueF = DB.myFees().find((f) => f.balance > 0);
const payR = DB.payMyFee(dueF.id, { amount: 1000, payer: "Ravi", app: "PhonePe", ref: "999988887777" });
P.setUI({ rcpt: payR.payment.id }); const rcHtml = renderAs("student/receipt-modal", "/portal/student");
if (!/data-receipt/.test(rcHtml) || !rcHtml.includes("Sri Vidya Institute of Technology") || !rcHtml.includes(payR.payment.id.toUpperCase())) fails.push("Receipt modal: college name or receipt number missing");
if (!rcHtml.includes(PNG1)) fails.push("Receipt modal: college logo missing");
P.setUI({ rcpt: null });
DB.login("admin", "admin@srividya.demo", "Demo@1234");
P.setUI({ tab: "payments", rcpt: payR.payment.id }); const admRc = renderAs("admin/receipt-modal", "/portal/admin");
if (!/data-receipt/.test(admRc) || !admRc.includes(payR.payment.id.toUpperCase())) fails.push("Admin receipt modal broken");
P.setUI({ rcpt: null, tab: "overview" });
// Supplies: the weakest seeded student (Venkatesh, ability 0.58) has a passing supplementary Mid-1 mark over a failed regular one
DB.login("student", "venkatesh@srividya.demo", "Demo@1234");
const venkMs = DB.myMarks(), sup = venkMs.find((m) => m.attempt === "Supplementary");
if (!sup || sup.exam !== "Mid-1" || !(sup.pct >= 50)) fails.push("Seed: weakest student has no passing supplementary Mid-1 mark");
else { const reg = venkMs.find((m) => m.exam === sup.exam && m.subject === sup.subject && (m.attempt || "Regular") === "Regular"); if (!reg || !(reg.pct < 50)) fails.push("Seed: supplementary subject's regular attempt should be below 50%"); }
if (!/Supply/.test(renderAs("student/supply-marks", "/portal/student"))) fails.push("Student marks: Supply chip not rendered");
// Certificates: student requests -> admin issues (serial assigned) -> both sides list it
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const reqC = DB.requestCertificate({ type: "Bonafide Certificate", note: "Bank account" });
if (reqC.status !== "Requested" || reqC.serial !== "") fails.push("requestCertificate: wrong defaults");
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const issuedC = DB.issueCertRequest(reqC.id);
if (issuedC.status !== "Issued" || !/^SHX-1001\/CERT\/\d{4}\/\d{3}$/.test(issuedC.serial)) fails.push("issueCertRequest: serial wrong: " + issuedC.serial);
const directC = DB.issueCertificate({ student_id: raviA.id, type: "Course Completion Certificate" });
if (!directC.serial || directC.status !== "Issued") fails.push("issueCertificate: not issued with a serial");
P.setUI({ tab: "certs" }); const certHtml = renderAs("admin/certs", "/portal/admin");
if (!certHtml.includes("Course Completion Certificate") || !certHtml.includes(issuedC.serial)) fails.push("Admin certificates pane: issued rows missing");
P.setUI({ tab: "overview" });
DB.login("student", "ravi@srividya.demo", "Demo@1234");
const myCertHtml = renderAs("student/certs", "/portal/student");
if (!myCertHtml.includes("Bonafide Certificate") || !myCertHtml.includes(issuedC.serial)) fails.push("Student certificates: issued certificate not shown");
// Notice with an attachment (metadata only; data dropped when too large is covered above)
DB.login("admin", "admin@srividya.demo", "Demo@1234");
const nAtt = DB.postNotice({ title: "Exam timetable attached", text: "See the attached timetable.", attachment: { name: "timetable.pdf", size: 45678, mime: "application/pdf", data: null } });
if (!nAtt.attachment || nAtt.attachment.name !== "timetable.pdf") fails.push("postNotice dropped the attachment");
P.setUI({ tab: "notices" }); const nHtml = renderAs("admin/notices-att", "/portal/admin");
if (!nHtml.includes("timetable.pdf")) fails.push("Admin notices: attachment name not rendered");
DB.removeNotice(nAtt.id);
P.setUI({ tab: "overview" });
console.log("portal: logo, photo, documents, receipts, supplies, certificates, ID card and notice attachments checked");
console.log("portal: admin tabs, forms, student views, year-wise B.Tech fees, profiles, isolation, fee payment and Excel import checked");
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
