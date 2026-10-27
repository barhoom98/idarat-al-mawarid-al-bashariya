"""
جسر البصمة — شركة الألفية للخدمات الضريبية والمحاسبية

يعمل على كمبيوتر داخل شبكة المكتب: يتصل بجهاز البصمة (ZKTeco والأجهزة المتوافقة معه، المنفذ 4370)،
ويرسل كل بصمة جديدة إلى نظام الموارد البشرية خلال ثوانٍ، ويرسل نبضة كل 5 دقائق ليظهر الجهاز "متصل".

  python millennium_bridge.py          تشغيل دائم (يُستخدم عند بدء ويندوز)
  python millennium_bridge.py --test   اختبار الاتصال بالجهاز وبالنظام ثم الخروج

الإعدادات في config.ini بجانب هذا الملف (انسخه من config.example.ini).
"""
import configparser
import json
import logging
import logging.handlers
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "config.ini")
STATE = os.path.join(HERE, "state.json")
TS = "%Y-%m-%d %H:%M:%S"

log = logging.getLogger("bridge")
log.setLevel(logging.INFO)
_h = logging.handlers.RotatingFileHandler(os.path.join(HERE, "bridge.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
_h.setFormatter(logging.Formatter("%(asctime)s  %(message)s"))
log.addHandler(_h)


def say(msg):
    log.info(msg)
    try:
        print(msg, flush=True)
    except Exception:
        pass


def load_config():
    if not os.path.exists(CONFIG):
        sys.exit("config.ini غير موجود. انسخ config.example.ini باسم config.ini واملأ القيم.")
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG, encoding="utf-8-sig")
    try:
        return {
            "ip": cfg.get("device", "ip").strip(),
            "port": cfg.getint("device", "port", fallback=4370),
            "password": cfg.getint("device", "password", fallback=0),
            "name": cfg.get("device", "name", fallback="office").strip(),
            "url": cfg.get("server", "url").strip(),
            "key": cfg.get("server", "key").strip(),
        }
    except (configparser.Error, ValueError) as e:
        sys.exit("خطأ في config.ini: %s" % e)


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"last": None}


def save_state(state):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, STATE)


class Server:
    def __init__(self, cfg):
        self.url, self.key, self.device = cfg["url"], cfg["key"], cfg["name"]

    def send(self, punches):
        body = json.dumps({"device": self.device, "punches": punches}).encode("utf-8")
        req = urllib.request.Request(self.url, data=body, method="POST",
                                     headers={"content-type": "application/json", "x-bridge-key": self.key})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("مفتاح الربط غير صحيح. انسخه من الإعدادات في التطبيق إلى config.ini.")
            raise RuntimeError("الخادم رفض الطلب (%s): %s" % (e.code, e.read()[:200]))


def as_punch(a):
    return {"fp_id": str(a.user_id).strip(), "ts": a.timestamp.strftime(TS)}


def connect(cfg):
    from zk import ZK  # pyzk
    zk = ZK(cfg["ip"], port=cfg["port"], timeout=10, password=cfg["password"], force_udp=False, ommit_ping=True)
    return zk.connect()


def full_sync(conn, server, state):
    """Send everything since the last confirmed punch (with a 2-day overlap; the server ignores duplicates)."""
    records = conn.get_attendance() or []
    if state.get("last"):
        since = datetime.strptime(state["last"], TS) - timedelta(days=2)
    else:
        since = datetime.now() - timedelta(days=60)
    fresh = [a for a in records if a.timestamp >= since]
    for i in range(0, len(fresh), 1000):
        server.send([as_punch(a) for a in fresh[i:i + 1000]])
    if fresh:
        state["last"] = max(a.timestamp for a in fresh).strftime(TS)
        save_state(state)
    server.send([])  # heartbeat
    say("مزامنة: أُرسلت %d حركة من أصل %d في الجهاز" % (len(fresh), len(records)))


def run_forever(cfg):
    server = Server(cfg)
    state = load_state()
    say("بدء جسر البصمة — الجهاز %s:%s" % (cfg["ip"], cfg["port"]))
    while True:
        conn = None
        try:
            conn = connect(cfg)
            full_sync(conn, server, state)
            started = beat = time.time()
            for a in conn.live_capture(new_timeout=30):
                if a is not None:
                    server.send([as_punch(a)])
                    state["last"] = a.timestamp.strftime(TS)
                    save_state(state)
                    say("بصمة: رقم %s الساعة %s" % (a.user_id, a.timestamp.strftime("%H:%M")))
                    beat = time.time()
                if time.time() - beat > 300:
                    server.send([])
                    beat = time.time()
                if time.time() - started > 1800:  # reconnect every 30 minutes and re-sync, in case an event was missed
                    conn.end_live_capture = True
        except Exception as e:  # device off, network down, internet down: wait and try again
            say("خطأ: %s — إعادة المحاولة بعد 30 ثانية" % e)
            time.sleep(30)
        finally:
            try:
                if conn:
                    conn.disconnect()
            except Exception:
                pass


def test(cfg):
    print("1) الاتصال بجهاز البصمة %s:%s ..." % (cfg["ip"], cfg["port"]))
    try:
        conn = connect(cfg)
    except Exception as e:
        sys.exit("   فشل: %s\n   تأكد من رقم IP، وأن الجهاز والكمبيوتر على نفس الشبكة." % e)
    try:
        users = conn.get_users() or []
        records = conn.get_attendance() or []
        print("   تم. الموظفون على الجهاز: %d، الحركات المخزنة: %d" % (len(users), len(records)))
        for u in users[:20]:
            print("     رقم البصمة %s  %s" % (u.user_id, u.name))
        for a in sorted(records, key=lambda x: x.timestamp)[-5:]:
            print("     آخر حركة: رقم %s  %s" % (a.user_id, a.timestamp.strftime(TS)))
    finally:
        conn.disconnect()
    print("2) الاتصال بنظام الموارد البشرية ...")
    try:
        print("   تم:", Server(cfg).send([]))
    except Exception as e:
        sys.exit("   فشل: %s" % e)
    print("\nكل شيء جاهز. سيظهر الجهاز «متصل» في التطبيق.")


if __name__ == "__main__":
    config = load_config()
    if "--test" in sys.argv:
        test(config)
    else:
        run_forever(config)
