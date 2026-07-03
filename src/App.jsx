import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import {
  MapPin, Search, ChevronLeft, Star, Clock, Navigation, Bell, User,
  Heart, CreditCard, CheckCircle2, Calendar, Car, Bike, Truck,
  Lock, LogOut, Plus, Minus, Activity, Gauge, ShieldCheck, X,
  ChevronRight, Filter, Settings, History, Wallet, Mail, Eye, EyeOff,
  ArrowRight, AlertTriangle, Circle, TrendingUp, LayoutGrid, List,
  Timer, KeyRound, Hash, ParkingCircle, LogIn, UserCircle2
} from "lucide-react";

/* ============================================================================
   OPACLY — Shared real-time store
   Single source of truth for slots/bookings, consumed by BOTH the Driver App
   and the Owner Dashboard so actions in one instantly reflect in the other.
============================================================================ */

const NAVY = "#0B3D91";
const NAVY_DEEP = "#082C6B";
const INK = "#0A0E1A";
const SLATE = "#5B6472";

const TOTAL_SLOTS = 24; // 24 visible slots representing the 100-capacity lot (grouped A1-A24)

function makeInitialSlots() {
  const rows = ["A", "B", "C"];
  const slots = [];
  let id = 0;
  rows.forEach((row, ri) => {
    for (let i = 1; i <= 8; i++) {
      id++;
      slots.push({
        code: `${row}${i}`,
        status: "available", // available | locked | occupied
        vehicle: null,
        otp: null,
        customer: null,
        entryTime: null,
        lockExpiry: null,
        vehicleType: null,
      });
    }
  });
  // seed a few occupied / locked for realism
  slots[2].status = "occupied";
  slots[2].vehicle = "HR26AB1234";
  slots[2].customer = "Rohit Verma";
  slots[2].otp = "4821";
  slots[2].entryTime = Date.now() - 47 * 60 * 1000;
  slots[2].vehicleType = "car";

  slots[7].status = "occupied";
  slots[7].vehicle = "DL8CAF5678";
  slots[7].customer = "Aditi Sharma";
  slots[7].otp = "1190";
  slots[7].entryTime = Date.now() - 12 * 60 * 1000;
  slots[7].vehicleType = "car";

  slots[11].status = "locked";
  slots[11].vehicle = "DL3CBX9981";
  slots[11].customer = "Karan Mehta";
  slots[11].otp = "7702";
  slots[11].lockExpiry = Date.now() + 4 * 60 * 1000;
  slots[11].vehicleType = "bike";

  return slots;
}

function genOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const StoreContext = createContext(null);

function useStore() {
  return useContext(StoreContext);
}

function StoreProvider({ children }) {
  const [slots, setSlots] = useState(makeInitialSlots);
  const [feed, setFeed] = useState([
    { id: 1, text: "Vehicle HR26AB1234 entered. Slot A3.", time: Date.now() - 47 * 60 * 1000, kind: "entry" },
    { id: 2, text: "Vehicle DL8CAF5678 entered. Slot A8.", time: Date.now() - 12 * 60 * 1000, kind: "entry" },
    { id: 3, text: "Slot B4 locked for booking.", time: Date.now() - 3 * 60 * 1000, kind: "lock" },
  ]);
  const [myBookings, setMyBookings] = useState([]);
  const feedIdRef = useRef(4);

  const pushFeed = useCallback((text, kind = "info") => {
    feedIdRef.current += 1;
    setFeed((f) => [{ id: feedIdRef.current, text, time: Date.now(), kind }, ...f].slice(0, 40));
  }, []);

  // auto-expire locks every second
  useEffect(() => {
    const t = setInterval(() => {
      setSlots((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          if (s.status === "locked" && s.lockExpiry && Date.now() > s.lockExpiry) {
            changed = true;
            return { ...s, status: "available", vehicle: null, otp: null, customer: null, lockExpiry: null, vehicleType: null };
          }
          return s;
        });
        if (changed) pushFeed("Booking timer expired. Slot released.", "release");
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pushFeed]);

  const counts = useMemo(() => {
    const available = slots.filter((s) => s.status === "available").length;
    const locked = slots.filter((s) => s.status === "locked").length;
    const occupied = slots.filter((s) => s.status === "occupied").length;
    return { total: slots.length, available, locked, occupied };
  }, [slots]);

  const isFull = counts.available === 0;

  // ---- Actions ----

  const lockSlot = useCallback((code, customer, vehicleType) => {
    const otp = genOTP();
    setSlots((prev) =>
      prev.map((s) =>
        s.code === code
          ? { ...s, status: "locked", customer, otp, vehicleType, lockExpiry: Date.now() + 5 * 60 * 1000, vehicle: null }
          : s
      )
    );
    pushFeed(`Slot ${code} booked by ${customer}.`, "lock");
    return otp;
  }, [pushFeed]);

  const cancelLock = useCallback((code) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.code === code
          ? { ...s, status: "available", customer: null, otp: null, lockExpiry: null, vehicleType: null }
          : s
      )
    );
    pushFeed(`Payment cancelled. Slot ${code} released.`, "release");
  }, [pushFeed]);

  const confirmPayment = useCallback((code) => {
    // payment success keeps it locked, awaiting owner OTP verification at entry
    setSlots((prev) =>
      prev.map((s) => (s.code === code ? { ...s, lockExpiry: Date.now() + 20 * 60 * 1000 } : s))
    );
    pushFeed(`Payment confirmed for slot ${code}.`, "payment");
  }, [pushFeed]);

  const verifyEntry = useCallback((vehicleNumber, otpInput) => {
    let result = { ok: false, message: "" };
    setSlots((prev) =>
      prev.map((s) => {
        if (s.status === "locked" && s.otp === otpInput) {
          if (vehicleNumber && s.vehicle && s.vehicle !== vehicleNumber) {
            // allow owner to assign vehicle number at entry if not pre-set
          }
          result = { ok: true, code: s.code };
          return { ...s, status: "occupied", vehicle: vehicleNumber || s.vehicle, entryTime: Date.now(), lockExpiry: null };
        }
        return s;
      })
    );
    if (result.ok) pushFeed(`Vehicle ${vehicleNumber || ""} entered. Slot ${result.code}.`, "entry");
    return result;
  }, [pushFeed]);

  const verifyExit = useCallback((code) => {
    let vehicle = null;
    setSlots((prev) =>
      prev.map((s) => {
        if (s.code === code) {
          vehicle = s.vehicle;
          return { ...s, status: "available", vehicle: null, otp: null, customer: null, entryTime: null, vehicleType: null };
        }
        return s;
      })
    );
    pushFeed(`Vehicle ${vehicle || ""} exited. Slot ${code} released.`, "exit");
  }, [pushFeed]);

  const addBooking = useCallback((booking) => {
    setMyBookings((b) => [booking, ...b]);
  }, []);

  const value = {
    slots, counts, isFull, feed,
    lockSlot, cancelLock, confirmPayment, verifyEntry, verifyExit,
    myBookings, addBooking,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/* ============================================================================
   Small shared utilities
============================================================================ */

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function durationSince(ts) {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - ts) / 60000);
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h > 0 ? `${h}h ${rm}m` : `${rm}m`;
}

function useTick(ms = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
}

/* ============================================================================
   PARKING LOT DATA (driver-facing list)
============================================================================ */

const LOTS = [
  { id: "p1", name: "Cyber Hub Parking Plaza", distance: "0.4 km", price: 40, rating: 4.6, reviews: 312, hours: "24 Hours", lat: 28.494, lng: 77.089, address: "Sector 29, Gurugram" },
  { id: "p2", name: "Ambience Mall Parking", distance: "0.9 km", price: 30, rating: 4.4, reviews: 891, hours: "9:00 AM – 11:00 PM", lat: 28.5, lng: 77.097, address: "NH8, Gurugram" },
  { id: "p3", name: "DLF Phase 3 Open Lot", distance: "1.2 km", price: 20, rating: 4.1, reviews: 154, hours: "24 Hours", lat: 28.49, lng: 77.085, address: "DLF Phase 3, Gurugram" },
  { id: "p4", name: "MG Road Metro Parking", distance: "1.6 km", price: 25, rating: 4.3, reviews: 503, hours: "6:00 AM – 12:00 AM", lat: 28.48, lng: 77.08 },
];

/* ============================================================================
   THE PIN MARK — reused logo motif: pin + road dash, used as live brand signature
============================================================================ */

function PinMark({ size = 28, pulse = false, color = "#FFFFFF" }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path
          d="M24 4C14.6 4 7 11.6 7 21c0 12 17 23 17 23s17-11 17-23C41 11.6 33.4 4 24 4Z"
          fill={color}
        />
        <circle cx="24" cy="20" r="6.4" fill={INK} />
      </svg>
      {pulse && (
        <span
          style={{
            position: "absolute", top: "30%", left: "50%", width: 10, height: 10,
            transform: "translate(-50%,-50%)", borderRadius: "50%",
            background: "#EF4444", boxShadow: "0 0 0 0 rgba(239,68,68,0.7)",
            animation: "opacly-pulse 1.6s infinite",
          }}
        />
      )}
    </div>
  );
}

/* ============================================================================
   PHONE FRAME CHROME
============================================================================ */

function StatusBar({ light = true }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 22px 4px", fontSize: 13, fontWeight: 600,
      color: light ? "#fff" : INK, letterSpacing: 0.2,
    }}>
      <span>9:41</span>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <span style={{ fontSize: 11 }}>5G</span>
        <span>●●●●</span>
      </div>
    </div>
  );
}

function ScreenShell({ children, bg = INK, statusLight = true, noPad }) {
  return (
    <div style={{
      width: "100%", height: "100%", background: bg, color: "#fff",
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <StatusBar light={statusLight} />
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: noPad ? 0 : "0 20px 20px" }}>
        {children}
      </div>
    </div>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 18px" }}>
      <button onClick={onBack} style={iconBtnStyle}>
        <ChevronLeft size={20} color="#fff" />
      </button>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>{title}</div>
      <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>{right}</div>
    </div>
  );
}

const iconBtnStyle = {
  width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
};

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "16px 20px", borderRadius: 16, border: "none",
        background: disabled ? "rgba(255,255,255,0.08)" : "#fff",
        color: disabled ? "rgba(255,255,255,0.35)" : INK,
        fontSize: 15.5, fontWeight: 700, letterSpacing: 0.2, cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "transform 0.12s ease, opacity 0.12s ease",
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "15px 20px", borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.14)", background: "transparent",
        color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ---------- 1. SPLASH ---------- */
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      width: "100%", height: "100%", background: `radial-gradient(120% 90% at 50% 20%, ${NAVY} 0%, ${INK} 65%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18, fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ animation: "opacly-rise 0.9s ease both" }}>
        <PinMark size={64} pulse />
      </div>
      <div style={{ textAlign: "center", animation: "opacly-rise 0.9s 0.15s ease both" }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>Opacly</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 6, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Park with certainty
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 56, width: 36, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", background: "#fff", animation: "opacly-load 2s ease forwards" }} />
      </div>
    </div>
  );
}

/* ---------- 2. LOGIN ---------- */
function LoginScreen({ onLogin, onBack }) {
  const [step, setStep] = useState("phone"); // phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const otpRefs = useRef([]);

  const sendOtp = () => {
    if (phone.length !== 10) return;
    setStep("otp");
  };

  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 3) otpRefs.current[i + 1]?.focus();
  };

  return (
    <ScreenShell>
      <div style={{ paddingTop: 28, paddingBottom: 8 }}>
        <PinMark size={40} />
      </div>

      {step === "phone" ? (
        <>
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>Welcome to Opacly</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              Enter your mobile number to continue.
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <FieldLabel>Mobile number</FieldLabel>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "13px 14px",
            }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>+91</span>
              <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
              <input
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98765 43210"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 15, fontFamily: "inherit", letterSpacing: 1 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 26 }}>
            <PrimaryButton onClick={sendOtp} disabled={phone.length !== 10}>
              Send OTP <ArrowRight size={17} />
            </PrimaryButton>
          </div>

          <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
            By continuing, you agree to Opacly's Terms of Service and Privacy Policy.
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>Verify your number</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              Enter the 4-digit code sent to <span style={{ color: "#fff", fontWeight: 700 }}>+91 {phone}</span>
            </div>
          </div>

          <div style={{ marginTop: 30, display: "flex", gap: 12, justifyContent: "center" }}>
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => (otpRefs.current[i] = el)}
                value={d}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                maxLength={1}
                inputMode="numeric"
                style={{
                  width: 54, height: 60, borderRadius: 14, textAlign: "center", fontSize: 22, fontWeight: 800,
                  background: "rgba(255,255,255,0.06)", border: `1.5px solid ${d ? "#fff" : "rgba(255,255,255,0.12)"}`,
                  color: "#fff", outline: "none", fontFamily: "inherit",
                }}
              />
            ))}
          </div>

          <div style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Didn't get the code? <span onClick={() => setStep("phone")} style={{ color: "#fff", fontWeight: 700, cursor: "pointer" }}>Resend</span>
          </div>

          <div style={{ marginTop: 30 }}>
            <PrimaryButton onClick={onLogin} disabled={otp.some((d) => !d)}>
              Verify &amp; continue <ArrowRight size={17} />
            </PrimaryButton>
          </div>
          <div style={{ marginTop: 12 }}>
            <GhostButton onClick={() => setStep("phone")}>Change number</GhostButton>
          </div>
        </>
      )}
    </ScreenShell>
  );
}

function InputField({ icon, placeholder, type = "text", right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "13px 14px",
    }}>
      <span style={{ color: "rgba(255,255,255,0.45)", display: "flex" }}>{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          flex: 1, background: "transparent", border: "none", outline: "none",
          color: "#fff", fontSize: 14.5, fontFamily: "inherit",
        }}
      />
      {right}
    </div>
  );
}

/* ---------- 3. HOME ---------- */
function HomeScreen({ onSearch, onMap, onOpenLot, favorites, toggleFav, onNotif, onProfile }) {
  const { counts, isFull } = useStore();
  return (
    <ScreenShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 20px" }}>
        <div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>Current location</div>
          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            <MapPin size={14} color="#9DB6E8" /> Sector 29, Gurugram
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNotif} style={iconBtnStyle}><Bell size={17} color="#fff" /></button>
          <button onClick={onProfile} style={iconBtnStyle}><UserCircle2 size={18} color="#fff" /></button>
        </div>
      </div>

      <div
        onClick={onSearch}
        style={{
          display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 16px", cursor: "pointer",
        }}
      >
        <Search size={18} color="rgba(255,255,255,0.5)" />
        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 14.5 }}>Search parking near you</span>
      </div>

      <div
        onClick={onMap}
        style={{
          marginTop: 16, borderRadius: 20, overflow: "hidden", position: "relative",
          height: 150, background: `linear-gradient(135deg, ${NAVY_DEEP}, ${NAVY})`,
          cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <MapDecor />
        <div style={{ position: "absolute", bottom: 14, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Live map view</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)" }}>{counts.available} of {counts.total} slots free nearby</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Navigation size={15} color="#fff" />
          </div>
        </div>
      </div>

      {isFull && (
        <div style={{
          marginTop: 14, padding: "11px 14px", borderRadius: 14, background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 9,
        }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ fontSize: 12.5, color: "#FCA5A5", fontWeight: 600 }}>Cyber Hub Plaza is full — new bookings paused</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 4 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700 }}>Nearby parking</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>See all</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {LOTS.map((lot) => (
          <LotCard key={lot.id} lot={lot} onClick={() => onOpenLot(lot)} fav={favorites.includes(lot.id)} onFav={() => toggleFav(lot.id)} isFull={lot.id === "p1" ? isFull : false} />
        ))}
      </div>
    </ScreenShell>
  );
}

function MapDecor() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 150" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
      <line x1="0" y1="40" x2="400" y2="55" stroke="#fff" strokeOpacity="0.15" strokeWidth="10" />
      <line x1="0" y1="110" x2="400" y2="95" stroke="#fff" strokeOpacity="0.1" strokeWidth="16" />
      <line x1="120" y1="0" x2="160" y2="150" stroke="#fff" strokeOpacity="0.1" strokeWidth="8" />
      {[60, 140, 220, 300].map((x, i) => (
        <circle key={i} cx={x} cy={50 + (i % 2) * 40} r="5" fill="#fff" fillOpacity="0.5" />
      ))}
    </svg>
  );
}

function LotCard({ lot, onClick, fav, onFav, isFull }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", gap: 12, padding: 12, borderRadius: 16,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 12, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DEEP})`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <ParkingCircle size={24} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{lot.name}</div>
          <button onClick={(e) => { e.stopPropagation(); onFav(); }} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 6 }}>
            <Heart size={16} color={fav ? "#EF4444" : "rgba(255,255,255,0.35)"} fill={fav ? "#EF4444" : "none"} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>
          <Star size={11} color="#F5B400" fill="#F5B400" /> {lot.rating} ({lot.reviews}) · {lot.distance}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#9DB6E8" }}>₹{lot.price}/hr</span>
          {isFull ? (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.12)", padding: "3px 8px", borderRadius: 8 }}>FULL</span>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4ADE80", background: "rgba(34,197,94,0.12)", padding: "3px 8px", borderRadius: 8 }}>AVAILABLE</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- 4. SEARCH ---------- */
function SearchScreen({ onBack, onOpenLot }) {
  const [q, setQ] = useState("");
  const filtered = LOTS.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <ScreenShell>
      <TopBar title="Search" onBack={onBack} />
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "13px 16px", marginBottom: 16,
      }}>
        <Search size={17} color="rgba(255,255,255,0.5)" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by area, mall, or landmark"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "inherit" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
        {["Nearest", "Cheapest", "Top rated", "24 Hours"].map((f) => (
          <div key={f} style={{ padding: "8px 14px", borderRadius: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12.5, whiteSpace: "nowrap", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <Filter size={12} /> {f}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, fontWeight: 600, letterSpacing: 0.3 }}>
        {filtered.length} RESULTS NEARBY
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((lot) => (
          <LotCard key={lot.id} lot={lot} onClick={() => onOpenLot(lot)} fav={false} onFav={() => {}} />
        ))}
      </div>
    </ScreenShell>
  );
}

/* ---------- 5. MAP ---------- */
function MapScreen({ onBack, onOpenLot }) {
  const [selected, setSelected] = useState(LOTS[0]);
  const { isFull } = useStore();
  return (
    <ScreenShell noPad>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${NAVY_DEEP}, #061B47 60%, ${INK})` }}>
        <svg width="100%" height="100%" viewBox="0 0 400 800" style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
          <line x1="0" y1="180" x2="400" y2="220" stroke="#fff" strokeOpacity="0.12" strokeWidth="14" />
          <line x1="0" y1="420" x2="400" y2="380" stroke="#fff" strokeOpacity="0.1" strokeWidth="20" />
          <line x1="60" y1="0" x2="120" y2="800" stroke="#fff" strokeOpacity="0.1" strokeWidth="10" />
          <line x1="280" y1="0" x2="220" y2="800" stroke="#fff" strokeOpacity="0.08" strokeWidth="8" />
        </svg>
        {LOTS.map((lot, i) => {
          const left = 60 + i * 75;
          const top = 220 + (i % 2) * 160 + (i === 2 ? 60 : 0);
          const active = selected.id === lot.id;
          const full = lot.id === "p1" && isFull;
          return (
            <div
              key={lot.id}
              onClick={() => setSelected(lot)}
              style={{
                position: "absolute", left, top, transform: active ? "scale(1.15)" : "scale(1)",
                cursor: "pointer", transition: "transform 0.2s ease", zIndex: active ? 5 : 1,
              }}
            >
              <div style={{
                background: full ? "#EF4444" : active ? "#fff" : "rgba(255,255,255,0.9)",
                color: full ? "#fff" : INK, fontSize: 11, fontWeight: 800, padding: "5px 9px",
                borderRadius: 10, boxShadow: "0 6px 14px rgba(0,0,0,0.35)", whiteSpace: "nowrap",
                border: active ? `2px solid ${NAVY}` : "none",
              }}>
                {full ? "FULL" : `₹${lot.price}/hr`}
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
                <PinMark size={22} color={full ? "#EF4444" : "#fff"} />
              </div>
            </div>
          );
        })}
        <div style={{
          position: "absolute", top: "48%", left: "50%", width: 14, height: 14, borderRadius: "50%",
          background: "#4A9DFF", border: "3px solid #fff", transform: "translate(-50%,-50%)",
          boxShadow: "0 0 0 8px rgba(74,157,255,0.25)",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 10 }}>
        <StatusBar light />
        <div style={{ padding: "0 20px" }}>
          <TopBar title="Map view" onBack={onBack} right={<button style={iconBtnStyle}><LayoutGrid size={16} color="#fff" /></button>} />
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "0 16px 16px" }}>
        <div
          onClick={() => onOpenLot(selected)}
          style={{
            background: "rgba(15,20,35,0.92)", backdropFilter: "blur(10px)", borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.12)", padding: 14, cursor: "pointer",
            display: "flex", gap: 12, alignItems: "center",
          }}
        >
          <div style={{ width: 50, height: 50, borderRadius: 12, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DEEP})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ParkingCircle size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{selected.name}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{selected.distance} · ₹{selected.price}/hr · ⭐ {selected.rating}</div>
          </div>
          <ChevronRight size={18} color="rgba(255,255,255,0.5)" />
        </div>
      </div>
    </ScreenShell>
  );
}

/* ---------- 6. PARKING DETAILS ---------- */
function DetailsScreen({ lot, onBack, onBook, onNavigate }) {
  const { counts, isFull } = useStore();
  const availableSlots = lot.id === "p1" ? counts.available : Math.floor(Math.random() * 10) + 3;
  const full = lot.id === "p1" && isFull;
  return (
    <ScreenShell>
      <TopBar title="Parking details" onBack={onBack} right={<button style={iconBtnStyle}><Heart size={16} color="#fff" /></button>} />

      <div style={{
        height: 150, borderRadius: 18, background: `linear-gradient(135deg, ${NAVY_DEEP}, ${NAVY})`,
        position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <MapDecor />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PinMark size={46} pulse={full} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{lot.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>
          <MapPin size={13} /> {lot.address}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 12.5 }}>
          <Star size={13} color="#F5B400" fill="#F5B400" />
          <span style={{ fontWeight: 700 }}>{lot.rating}</span>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>({lot.reviews} reviews)</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
        <InfoTile icon={<Navigation size={16} />} label="Distance" value={lot.distance} />
        <InfoTile icon={<ParkingCircle size={16} />} label="Available slots" value={full ? "0 — Full" : `${availableSlots} open`} alert={full} />
        <InfoTile icon={<Wallet size={16} />} label="Price" value={`₹${lot.price}/hr`} />
        <InfoTile icon={<Clock size={16} />} label="Hours" value={lot.hours} />
      </div>

      {full && (
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 9,
        }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ fontSize: 12.5, color: "#FCA5A5", fontWeight: 600 }}>Parking Full — new bookings are disabled until a slot opens</span>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Reviews</div>
        {[
          { name: "Priya N.", text: "Always finds me a spot in seconds, super smooth.", rating: 5 },
          { name: "Aman K.", text: "Clean lot, OTP entry was quick and easy.", rating: 4 },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {r.name[0]}
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
                {r.name} <span style={{ color: "#F5B400" }}>{"★".repeat(r.rating)}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{r.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 90 }} />

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 20px 20px",
        background: `linear-gradient(180deg, transparent, ${INK} 30%)`, display: "flex", gap: 10,
      }}>
        <GhostButton onClick={() => onNavigate(lot)} style={{ width: "auto", padding: "15px 18px" }}>
          <Navigation size={16} />
        </GhostButton>
        <PrimaryButton onClick={() => onBook(lot)} disabled={full}>
          {full ? "Parking Full" : "Book now"}
        </PrimaryButton>
      </div>
    </ScreenShell>
  );
}

function InfoTile({ icon, label, value, alert }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)", border: `1px solid ${alert ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 14, padding: 12,
    }}>
      <div style={{ color: alert ? "#EF4444" : "#9DB6E8", marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: alert ? "#EF4444" : "#fff" }}>{value}</div>
    </div>
  );
}

/* ---------- 7. BOOKING ---------- */
function BookingScreen({ lot, onBack, onConfirm }) {
  const { slots, isFull } = useStore();
  const [vehicleType, setVehicleType] = useState("car");
  const [duration, setDuration] = useState(2);
  const [name] = useState("Subrat Kumar");
  const available = slots.filter((s) => s.status === "available");
  const [assignedSlot] = useState(() => {
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)].code;
  });
  const total = lot.price * duration;

  if (isFull || !assignedSlot) {
    return (
      <ScreenShell>
        <TopBar title="Booking" onBack={onBack} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "70%", textAlign: "center", gap: 14 }}>
          <PinMark size={48} pulse />
          <div style={{ fontSize: 18, fontWeight: 800 }}>Parking Full</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 240 }}>
            All slots at {lot.name} are occupied right now. New bookings are temporarily disabled.
          </div>
          <GhostButton onClick={onBack} style={{ width: 160, marginTop: 6 }}>Go back</GhostButton>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <TopBar title="Reserve slot" onBack={onBack} />
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{lot.name}</div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Vehicle type</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ k: "car", icon: Car, label: "Car" }, { k: "bike", icon: Bike, label: "Bike" }, { k: "suv", icon: Truck, label: "SUV" }].map((v) => (
            <button
              key={v.k}
              onClick={() => setVehicleType(v.k)}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 14, cursor: "pointer",
                background: vehicleType === v.k ? "#fff" : "rgba(255,255,255,0.06)",
                color: vehicleType === v.k ? INK : "#fff",
                border: `1px solid ${vehicleType === v.k ? "#fff" : "rgba(255,255,255,0.1)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              }}
            >
              <v.icon size={18} />
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Duration</FieldLabel>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "10px 14px" }}>
          <button onClick={() => setDuration((d) => Math.max(1, d - 1))} style={{ ...iconBtnStyle, width: 30, height: 30 }}><Minus size={14} color="#fff" /></button>
          <span style={{ fontWeight: 700, fontSize: 14.5 }}>{duration} {duration === 1 ? "hour" : "hours"}</span>
          <button onClick={() => setDuration((d) => Math.min(12, d + 1))} style={{ ...iconBtnStyle, width: 30, height: 30 }}><Plus size={14} color="#fff" /></button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Your slot</FieldLabel>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px 16px",
        }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ParkingCircle size={20} color="#4ADE80" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Slot {assignedSlot}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>Nearest free slot assigned automatically</div>
          </div>
        </div>
      </div>

      <div style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, marginBottom: 18,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>₹{lot.price} × {duration} hr</span>
          <span style={{ fontWeight: 700 }}>₹{total}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>Convenience fee</span>
          <span style={{ fontWeight: 700 }}>₹10</span>
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, fontWeight: 800 }}>
          <span>Total</span><span>₹{total + 10}</span>
        </div>
      </div>

      <PrimaryButton onClick={() => onConfirm({ lot, slot: assignedSlot, duration, total: total + 10, vehicleType, name })}>
        Continue to payment <ArrowRight size={16} />
      </PrimaryButton>
      <div style={{ height: 10 }} />
    </ScreenShell>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginBottom: 8 }}>{children}</div>;
}
function Legend({ color, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} /> {label}
    </span>
  );
}

/* ---------- 8. PAYMENT ---------- */
function PaymentScreen({ draft, onBack, onPay, onCancel }) {
  const [method, setMethod] = useState("upi");
  const [processing, setProcessing] = useState(false);
  const isCash = method === "cash";

  const pay = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      onPay(isCash);
    }, isCash ? 700 : 1400);
  };

  return (
    <ScreenShell>
      <TopBar title="Payment" onBack={onBack} />
      <div style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, marginBottom: 18,
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>{draft.lot.name}</div>
        <Row label="Slot" value={draft.slot} />
        <Row label="Duration" value={`${draft.duration} hour${draft.duration > 1 ? "s" : ""}`} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 0" }} />
        <Row label="Amount payable" value={`₹${draft.total}`} bold />
      </div>

      <FieldLabel>Choose payment method</FieldLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {[
          { k: "upi", label: "UPI", sub: "Pay via Google Pay, PhonePe, Paytm", icon: CreditCard },
          { k: "card", label: "Credit / Debit card", sub: "Visa, Mastercard, RuPay", icon: CreditCard },
          { k: "wallet", label: "Opacly Wallet", sub: "Balance: ₹450.00", icon: Wallet },
          { k: "cash", label: "Cash on Parking", sub: "Pay at the gate when you arrive", icon: Wallet },
        ].map((m) => (
          <div
            key={m.k}
            onClick={() => setMethod(m.k)}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, cursor: "pointer",
              border: `1.5px solid ${method === m.k ? "#fff" : "rgba(255,255,255,0.1)"}`,
              background: method === m.k ? "rgba(255,255,255,0.07)" : "transparent",
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <m.icon size={17} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>{m.sub}</div>
            </div>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", border: `2px solid ${method === m.k ? "#fff" : "rgba(255,255,255,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {method === m.k && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
        <ShieldCheck size={13} /> {isCash ? "Your slot is held — pay in cash at the gate" : "Your slot is locked for 5 minutes while you pay"}
      </div>

      <PrimaryButton onClick={pay} disabled={processing}>
        {processing ? "Confirming…" : isCash ? "Confirm booking — pay at gate" : `Pay ₹${draft.total}`}
      </PrimaryButton>
      <div style={{ marginTop: 10 }}>
        <GhostButton onClick={onCancel}>Cancel booking</GhostButton>
      </div>
    </ScreenShell>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 14.5 : 13, marginBottom: 6, fontWeight: bold ? 800 : 400 }}>
      <span style={{ color: bold ? "#fff" : "rgba(255,255,255,0.6)" }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

/* ---------- 9. BOOKING SUCCESS ---------- */
function SuccessScreen({ booking, onDone, onViewBookings, onViewMap }) {
  return (
    <ScreenShell>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", paddingTop: 30 }}>
        <div style={{
          width: 84, height: 84, borderRadius: "50%", background: "rgba(34,197,94,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
          animation: "opacly-rise 0.6s ease both",
        }}>
          <CheckCircle2 size={42} color="#4ADE80" />
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 8 }}>Booking confirmed</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 260, marginBottom: 26 }}>
          Your slot is reserved. Show your OTP to the parking attendant on arrival.
        </div>

        <div style={{
          width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18, padding: 18, textAlign: "left",
        }}>
          <Row label="Parking" value={booking.lot.name} />
          <Row label="Slot" value={booking.slot} />
          <Row label="Duration" value={`${booking.duration} hr`} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 0" }} />
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6, letterSpacing: 0.5 }}>YOUR ENTRY OTP</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 8, color: "#fff" }}>{booking.otp}</div>
          </div>
        </div>

        <div style={{ width: "100%", marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <PrimaryButton onClick={onViewMap}><MapPin size={16} /> View on map</PrimaryButton>
          <GhostButton onClick={onViewBookings}>View my bookings</GhostButton>
          <GhostButton onClick={onDone}>Back to home</GhostButton>
        </div>
      </div>
    </ScreenShell>
  );
}

/* ---------- 10. MY BOOKINGS ---------- */
function MyBookingsScreen({ bookings, onBack, onOpenBooking }) {
  return (
    <ScreenShell>
      <TopBar title="My bookings" onBack={onBack} />
      {bookings.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: 80, color: "rgba(255,255,255,0.5)" }}>
          <Calendar size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No bookings yet</div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>Reserve a parking slot to see it here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {bookings.map((b, i) => (
            <div key={i} onClick={() => onOpenBooking(b)} style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: 14, cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{b.lot.name}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4ADE80", background: "rgba(34,197,94,0.12)", padding: "3px 8px", borderRadius: 8 }}>ACTIVE</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Slot {b.slot} · {b.duration} hr · ₹{b.total}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>OTP</span>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3 }}>{b.otp}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

/* ---------- 11. PROFILE ---------- */
function ProfileScreen({ onBack, onLogout, favorites }) {
  const rows = [
    { icon: <History size={17} />, label: "Booking history" },
    { icon: <Heart size={17} />, label: `Favorites (${favorites.length})` },
    { icon: <Wallet size={17} />, label: "Wallet & payments" },
    { icon: <Bell size={17} />, label: "Notifications" },
    { icon: <Settings size={17} />, label: "Settings" },
  ];
  return (
    <ScreenShell>
      <TopBar title="Profile" onBack={onBack} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800 }}>S</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Subrat Kumar</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>+91 98XXX XXXXX</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
            <span style={{ color: "#9DB6E8" }}>{r.icon}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.label}</span>
            <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <GhostButton onClick={onLogout}><LogOut size={16} /> Log out</GhostButton>
      </div>
    </ScreenShell>
  );
}

/* ---------- BOTTOM TAB BAR ---------- */
function TabBar({ active, onChange }) {
  const tabs = [
    { k: "home", icon: MapPin, label: "Home" },
    { k: "bookings", icon: Calendar, label: "Bookings" },
    { k: "profile", icon: UserCircle2, label: "Profile" },
  ];
  return (
    <div style={{
      display: "flex", justifyContent: "space-around", padding: "10px 6px 14px",
      background: "rgba(10,14,26,0.95)", backdropFilter: "blur(10px)",
      borderTop: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 20,
    }}>
      {tabs.map((t) => (
        <button
          key={t.k}
          onClick={() => onChange(t.k)}
          style={{
            background: "none", border: "none", cursor: "pointer", display: "flex",
            flexDirection: "column", alignItems: "center", gap: 4,
            color: active === t.k ? "#fff" : "rgba(255,255,255,0.4)",
          }}
        >
          <t.icon size={19} strokeWidth={active === t.k ? 2.4 : 2} />
          <span style={{ fontSize: 10, fontWeight: 700 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- DRIVER APP CONTAINER ---------- */
function DriverApp() {
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("home");
  const [activeLot, setActiveLot] = useState(LOTS[0]);
  const [draft, setDraft] = useState(null);
  const [lastBooking, setLastBooking] = useState(null);
  const [favorites, setFavorites] = useState(["p2"]);
  const { lockSlot, cancelLock, confirmPayment, addBooking, myBookings, isFull } = useStore();

  const toggleFav = (id) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const goHome = () => { setScreen("main"); setTab("home"); };

  const startBooking = (lot) => { setActiveLot(lot); setScreen("booking"); };

  const confirmBookingDraft = (d) => {
    if (isFull && d.lot.id === "p1") return;
    const otp = lockSlot(d.slot, d.name, d.vehicleType);
    setDraft({ ...d, otp });
    setScreen("payment");
  };

  const payNow = () => {
    confirmPayment(draft.slot);
    const booking = { ...draft };
    setLastBooking(booking);
    addBooking(booking);
    setScreen("success");
  };

  const cancelPayment = () => {
    cancelLock(draft.slot);
    setScreen("main");
    setTab("home");
  };

  if (screen === "splash") return <SplashScreen onDone={() => setScreen("login")} />;
  if (screen === "login") return <LoginScreen onLogin={goHome} />;
  if (screen === "search") return <SearchScreen onBack={() => setScreen("main")} onOpenLot={(lot) => { setActiveLot(lot); setScreen("details"); }} />;
  if (screen === "map") return (
    <MapScreen onBack={() => setScreen("main")} onOpenLot={(lot) => { setActiveLot(lot); setScreen("details"); }} />
  );
  if (screen === "details") return (
    <DetailsScreen
      lot={activeLot}
      onBack={() => setScreen("main")}
      onBook={startBooking}
      onNavigate={() => setScreen("map")}
    />
  );
  if (screen === "booking") return (
    <BookingScreen lot={activeLot} onBack={() => setScreen("details")} onConfirm={confirmBookingDraft} />
  );
  if (screen === "payment") return (
    <PaymentScreen draft={draft} onBack={() => setScreen("booking")} onPay={payNow} onCancel={cancelPayment} />
  );
  if (screen === "success") return (
    <SuccessScreen
      booking={lastBooking}
      onDone={goHome}
      onViewBookings={() => { setScreen("main"); setTab("bookings"); }}
      onViewMap={() => setScreen("map")}
    />
  );

  // main app w/ tab bar
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {tab === "home" && (
          <HomeScreen
            onSearch={() => setScreen("search")}
            onMap={() => setScreen("map")}
            onOpenLot={(lot) => { setActiveLot(lot); setScreen("details"); }}
            favorites={favorites}
            toggleFav={toggleFav}
            onNotif={() => {}}
            onProfile={() => setTab("profile")}
          />
        )}
        {tab === "bookings" && (
          <MyBookingsScreen bookings={myBookings} onBack={() => setTab("home")} onOpenBooking={() => {}} />
        )}
        {tab === "profile" && (
          <ProfileScreen onBack={() => setTab("home")} onLogout={() => setScreen("login")} favorites={favorites} />
        )}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

/* ============================================================================
   OWNER DASHBOARD
============================================================================ */

const DASH_BG = "#F4F6F9";
const DASH_CARD = "#FFFFFF";
const DASH_BORDER = "#E4E8EF";
const DASH_TEXT = "#101828";
const DASH_MUTE = "#667085";

const dashPrimaryBtn = {
  width: "100%", marginTop: 14, padding: "12px 0", borderRadius: 10, border: "none",
  background: NAVY, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
};

/* ---------- PHONE FRAME ---------- */
function PhoneFrame({ children }) {
  return (
    <div style={{
      width: 360, height: 740, borderRadius: 44, background: "#000", padding: 10,
      boxShadow: "0 30px 70px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
      position: "relative", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        width: 120, height: 26, background: "#000", borderRadius: 14, zIndex: 100,
      }} />
      <div style={{ width: "100%", height: "100%", borderRadius: 34, overflow: "hidden", position: "relative", background: INK }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- OWNER DASHBOARD (hidden, simplified android-style screen) ---------- */
function OwnerDashboard({ onClose }) {
  const { counts, verifyEntry, isFull } = useStore();
  const [otp, setOtp] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("car");
  const [msg, setMsg] = useState(null);
  useTick(1000);

  const submit = () => {
    if (otp.length !== 4) {
      setMsg({ ok: false, text: "Enter the 4-digit OTP given by the customer." });
      return;
    }
    if (!plate.trim()) {
      setMsg({ ok: false, text: "Enter the vehicle's number plate." });
      return;
    }
    const res = verifyEntry(plate.trim().toUpperCase(), otp.trim());
    if (res.ok) {
      setMsg({ ok: true, text: `Verified. Vehicle allowed into slot ${res.code}.` });
      setOtp(""); setPlate("");
    } else {
      setMsg({ ok: false, text: "OTP not found or already used." });
    }
  };

  return (
    <ScreenShell bg={INK} statusLight>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0 6px" }}>
        <button onClick={onClose} style={iconBtnStyle}><ChevronLeft size={20} color="#fff" /></button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Owner Console</div>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck size={16} color="#fff" />
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginBottom: 18 }}>Cyber Hub Parking Plaza</div>

      {isFull && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={15} color="#EF4444" />
          <span style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600 }}>Lot full — driver bookings paused</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <MiniStat label="Available" value={counts.available} color="#4ADE80" bg="rgba(34,197,94,0.12)" />
        <MiniStat label="Filled" value={counts.occupied} color="#F87171" bg="rgba(239,68,68,0.12)" />
        <MiniStat label="Locked" value={counts.locked} color="#FBBF24" bg="rgba(245,158,11,0.12)" />
      </div>

      <div style={{
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <LogIn size={16} color="#9DB6E8" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Verify entry</span>
        </div>

        <FieldLabel>Customer OTP</FieldLabel>
        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="4-digit OTP"
          inputMode="numeric"
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 14, marginBottom: 16,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: 6, textAlign: "center",
            outline: "none", fontFamily: "inherit",
          }}
        />

        <FieldLabel>Vehicle number plate</FieldLabel>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="Type plate as seen on vehicle"
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 14, marginBottom: 16,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: 1.5, textAlign: "center",
            outline: "none", fontFamily: "inherit",
          }}
        />

        <FieldLabel>Vehicle type</FieldLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          {[{ k: "car", icon: Car, label: "Car" }, { k: "bike", icon: Bike, label: "Bike" }, { k: "suv", icon: Truck, label: "SUV" }].map((v) => (
            <button
              key={v.k}
              onClick={() => setVehicleType(v.k)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                background: vehicleType === v.k ? "#fff" : "rgba(255,255,255,0.06)",
                color: vehicleType === v.k ? INK : "#fff",
                border: `1px solid ${vehicleType === v.k ? "#fff" : "rgba(255,255,255,0.1)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}
            >
              <v.icon size={16} />
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>{v.label}</span>
            </button>
          ))}
        </div>

        {msg && (
          <div style={{
            marginTop: 14, fontSize: 12.5, fontWeight: 600, padding: "10px 12px", borderRadius: 10,
            background: msg.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: msg.ok ? "#4ADE80" : "#F87171",
          }}>
            {msg.text}
          </div>
        )}

        <button onClick={submit} style={{ ...dashPrimaryBtn, marginTop: 16, borderRadius: 14, padding: "15px 0", fontSize: 14.5 }}>
          <ShieldCheck size={16} /> Verify OTP &amp; allow entry
        </button>
      </div>
    </ScreenShell>
  );
}

function MiniStat({ label, value, color, bg }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ============================================================================
   TOP-LEVEL APP SWITCHER
============================================================================ */

export default function OpaclyProject() {
  const [view, setView] = useState("driver"); // "driver" | "owner"
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  const handleLogoTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1200);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setView((v) => (v === "owner" ? "driver" : "owner"));
    }
  };

  return (
    <StoreProvider>
      <div style={{ minHeight: "100vh", background: "#11141C", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* header — no visible owner-dashboard control; tap the logo 5x quickly to reveal it */}
        <div style={{
          width: "100%", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0D1019", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, zIndex: 50,
        }}>
          <div onClick={handleLogoTap} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "default", userSelect: "none" }}>
            <PinMark size={22} />
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: -0.2 }}>Opacly</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>· Park with certainty</span>
          </div>
        </div>

        <div style={{ width: "100%", flex: 1, display: "flex", justifyContent: "center", padding: "36px 20px" }}>
          <PhoneFrame>
            {view === "driver" ? <DriverApp /> : <OwnerDashboard onClose={() => setView("driver")} />}
          </PhoneFrame>
        </div>
      </div>
    </StoreProvider>
  );
}
