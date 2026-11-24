import { useState, useEffect, useMemo } from "react";

const api = async (path, opts = {}, token) => {
  const r = await fetch("/api" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
    body: opts.body && JSON.stringify(opts.body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "خطا");
  return d;
};
const fmt = (n) => n.toLocaleString("fa-IR") + " تومان";
const CATS = { cpu: "پردازنده", gpu: "کارت گرافیک", ram: "رم", ssd: "حافظه SSD", mobo: "مادربرد", psu: "پاور", cooler: "خنک‌کننده" };
// جای هر قطعه داخل کیس (درصد) + جهت جدا شدن در حالت "اسمبل نمی‌خوام"
const SLOT = {
  mobo: { s: { right: "30%", top: "8%", width: "62%", height: "78%" }, x: 0, y: 0, z: 0 },
  cpu: { s: { right: "52%", top: "16%", width: "14%", height: "12%" }, x: 40, y: -50 },
  cooler: { s: { right: "49%", top: "12%", width: "20%", height: "20%" }, x: 110, y: -80 },
  ram: { s: { right: "34%", top: "14%", width: "8%", height: "30%" }, x: 150, y: -40 },
  gpu: { s: { right: "34%", top: "52%", width: "52%", height: "14%" }, x: -130, y: 30 },
  ssd: { s: { right: "34%", top: "72%", width: "14%", height: "10%" }, x: -60, y: 90 },
  psu: { s: { right: "4%", bottom: "5%", width: "88%", height: "10%" }, x: 0, y: 70 },
};

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem("auth") || "null"));
  const [boot, setBoot] = useState(true);
  useEffect(() => { setTimeout(() => setBoot(false), 900); }, []);
  const save = (a) => { setAuth(a); a ? localStorage.setItem("auth", JSON.stringify(a)) : localStorage.removeItem("auth"); };
  if (boot) return <Skeleton />;
  if (!auth) return <Login onAuth={save} />;
  return <Main auth={auth} logout={() => save(null)} />;
}

function Skeleton() {
  return (
    <div className="login-wrap"><div className="login">
      <div className="sk" style={{ height: 30, width: "60%" }} />
      <div className="sk" style={{ height: 46 }} /><div className="sk" style={{ height: 46 }} />
      <div className="sk" style={{ height: 48, borderRadius: 16 }} />
    </div></div>
  );
}

function Login({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { onAuth(await api(mode === "login" ? "/login" : "/register", { method: "POST", body: f })); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (busy) return <Skeleton />;
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={go}>
        <h1>{mode === "login" ? "ورود به پی‌سی‌یار" : "ساخت حساب"}</h1>
        <input placeholder="نام کاربری" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <input type="password" placeholder="رمز عبور" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <div className="err">{err}</div>
        <button className="btn">{mode === "login" ? "ورود" : "ثبت‌نام"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "reg" : "login")}>
          {mode === "login" ? "حساب ندارید؟ ثبت‌نام" : "حساب دارید؟ ورود"}
        </button>
      </form>
    </div>
  );
}

function Main({ auth, logout }) {
  const { token, user } = auth;
  const [page, setPage] = useState("shop");
  return (
    <>
      <header>
        <b>پی‌سی‌یار</b>
        <nav>
          <span style={{ color: "var(--mute)" }}>{user.username}</span>
          {user.is_admin && <button className="btn ghost" onClick={() => setPage(page === "shop" ? "admin" : "shop")}>{page === "shop" ? "پنل ادمین" : "فروشگاه"}</button>}
          <button className="btn ghost" onClick={logout}>خروج</button>
        </nav>
      </header>
      {page === "shop" ? <Shop token={token} /> : <Admin token={token} />}
    </>
  );
}

function Shop({ token }) {
  const [products, setProducts] = useState(null);
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [exploded, setExploded] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/products").then(setProducts); }, []);
  const total = cart.reduce((s, p) => s + p.price, 0);
  // از هر دسته فقط آخرین قطعه داخل کیس نمایش داده می‌شود
  const inCase = useMemo(() => Object.values(Object.fromEntries(cart.map((p) => [p.category, p]))), [cart]);
  const buy = async () => {
    try { await api("/checkout", { method: "POST", body: { items: cart.map((p) => ({ id: p.id })) } }, token);
      setCart([]); setMsg("خرید با موفقیت ثبت شد"); api("/products").then(setProducts);
    } catch (e) { setMsg(e.message); }
  };
  const list = products?.filter((p) => cat === "all" || p.category === cat);
  return (
    <div className="shop">
      <section>
        <div className="tabs">
          {["all", ...Object.keys(CATS)].map((c) => (
            <span key={c} className={"tab" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>{c === "all" ? "همه" : CATS[c]}</span>
          ))}
        </div>
        <div className="grid">
          {!list ? Array.from({ length: 6 }, (_, i) => <div key={i} className="sk" style={{ height: 150 }} />)
            : list.map((p) => (
              <div className="card" key={p.id}>
                <small>{CATS[p.category] || p.category}</small><b>{p.name}</b>
                <span className="price">{fmt(p.price)}</span><small>موجودی: {p.stock}</small>
                <button className="btn" disabled={!p.stock} onClick={() => { setMsg(""); setCart([...cart, p]); }}>افزودن به کیس</button>
              </div>))}
        </div>
      </section>
      <aside className="cart">
        <div className="row"><b>کیس شما</b>
          <label className="toggle" onClick={() => setExploded(!exploded)}>
            <span style={{ fontSize: 13 }}>اسمبل نمی‌خوام</span><span className={"sw" + (exploded ? " on" : "")} />
          </label>
        </div>
        <div className={"case" + (exploded ? " exploded" : "")}>
          {inCase.map((p) => {
            const s = SLOT[p.category] || SLOT.psu;
            return <div key={p.category + p.id} className={"part " + p.category} style={{ ...s.s, transform: exploded ? `translate(${s.x * 2}px,${s.y * 1.5}px) rotate(${s.x / 12}deg)` : "none" }}>{p.name}</div>;
          })}
        </div>
        {cart.map((p, i) => (
          <div className="row" key={i} style={{ fontSize: 13, marginBottom: 4 }}>
            <span>{p.name}</span>
            <button className="link" onClick={() => setCart(cart.filter((_, j) => j !== i))}>حذف</button>
          </div>))}
        <div className="row" style={{ margin: "14px 0" }}><span>جمع کل</span><b className="price">{fmt(total)}</b></div>
        <button className="btn" style={{ width: "100%" }} disabled={!cart.length} onClick={buy}>پرداخت و خرید</button>
        <div className="err" style={{ color: "var(--moss2)", marginTop: 8 }}>{msg}</div>
      </aside>
    </div>
  );
}

function Admin({ token }) {
  const [tab, setTab] = useState("add");
  const [users, setUsers] = useState(null); const [logs, setLogs] = useState(null);
  const [p, setP] = useState({ name: "", category: "cpu", price: "", stock: 10 });
  const [note, setNote] = useState("");
  const load = () => { api("/users", {}, token).then(setUsers); api("/logs", {}, token).then(setLogs); };
  useEffect(load, []);
  const act = async (path, method) => { try { await api(path, { method }, token); load(); } catch (e) { setNote(e.message); } };
  const add = async () => { await api("/products", { method: "POST", body: p }, token); setNote("کالا اضافه شد"); setP({ ...p, name: "", price: "" }); load(); };
  const label = { login: "ورود", purchase: "خرید", add_product: "افزودن کالا", delete_user: "حذف کاربر", toggle_admin: "تغییر نقش" };
  const show = (l) => { if (l.kind !== "purchase") return l.detail; try { const d = JSON.parse(l.detail); return d.items.join("، ") + " — " + fmt(d.total); } catch { return l.detail; } };
  return (
    <div className="admin">
      <div className="tabs">
        {[["add", "افزودن کالا"], ["users", "کاربران"], ["logs", "لاگ‌ها"]].map(([k, v]) => <span key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{v}</span>)}
        <span style={{ color: "var(--moss2)" }}>{note}</span>
      </div>
      {tab === "add" && <div className="box"><div className="form">
        <input placeholder="نام کالا" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="number" placeholder="قیمت (تومان)" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} />
        <input type="number" placeholder="موجودی" value={p.stock} onChange={(e) => setP({ ...p, stock: e.target.value })} />
        <button className="btn" onClick={add}>ثبت کالا</button></div></div>}
      {tab === "users" && <div className="box"><table><thead><tr><th>کاربر</th><th>نقش</th><th></th></tr></thead><tbody>
        {users?.map((u) => <tr key={u.id}><td>{u.username}</td><td>{u.is_admin ? "ادمین" : "کاربر"}</td><td style={{ display: "flex", gap: 6 }}>
          <button className="btn ghost" onClick={() => act(`/users/${u.id}/toggle-admin`, "POST")}>{u.is_admin ? "برداشتن ادمین" : "ادمین کن"}</button>
          <button className="btn danger" onClick={() => confirm("حذف شود؟") && act(`/users/${u.id}`, "DELETE")}>حذف</button></td></tr>)}</tbody></table></div>}
      {tab === "logs" && <div className="box"><table><thead><tr><th>زمان</th><th>کاربر</th><th>رویداد</th><th>جزئیات</th></tr></thead><tbody>
        {logs?.map((l) => <tr key={l.id}><td>{l.at}</td><td>{l.username}</td><td>{label[l.kind] || l.kind}</td><td>{show(l)}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
