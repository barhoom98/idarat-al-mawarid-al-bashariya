"""
جسر البصمة — شركة الألفية للخدمات الضريبية والمحاسبية

يعمل على كمبيوتر داخل شبكة المكتب: يتصل بجهاز البصمة (ZKTeco والأجهزة المتوافقة معه، المنفذ 4370)،
ويرسل كل بصمة جديدة إلى نظام الموارد البشرية خلال ثوانٍ، ويرسل نبضة كل 5 دقائق ليظهر الجهاز "متصل".
يبقى متصلاً بالجهاز طوال اليوم (الجهاز يصدر صوتاً عند كل اتصال جديد)، ويعيد المزامنة الكاملة مرة واحدة ليلاً الساعة 3.

  python millennium_bridge.py          تشغيل دائم (يُستخدم عند بدء ويندوز)
  python millennium_bridge.py --test   اختبار الاتصال بالجهاز وبالنظام ثم الخروج

الإعدادات في config.ini بجانب هذا الملف (انسخه من config.example.ini).

أمان: البرنامج يقرأ فقط. لا يحذف ولا يعدّل أي شيء على الجهاز — لا موظفين ولا بصمات ولا سجلات ولا إعدادات ولا الساعة —
ولا يلمس برنامج ZKTeco أو قاعدة بياناته. يعمل نسخة واحدة فقط على الكمبيوتر.
"""
import configparser
import json
import logging
import logging.handlers
import os
import socket
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


LOCK_PORT = 47370  # a local port held while the bridge runs, so a second copy never opens a second connection to the device
_lock = None


def single_instance():
    global _lock
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        s.bind(("127.0.0.1", LOCK_PORT))
    except OSError:
        s.close()
        return False
    _lock = s
    return True


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


VERSION = "2026.10.29"


class Server:
    def __init__(self, cfg):
        self.url, self.key, self.device = cfg["url"], cfg["key"], cfg["name"]

    def send(self, punches, status=None):
        payload = {"device": self.device, "punches": punches}
        if status:
            payload["status"] = status
        body = json.dumps(payload).encode("utf-8")
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


NIGHT_HOUR = 3  # the one routine reconnect + full re-sync per day, when nobody is in the office
RETRY = [30, 60, 120, 300, 600]  # seconds to wait after the 1st, 2nd, … failed device connection in a row


def connect(cfg):
    from zk import ZK  # pyzk
    zk = ZK(cfg["ip"], port=cfg["port"], timeout=10, password=cfg["password"], force_udp=False, ommit_ping=True)
    conn = zk.connect()
    keepalive(conn)
    quiet(conn)
    return conn


def keepalive(conn):
    """TCP keep-alive on the device socket: a device that is switched off or unplugged is noticed within ~3 minutes
    (then we reconnect and re-sync) without sending the device any command — so it never beeps for it."""
    try:
        s = conn._ZK__sock
        s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        if hasattr(socket, "SIO_KEEPALIVE_VALS"):  # Windows: start after 60 s idle, probe every 10 s
            s.ioctl(socket.SIO_KEEPALIVE_VALS, (1, 60000, 10000))
    except Exception:
        pass


def quiet(conn):
    """pyzk's live_capture first resets the fingerprint reader (CMD_CANCELCAPTURE then CMD_STARTVERIFY), which makes the
    device beep. The reader is already waiting for fingers, so skip both; live_capture then only subscribes to punches."""
    conn.cancel_capture = lambda: True
    conn.verify_user = lambda: True


class Uplink:
    """Sends punches to the server. If the internet is down, punches wait in state.json and go with the next send,
    so an internet problem never makes us reconnect to the device."""

    def __init__(self, server, state):
        self.server, self.state = server, state
        self.status = {"version": VERSION, "connects_today": 0, "day": "", "last_error": "", "last_error_at": ""}

    def note_error(self, e):
        self.status["last_error"] = str(e)[:300]
        self.status["last_error_at"] = datetime.now().strftime(TS)

    def note_connect(self):
        today = datetime.now().strftime("%Y-%m-%d")
        if self.status["day"] != today:
            self.status["day"], self.status["connects_today"] = today, 0
        self.status["connects_today"] += 1
        self.status["connected_at"] = datetime.now().strftime(TS)

    def push(self, punches=()):
        pend = self.state.setdefault("pending", [])
        if punches:
            pend.extend(punches)
            save_state(self.state)
        try:
            for i in range(0, max(len(pend), 1), 1000):
                self.server.send(pend[i:i + 1000], self.status)
            if pend:
                self.state["pending"] = []
                save_state(self.state)
            return True
        except Exception as e:
            self.note_error(e)
            say("تعذّر الإرسال للنظام (%s) — %d حركة بالانتظار وتُرسل لاحقاً" % (e, len(pend)))
            return False


def full_sync(conn, up, state):
    """Send everything since the last punch we saw (with a 2-day overlap; the server ignores duplicates)."""
    records = conn.get_attendance() or []
    if state.get("last"):
        since = datetime.strptime(state["last"], TS) - timedelta(days=2)
    else:
        since = datetime.now() - timedelta(days=60)
    fresh = [a for a in records if a.timestamp >= since]
    if fresh:
        state["last"] = max(a.timestamp for a in fresh).strftime(TS)
    up.push([as_punch(a) for a in fresh])
    say("مزامنة: %d حركة من أصل %d في الجهاز" % (len(fresh), len(records)))


def run_forever(cfg):
    if not single_instance():
        say("الجسر يعمل مسبقاً على هذا الكمبيوتر — لا حاجة لتشغيله مرة ثانية.")
        return
    state = load_state()
    up = Uplink(Server(cfg), state)
    say("بدء جسر البصمة %s — الجهاز %s:%s" % (VERSION, cfg["ip"], cfg["port"]))
    fails = 0
    while True:
        conn = None
        try:
            conn = connect(cfg)
            up.note_connect()
            full_sync(conn, up, state)
            fails = 0
            started = beat = time.time()
            for a in conn.live_capture(new_timeout=30):
                if a is not None:
                    state["last"] = a.timestamp.strftime(TS)
                    up.push([as_punch(a)])
                    say("بصمة: رقم %s الساعة %s" % (a.user_id, a.timestamp.strftime("%H:%M")))
                    beat = time.time()
                if time.time() - beat > 300:
                    up.push()  # heartbeat (also retries anything waiting)
                    beat = time.time()
                now = datetime.now()
                if now.hour == NIGHT_HOUR and state.get("night") != now.strftime("%Y-%m-%d") and time.time() - started > 3600:
                    state["night"] = now.strftime("%Y-%m-%d")  # once a night: reconnect and re-sync, in case an event was missed
                    save_state(state)
                    conn.end_live_capture = True
            say("انتهى الاتصال بالجهاز — إعادة الاتصال")
        except Exception as e:  # device off, another program holding it, network down: wait, longer each time
            wait = RETRY[min(fails, len(RETRY) - 1)]
            fails += 1
            up.note_error(e)
            say("خطأ بالاتصال بالجهاز: %s — إعادة المحاولة بعد %d ثانية" % (e, wait))
            up.push()  # tell the server what happened (shows why the device dropped)
            time.sleep(wait)
        finally:
            try:
                if conn:
                    conn.disconnect()
            except Exception:
                pass


def test(cfg):
    if not single_instance():
        sys.exit("الجسر شغّال الآن. للاختبار: شغّل stop_bridge.bat أولاً، ثم test_connection.bat، ثم start_bridge.bat.")
    print("1) الاتصال بجهاز البصمة %s:%s ..." % (cfg["ip"], cfg["port"]))
    try:
        conn = connect(cfg)
    except Exception as e:
        sys.exit("   فشل: %s\n   تأكد من رقم IP، وأن الجهاز والكمبيوتر على نفس الشبكة." % e)
    try:
        users = conn.get_users() or []
        records = conn.get_attendance() or []
        print("   تم. الموظفون على الجهاز: %d، الحركات المخزنة: %d" % (len(users), len(records)))
        key = lambda u: (0, int(u.user_id)) if str(u.user_id).isdigit() else (1, str(u.user_id))
        for u in sorted(users, key=key):
            print("     رقم البصمة %s  %s" % (u.user_id, u.name))
        try:
            dev = conn.get_time()
            diff = (dev - datetime.now()).total_seconds()
            print("   ساعة الجهاز: %s   ساعة الكمبيوتر: %s" % (dev.strftime(TS), datetime.now().strftime(TS)))
            if abs(diff) > 120:
                m = round(abs(diff) / 60)
                print("   تنبيه: ساعة الجهاز مختلفة عن الكمبيوتر بفرق %d %s. صحّحها من برنامج ZKTeco (مزامنة الوقت) أو من قائمة الجهاز." % (m, "دقائق" if 3 <= m <= 10 else "دقيقة"))
        except Exception:
            pass
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
