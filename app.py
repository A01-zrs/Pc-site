import sqlite3, secrets, json
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__); CORS(app)
DB = "shop.db"

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB); g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close(_):
    d = g.pop("db", None)
    if d: d.close()

def now(): return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
def log(kind, uid, name, detail=""):
    db().execute("INSERT INTO logs(kind,user_id,username,detail,at) VALUES(?,?,?,?,?)", (kind, uid, name, detail, now()))
    db().commit()

def init():
    c = sqlite3.connect(DB)
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, is_admin INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY, user_id INTEGER);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price INTEGER, stock INTEGER DEFAULT 10);
    CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY, kind TEXT, user_id INTEGER, username TEXT, detail TEXT, at TEXT);
    """)
    if not c.execute("SELECT 1 FROM users WHERE username='admin'").fetchone():
        c.execute("INSERT INTO users(username,password,is_admin) VALUES('admin',?,1)", (generate_password_hash("admin"),))
    if not c.execute("SELECT 1 FROM products").fetchone():
        seed = [("Ryzen 7 7800X3D","cpu",14500000),("Core i7-14700K","cpu",13200000),
                ("RTX 4070 Super","gpu",32000000),("RX 7800 XT","gpu",24000000),
                ("DDR5 32GB 6000","ram",5200000),("Samsung 990 Pro 1TB","ssd",5600000),
                ("MSI B650 Tomahawk","mobo",9800000),("Corsair RM850x","psu",6100000),
                ("Noctua NH-D15","cooler",4200000)]
        c.executemany("INSERT INTO products(name,category,price) VALUES(?,?,?)", seed)
    c.commit(); c.close()

def auth(admin=False):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            t = request.headers.get("Authorization", "").replace("Bearer ", "")
            u = db().execute("SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?", (t,)).fetchone()
            if not u: return jsonify(error="unauthorized"), 401
            if admin and not u["is_admin"]: return jsonify(error="forbidden"), 403
            g.user = u
            return f(*a, **k)
        return w
    return deco

def user_json(u): return {"id": u["id"], "username": u["username"], "is_admin": bool(u["is_admin"])}

@app.post("/api/register")
def register():
    d = request.json or {}; n, p = d.get("username", "").strip(), d.get("password", "")
    if len(n) < 3 or len(p) < 4: return jsonify(error="نام کاربری حداقل ۳ و رمز حداقل ۴ کاراکتر"), 400
    try:
        db().execute("INSERT INTO users(username,password) VALUES(?,?)", (n, generate_password_hash(p))); db().commit()
    except sqlite3.IntegrityError:
        return jsonify(error="این نام کاربری قبلا ثبت شده"), 409
    return login()

@app.post("/api/login")
def login():
    d = request.json or {}
    u = db().execute("SELECT * FROM users WHERE username=?", (d.get("username", ""),)).fetchone()
    if not u or not check_password_hash(u["password"], d.get("password", "")):
        return jsonify(error="نام کاربری یا رمز اشتباه است"), 401
    t = secrets.token_hex(24)
    db().execute("INSERT INTO tokens VALUES(?,?)", (t, u["id"])); db().commit()
    log("login", u["id"], u["username"])
    return jsonify(token=t, user=user_json(u))

@app.get("/api/me")
@auth()
def me(): return jsonify(user_json(g.user))

@app.get("/api/products")
def products():
    return jsonify([dict(r) for r in db().execute("SELECT * FROM products ORDER BY id DESC")])

@app.post("/api/products")
@auth(admin=True)
def add_product():
    d = request.json or {}
    db().execute("INSERT INTO products(name,category,price,stock) VALUES(?,?,?,?)",
                 (d["name"], d["category"], int(d["price"]), int(d.get("stock", 10)))); db().commit()
    log("add_product", g.user["id"], g.user["username"], d["name"])
    return jsonify(ok=True)

@app.post("/api/checkout")
@auth()
def checkout():
    items = (request.json or {}).get("items", [])
    names, total = [], 0
    for it in items:
        p = db().execute("SELECT * FROM products WHERE id=?", (it["id"],)).fetchone()
        if not p or p["stock"] < 1: return jsonify(error=f"موجودی کافی نیست"), 400
        names.append(p["name"]); total += p["price"]
        db().execute("UPDATE products SET stock=stock-1 WHERE id=?", (p["id"],))
    db().commit()
    log("purchase", g.user["id"], g.user["username"], json.dumps({"items": names, "total": total}, ensure_ascii=False))
    return jsonify(ok=True, total=total)

@app.get("/api/users")
@auth(admin=True)
def users(): return jsonify([user_json(u) for u in db().execute("SELECT * FROM users")])

@app.delete("/api/users/<int:i>")
@auth(admin=True)
def del_user(i):
    if i == g.user["id"]: return jsonify(error="نمی‌توانید خودتان را حذف کنید"), 400
    db().execute("DELETE FROM users WHERE id=?", (i,)); db().execute("DELETE FROM tokens WHERE user_id=?", (i,)); db().commit()
    log("delete_user", g.user["id"], g.user["username"], str(i))
    return jsonify(ok=True)

@app.post("/api/users/<int:i>/toggle-admin")
@auth(admin=True)
def toggle(i):
    if i == g.user["id"]: return jsonify(error="نمی‌توانید نقش خودتان را تغییر دهید"), 400
    db().execute("UPDATE users SET is_admin=1-is_admin WHERE id=?", (i,)); db().commit()
    log("toggle_admin", g.user["id"], g.user["username"], str(i))
    return jsonify(ok=True)

@app.get("/api/logs")
@auth(admin=True)
def logs(): return jsonify([dict(r) for r in db().execute("SELECT * FROM logs ORDER BY id DESC LIMIT 300")])

if __name__ == "__main__":
    init(); app.run(port=5000, debug=True)
