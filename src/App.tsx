import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import * as XLSX from "xlsx";
import { api } from "../convex/_generated/api";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { useAppData } from "./context/AppDataContext";
import { useAuth } from "./context/AuthContext";
import { exportGatePassPdf, exportPurchasedItemsPdf, exportSessionSummaryPdf } from "./lib/pdf";
import type {
  AppSnapshot,
  DeliveryStatus,
  EnquirySource,
  GatePass,
  PriceEntryMode,
  PriceHistoryFilter,
  Product,
  StockReason,
  UtilityCandidateMatch,
  UtilityDraft,
  UtilityDraftEntry,
  WeightType
} from "./types";

const sourceLabelMap: Record<EnquirySource, string> = {
  phone: "Phone",
  visit: "Visit",
  whatsapp: "WA",
  other: "Other"
};

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function formatCompactMoney(value: number) {
  if (value >= 1000) return `₹${Number((value / 1000).toFixed(1))}k`;
  return formatMoney(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function gatePassBagCount(gatePass: GatePass) {
  if (typeof gatePass.smallBagCount === "number" || typeof gatePass.bigBagCount === "number") {
    return (gatePass.smallBagCount ?? 0) + (gatePass.bigBagCount ?? 0);
  }
  return gatePass.bags.length;
}

function sessionBills(snapshot: AppSnapshot, sessionId: string) {
  return snapshot.bills.filter((bill) => bill.sessionId === sessionId);
}

function sessionGatePasses(snapshot: AppSnapshot, sessionId: string) {
  return snapshot.gatePasses.filter((gatePass) => gatePass.sessionId === sessionId);
}

function sessionSpend(snapshot: AppSnapshot, sessionId: string) {
  return sessionBills(snapshot, sessionId).reduce((sum, bill) => sum + bill.totalAmount, 0);
}

function sessionCourier(snapshot: AppSnapshot, sessionId: string) {
  return sessionGatePasses(snapshot, sessionId).reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);
}

function sessionBagCount(snapshot: AppSnapshot, sessionId: string) {
  return sessionGatePasses(snapshot, sessionId).reduce((sum, gatePass) => sum + gatePassBagCount(gatePass), 0);
}

type ComboOption = {
  id: string;
  label: string;
  searchText: string;
};

type BrowserSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  }
}

function SearchableComboBox({
  label,
  placeholder,
  value,
  options,
  onSelect
}: {
  label: string;
  placeholder: string;
  value: string;
  options: ComboOption[];
  onSelect: (option: ComboOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.searchText.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fg" ref={rootRef}>
      <div className="fl">{label}</div>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen((current) => !current);
          }}
          style={{
            width: "100%",
            borderRadius: 14,
            border: "1.5px solid var(--line)",
            background: "var(--paper)",
            padding: "14px 16px",
            textAlign: "left",
            color: value ? "var(--text)" : "var(--muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 16
          }}
        >
          <span>{value || placeholder}</span>
          <span style={{ fontSize: 18, color: "var(--text)" }}>▾</span>
        </button>
        {open ? (
          <div
            className="ep"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "calc(100% + 8px)",
              zIndex: 20,
              maxHeight: 260,
              overflow: "hidden"
            }}
          >
            <input
              autoFocus
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
              {filteredOptions.length ? (
                filteredOptions.slice(0, 12).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelect(option);
                      setQuery("");
                      setOpen(false);
                    }}
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: `1.5px solid ${value === option.label ? "var(--g2)" : "var(--line)"}`,
                      background: value === option.label ? "var(--mint)" : "var(--paper)",
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: 15,
                      fontWeight: 600,
                      color: value === option.label ? "var(--g)" : "var(--text)"
                    }}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className="isub">No matches found.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getStockBadge(product: Product) {
  if (product.currentStockQty <= Math.max(1, product.minStockAlert / 2)) {
    return { className: "br", label: "Critical" };
  }
  if (product.currentStockQty <= product.minStockAlert) {
    return { className: "bw", label: "Low" };
  }
  return { className: "bg", label: "Healthy" };
}

function rateLabel(rate: number, unitLabel: string, ratePerKg?: number) {
  const unitText = `${formatMoney(rate)}/${unitLabel}`;
  return typeof ratePerKg === "number" ? `${unitText} · ${formatMoney(ratePerKg)}/kg` : unitText;
}

function ScreenFrame({
  title,
  backTo,
  action,
  children,
  search
}: {
  title: string;
  backTo?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  search?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <div className="screen">
        <div className="topbar">
          {backTo ? (
            <Link className="bb-btn" to={backTo}>
              ←
            </Link>
          ) : null}
          <h1>{title}</h1>
          {action}
          {user ? (
            <button className="ta-btn" type="button" onClick={logout} style={{ marginLeft: 4 }}>
              Logout
            </button>
          ) : null}
        </div>
        {search}
        {children}
      </div>
    </div>
  );
}

function SessionPicker({
  title = "Session",
  subtitle = "Choose the working session first",
  compact = false
}: {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const { snapshot, activeSession, selectedSessionId, setSelectedSessionId, createSession, removeSession } = useAppData();
  const selectedSession =
    snapshot.sessions.find((session) => session.id === selectedSessionId) ??
    (activeSession.id ? activeSession : undefined) ??
    snapshot.sessions[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState(todayInputValue());
  const [draftOpeningBalance, setDraftOpeningBalance] = useState("30000");
  const sessions = snapshot.sessions.filter((session) =>
    `${session.name} ${session.date}`.toLowerCase().includes(query.toLowerCase())
  );
  const canDeleteSelected =
    !!selectedSession &&
    !snapshot.bills.some((bill) => bill.sessionId === selectedSession.id) &&
    !snapshot.gatePasses.some((gatePass) => gatePass.sessionId === selectedSession.id) &&
    !snapshot.deliveryVerifications.some((verification) => verification.sessionId === selectedSession.id);

  return (
    <>
      <div className="card">
        <div className="ct">{title}</div>
        <div className="nbox nbox-a" style={{ marginBottom: 10 }}>
          {subtitle}
        </div>
        <div
          style={{
            border: "1.5px solid var(--gb)",
            background: "var(--gl)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 10
          }}
        >
          <div style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, color: "var(--g)", marginBottom: 4 }}>
            {selectedSession?.name ?? "No session selected"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {selectedSession ? `${formatDate(selectedSession.date)} · Opening ${formatMoney(selectedSession.openingBalance)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-s btn-sm"
            type="button"
            onClick={() => {
              setQuery("");
              setIsCreating(false);
              setOpen((current) => !current);
            }}
          >
            Change session
          </button>
          <button
            className="btn btn-p btn-sm"
            type="button"
            onClick={() => {
              setOpen(true);
              setIsCreating(true);
              setDraftName("");
              setDraftDate(todayInputValue());
              setDraftOpeningBalance("30000");
            }}
          >
            + New session
          </button>
        </div>
        {compact ? null : (
          <div className="nbox nbox-w" style={{ marginTop: 10 }}>
            This session stays selected across register, purchase, summary, verification, and PDFs.
          </div>
        )}
        {open ? (
          <div className="card" style={{ marginTop: 12, padding: 14 }}>
            <div className="row" style={{ border: "none", padding: 0, marginBottom: 10 }}>
              <div className="ct" style={{ marginBottom: 0 }}>
                {isCreating ? "Create session" : "Select session"}
              </div>
              <button
                className="btn btn-s btn-sm"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setIsCreating(false);
                }}
              >
                Close
              </button>
            </div>

            {isCreating ? (
              <div className="card" style={{ padding: 0, border: "none", boxShadow: "none", marginBottom: 0 }}>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <div className="fl">Session name</div>
                  <input type="text" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                </div>
                <div className="fr2" style={{ marginBottom: 10 }}>
                  <div className="fg">
                    <div className="fl">Date</div>
                    <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
                  </div>
                  <div className="fg">
                    <div className="fl">Opening balance</div>
                    <input
                      type="number"
                      value={draftOpeningBalance}
                      onChange={(event) => setDraftOpeningBalance(event.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-p"
                    type="button"
                    onClick={() => {
                      createSession({
                        name: draftName.trim() || undefined,
                        date: draftDate,
                        openingBalance: Number(draftOpeningBalance || 0)
                      });
                      setOpen(false);
                      setIsCreating(false);
                    }}
                  >
                    Create session
                  </button>
                  <button className="btn btn-s" type="button" onClick={() => setIsCreating(false)}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="sw" style={{ marginBottom: 10 }}>
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className={`dchip ${selectedSessionId === session.id ? "on" : ""}`}
                      type="button"
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setOpen(false);
                      }}
                    >
                      <span style={{ flex: 1, textAlign: "left" }}>
                        {session.name} · {formatDate(session.date)}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{capitalize(session.status)}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="btn btn-p btn-sm" type="button" onClick={() => setIsCreating(true)}>
                    + New session
                  </button>
                  {canDeleteSelected ? (
                    <button
                      className="btn btn-d btn-sm"
                      type="button"
                      onClick={() => {
                        removeSession(selectedSession.id);
                        setOpen(false);
                      }}
                    >
                      Delete empty session
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  const [name, setName] = useState("Aditya");
  const [role, setRole] = useState<"owner" | "worker">("owner");

  return (
    <div className="app">
      <div className="screen">
        <div className="topbar">
          <h1>StockTrack</h1>
        </div>
        <div className="content" style={{ paddingTop: 18 }}>
          <div className="card">
            <div className="ct">Login</div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <div className="fl">Name</div>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="fg" style={{ marginBottom: 12 }}>
              <div className="fl">Role</div>
              <div className="tog">
                <button className={role === "owner" ? "on" : ""} type="button" onClick={() => setRole("owner")}>
                  Owner
                </button>
                <button className={role === "worker" ? "on" : ""} type="button" onClick={() => setRole("worker")}>
                  Worker
                </button>
              </div>
            </div>
            <div className="nbox nbox-a" style={{ marginBottom: 12 }}>
              Owner gets all screens. Worker is limited to stock updates.
            </div>
            <button
              className="btn btn-p"
              type="button"
              onClick={() => login({ name, role: role === "owner" ? "owner" : "staff" })}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { user } = useAuth();

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <>
      <Routes>
        {user.role === "owner" ? (
          <>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/session-details" element={<SessionDetailsScreen />} />
            <Route path="/stock" element={<StockScreen />} />
            <Route path="/stock/excel" element={<StockExcelScreen />} />
            <Route path="/register" element={<RegisterScreen />} />
            <Route path="/register/session" element={<RegisterSessionScreen />} />
            <Route path="/register/excel" element={<RegisterExcelScreen />} />
            <Route path="/purchase" element={<PurchaseScreen />} />
            <Route path="/bag-fill" element={<BagFillScreen />} />
            <Route path="/bills" element={<BillsScreen />} />
            <Route path="/gate-passes" element={<GatePassesScreen />} />
            <Route path="/gate-passes/:gatePassId" element={<GatePassViewScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
            <Route path="/master" element={<MasterScreen />} />
            <Route path="/master/excel" element={<MasterExcelScreen />} />
            <Route path="/utility" element={<UtilityScreen />} />
            <Route path="/master/items/new" element={<ItemDetailScreen />} />
            <Route path="/master/items/:productId" element={<ItemDetailScreen />} />
            <Route path="/master/distributors/new" element={<DistributorDetailScreen />} />
            <Route path="/master/distributors/:distributorId" element={<DistributorDetailScreen />} />
            <Route path="/enquiry/new" element={<AddEnquiryScreen />} />
            <Route path="/delivery-verify" element={<VerifyScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/stock" element={<StockScreen />} />
            <Route path="*" element={<Navigate to="/stock" replace />} />
          </>
        )}
      </Routes>
    </>
  );
}

function HomeScreen() {
  const { snapshot, activeSession } = useAppData();
  const totalSpend = sessionSpend(snapshot, activeSession.id);
  const totalCourier = sessionCourier(snapshot, activeSession.id);
  const totalBags = sessionBagCount(snapshot, activeSession.id);
  const remaining = activeSession.openingBalance - totalSpend - totalCourier;

  const todayStats = [
    { label: "Bills raised", value: String(sessionBills(snapshot, activeSession.id).length) },
    { label: "Total bags", value: String(totalBags) },
    { label: "Total spend", value: formatMoney(totalSpend) },
    { label: "Courier paid", value: formatMoney(totalCourier) }
  ];

  return (
    <ScreenFrame
      title="StockTrack"
      action={<span style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(activeSession.date)}</span>}
    >
      <div className="content">
        <Link className="sbar" style={{ cursor: "pointer" }} to="/session-details">
          <div className="row">
            <div>
              <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, fontSize: 14 }}>{activeSession.name}</span>{" "}
              <span style={{ fontSize: 11, color: "var(--g)" }}>▸ view details</span>
            </div>
            <span className="badge bg">{capitalize(activeSession.status)}</span>
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            {[
              { title: "Opening", value: formatCompactMoney(activeSession.openingBalance), color: "var(--g)" },
              { title: "Spent", value: formatCompactMoney(totalSpend), color: "var(--r)" },
              { title: "Left", value: formatCompactMoney(remaining), color: "var(--g)" }
            ].map((card) => (
              <div key={card.title} style={{ background: "rgba(255,255,255,.6)", borderRadius: 8, padding: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--g)",
                    fontFamily: "Sora, sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: ".4px"
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontFamily: "Sora, sans-serif",
                    fontWeight: 800,
                    color: card.color,
                    fontSize: 16,
                    letterSpacing: "-.5px"
                  }}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </Link>

        <div className="nav-grid">
          {[
            { to: "/stock", icon: "📦", title: "Stock", sub: "View & update" },
            { to: "/stock/excel", icon: "📤", title: "Stock Excel", sub: "Bulk stock update" },
            { to: "/register", icon: "📋", title: "Register", sub: "Plan purchases" },
            { to: "/purchase", icon: "🛒", title: "Purchase", sub: "Clear at shop" },
            { to: "/bills", icon: "🧾", title: "Bills", sub: "Saved purchases" },
            { to: "/delivery-verify", icon: "✅", title: "Verify", sub: "Match received" },
            { to: "/gate-passes", icon: "🧾", title: "Gate passes", sub: "View & export" },
            { to: "/summary", icon: "📊", title: "Summary", sub: "Balance & courier" },
            { to: "/master", icon: "🗂", title: "Items & Dists", sub: "Catalogue + prices" },
            { to: "/master/excel", icon: "📥", title: "Import / Export", sub: "Excel master data" },
            { to: "/utility", icon: "🧠", title: "Utility", sub: "Parse natural language" }
          ].map((tile) => (
            <Link className="ntile" key={tile.to} to={tile.to}>
              <div className="ni">{tile.icon}</div>
              <div className="nt">{tile.title}</div>
              <div className="ns">{tile.sub}</div>
            </Link>
          ))}
        </div>

        <div className="card">
          <div className="ct">Today</div>
          {todayStats.map((stat) => (
            <div className="row" key={stat.label}>
              <span className="lbl">{stat.label}</span>
              <span className="val">{stat.value}</span>
            </div>
          ))}
        </div>

        <Link className="card" to="/delivery-verify" style={{ cursor: "pointer", textDecoration: "none" }}>
          <div className="ct">Delivery verification</div>
          <div className="row">
            <span className="lbl">Pending items</span>
            <span className="val">
              {
                snapshot.deliveryVerifications
                  .filter((entry) => entry.sessionId === activeSession.id)
                  .flatMap((entry) => entry.items)
                  .filter((item) => item.status === "pending").length
              }
            </span>
          </div>
          <div className="isub" style={{ marginTop: 4 }}>
            Open and match received stock for this session.
          </div>
        </Link>
      </div>
    </ScreenFrame>
  );
}

function SessionDetailsScreen() {
  const { snapshot, activeSession, setSessionOpeningBalance, setSessionClosingBalance } = useAppData();
  const totalSpend = sessionSpend(snapshot, activeSession.id);
  const totalCourier = sessionCourier(snapshot, activeSession.id);
  const expected = activeSession.openingBalance - totalSpend - totalCourier;
  const diff = typeof activeSession.closingBalance === "number" ? activeSession.closingBalance - expected : null;

  const purchasedRows = sessionBills(snapshot, activeSession.id).flatMap((bill) =>
    bill.items.map((item) => {
      const product = snapshot.products.find((entry) => entry.id === item.productId);
      const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId);
      return {
        key: `${bill.id}-${item.id}`,
        product,
        distributor,
        item
      };
    })
  );

  return (
    <ScreenFrame title="Session details" backTo="/" action={<Link className="ta-btn" to="/summary">Summary</Link>}>
      <div className="content">
        <div className="sbar">
          <div className="row">
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700 }}>{activeSession.name}</span>
            <span className="badge bg">{capitalize(activeSession.status)}</span>
          </div>
          <div className="isub" style={{ marginTop: 3 }}>
            {formatDate(activeSession.date)} · Session #0024
          </div>
        </div>

        <div className="card">
          <div className="ct">Opening balance — cash taken for trip</div>
          <div className="fg">
            <div className="fl">Amount (₹)</div>
            <input
              type="number"
              value={activeSession.openingBalance}
              onChange={(event) => setSessionOpeningBalance(Number(event.target.value))}
            />
          </div>
        </div>

        <div className={diff !== null && diff < 0 ? "bal-err" : "bal-ok"}>
          <div className="ct" style={{ color: "var(--g)" }}>
            Balance tracker
          </div>
          <div className="bal-row">
            <span className="lbl">Opening balance</span>
            <span className="val">{formatMoney(activeSession.openingBalance)}</span>
          </div>
          <div className="bal-row">
            <span className="lbl" style={{ color: "var(--r)" }}>
              − Bills spent
            </span>
            <span style={{ color: "var(--r)", fontWeight: 600 }}>{formatMoney(totalSpend)}</span>
          </div>
          <div className="bal-row">
            <span className="lbl" style={{ color: "var(--r)" }}>
              − Courier paid
            </span>
            <span style={{ color: "var(--r)", fontWeight: 600 }}>{formatMoney(totalCourier)}</span>
          </div>
          <div className="bal-div" />
          <div className="bal-row">
            <span style={{ fontWeight: 700 }}>Expected in hand</span>
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, color: "var(--g)" }}>
              {formatMoney(expected)}
            </span>
          </div>
          <div className="fg" style={{ marginTop: 10 }}>
            <div className="fl">Actual cash left with you (₹)</div>
            <input
              type="number"
              placeholder="Enter closing balance"
              value={activeSession.closingBalance ?? ""}
              onChange={(event) =>
                setSessionClosingBalance(event.target.value ? Number(event.target.value) : undefined)
              }
            />
          </div>
          <div className="fg" style={{ marginTop: 8 }}>
            <div className="fl">Difference</div>
            <input
              readOnly
              className={diff === null ? "auto-f" : diff >= 0 ? "diff-ok" : "diff-err"}
              value={
                diff === null
                  ? "Enter closing balance above"
                  : diff === 0
                    ? "₹0 — Balanced ✓"
                    : diff > 0
                      ? `+${formatMoney(diff)} — Surplus`
                      : `−${formatMoney(Math.abs(diff))} — Unaccounted ⚠`
              }
            />
          </div>
        </div>

        <div className="card">
          <div className="ct">All bills this session</div>
          {sessionBills(snapshot, activeSession.id).map((bill) => {
            const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId);
            const gatePass = snapshot.gatePasses.find((entry) => entry.billId === bill.id);
            return (
              <div className="bill-row" key={bill.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{distributor?.name}</div>
                  <div className="isub">Bill: {bill.billNumber}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{formatMoney(bill.totalAmount)}</div>
                  <div className="isub">{gatePass ? `${gatePassBagCount(gatePass)} bags` : "bags pending"}</div>
                </div>
              </div>
            );
          })}
          <div className="divider" />
          <div className="row" style={{ border: "none", padding: 0, marginTop: 6 }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, color: "var(--g)", fontSize: 16 }}>
              {formatMoney(totalSpend)}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="ct">Items purchased</div>
          {purchasedRows.map((row) => (
            <div className="irow" key={row.key}>
              <div className="row">
                <span className="iname">{row.product?.name}</span>
                <span className="badge bb">
                  {row.item.unitsBought} {row.product?.unitLabel}s
                </span>
              </div>
              <div className="row" style={{ marginTop: 4, border: "none", padding: 0 }}>
                <span className="lbl">
                  {row.distributor?.name} ({row.distributor?.shortCode})
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {formatMoney(row.item.totalPrice)} · {formatMoney(row.item.ratePerKg)}/kg
                </span>
              </div>
            </div>
          ))}
        </div>

        <Link className="btn btn-p" to="/summary">
          Full summary + courier →
        </Link>
        <button className="btn btn-s" type="button">
          Close session
        </button>
      </div>
    </ScreenFrame>
  );
}

function StockScreen() {
  const { snapshot, updateStock } = useAppData();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState<Record<string, { qty: number; reason: StockReason; note: string }>>({});
  const isOwner = user?.role === "owner";

  const filteredProducts = snapshot.products.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase())
  );

  const historyForProduct = (productId: string) =>
    snapshot.purchaseHistory
      .filter((entry) => entry.productId === productId)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
      .slice(0, 3);

  const enquiriesForProduct = (productId: string) =>
    snapshot.enquiryHistory
      .filter((entry) => entry.productId === productId)
      .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate))
      .slice(0, 3);

  return (
    <ScreenFrame
      title="Stock"
      backTo="/"
      action={
        isOwner ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="ta-btn" to="/stock/excel">
              Bulk
            </Link>
            <Link className="ta-btn" to="/register">
              + Plan
            </Link>
          </div>
        ) : undefined
      }
      search={
        <div className="sw">
          <input
            type="text"
            placeholder="Search products..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      }
    >
      <div className="content">
        <div className="card">
          <div className="ct">All products</div>
          {filteredProducts.map((product) => {
            const badge = getStockBadge(product);
            const editState =
              stockForm[product.id] ??
              ({
                qty: product.currentStockQty,
                reason: "manual_count",
                note: ""
              } as const);
            return (
              <div className="srow" key={product.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div className="iname">{product.name}</div>
                    <div className="isub">
                      {product.weightPerUnitKg} kg/{product.unitLabel} ·{" "}
                      <strong style={{ color: badge.className === "bg" ? "var(--g)" : "var(--r)" }}>
                        {product.currentStockQty} {product.unitLabel}s
                      </strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    <button className="btn btn-s btn-sm" type="button" onClick={() => setEditingId(editingId === product.id ? null : product.id)}>
                      Edit
                    </button>
                  </div>
                </div>

                {editingId === product.id ? (
                  <div className="ep">
                    <div className="fr2" style={{ marginBottom: 8 }}>
                      <div className="fg">
                        <div className="fl">New qty ({product.unitLabel}s)</div>
                        <input
                          type="number"
                          value={editState.qty}
                          onChange={(event) =>
                            setStockForm((current) => ({
                              ...current,
                              [product.id]: { ...editState, qty: Number(event.target.value) }
                            }))
                          }
                        />
                      </div>
                      <div className="fg">
                        <div className="fl">Reason</div>
                        <select
                          value={editState.reason}
                          onChange={(event) =>
                            setStockForm((current) => ({
                              ...current,
                              [product.id]: { ...editState, reason: event.target.value as StockReason }
                            }))
                          }
                        >
                          <option value="manual_count">Manual count</option>
                          <option value="sale">Sale</option>
                          <option value="damage">Damage</option>
                          <option value="received">Received</option>
                        </select>
                      </div>
                    </div>
                    <div className="fg" style={{ marginBottom: 8 }}>
                      <div className="fl">Note</div>
                      <input
                        type="text"
                        placeholder="optional"
                        value={editState.note}
                        onChange={(event) =>
                          setStockForm((current) => ({
                            ...current,
                            [product.id]: { ...editState, note: event.target.value }
                          }))
                        }
                      />
                    </div>
                    <button
                      className="btn btn-p"
                      style={{ fontSize: 13, padding: 8 }}
                      type="button"
                      onClick={() => {
                        updateStock({
                          productId: product.id,
                          newQty: editState.qty,
                          reason: editState.reason,
                          notes: editState.note
                        });
                        setEditingId(null);
                      }}
                    >
                      Save update
                    </button>
                  </div>
                ) : null}

                {isOwner ? (
                  <>
                    <details className="ph-box" style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                        Purchase history
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {historyForProduct(product.id).map((entry) => {
                          const distributor = snapshot.distributors.find((item) => item.id === entry.distributorId);
                          return (
                            <div className="ph-row" key={entry.id}>
                              <span className="ph-dist">
                                {distributor?.name} ({distributor?.shortCode})
                              </span>
                              <span className="ph-rate">{rateLabel(entry.ratePerUnit, product.unitLabel, entry.ratePerKg)}</span>
                              <span className="ph-date">{shortDate(entry.purchaseDate)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </details>

                    <details className="eq-box" style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                        Enquiry prices
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {enquiriesForProduct(product.id).map((entry) => {
                          const distributor = snapshot.distributors.find((item) => item.id === entry.distributorId);
                          return (
                            <div className="eq-row" key={entry.id}>
                              <span className="eq-dist">
                                {distributor?.name} ({distributor?.shortCode})
                              </span>
                              <span className="eq-rate">{formatMoney(entry.quotedRatePerUnit)}/{product.unitLabel}</span>
                              <span className={`src-${entry.source === "whatsapp" ? "wa" : entry.source}`}>
                                {sourceLabelMap[entry.source]}
                              </span>
                            </div>
                          );
                        })}
                        <Link className="btn btn-a btn-sm" style={{ marginTop: 8, fontSize: 11 }} to="/enquiry/new">
                          + Log enquiry price
                        </Link>
                      </div>
                    </details>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        {isOwner ? (
          <Link className="btn btn-p" to="/register">
            Open purchase register →
          </Link>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function AddEnquiryScreen() {
  const { snapshot, addEnquiry, addManyEnquiries } = useAppData();
  const updateEnquiry = useMutation((api as any).priceHistory.updateEnquiry);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entryId = searchParams.get("entryId") ?? "";
  const defaultProductId = searchParams.get("productId") ?? "";
  const defaultDistributorId = searchParams.get("distributorId") ?? "";
  const existingEntry = entryId ? snapshot.enquiryHistory.find((entry) => entry.id === entryId) : undefined;
  const [productId, setProductId] = useState(existingEntry?.productId ?? (defaultProductId || (snapshot.products[0]?.id ?? "")));
  const [distributorId, setDistributorId] = useState(
    existingEntry?.distributorId ?? (defaultDistributorId || (snapshot.distributors[0]?.id ?? ""))
  );
  const [rate, setRate] = useState(existingEntry ? String(existingEntry.quotedRatePerUnit) : "");
  const [notes, setNotes] = useState(existingEntry?.notes ?? "");
  const [rows, setRows] = useState<Array<{ id: string; productId: string; rate: string; notes: string }>>([
    {
      id: crypto.randomUUID(),
      productId: existingEntry?.productId ?? (defaultProductId || ""),
      rate: existingEntry ? String(existingEntry.quotedRatePerUnit) : "",
      notes: existingEntry?.notes ?? ""
    }
  ]);
  const product = snapshot.products.find((entry) => entry.id === productId);
  const distributor = snapshot.distributors.find((entry) => entry.id === distributorId);
  const quotedRate = Number(rate || 0);
  const enquiryDate = existingEntry?.enquiryDate ?? todayInputValue();

  useEffect(() => {
    if (!snapshot.products.length || !snapshot.distributors.length) return;

    if (defaultProductId && snapshot.products.some((entry) => entry.id === defaultProductId)) {
      setProductId(defaultProductId);
    } else if (!productId) {
      setProductId(snapshot.products[0].id);
    }

    if (defaultDistributorId && snapshot.distributors.some((entry) => entry.id === defaultDistributorId)) {
      setDistributorId(defaultDistributorId);
    } else if (!distributorId) {
      setDistributorId(snapshot.distributors[0].id);
    }
  }, [defaultDistributorId, defaultProductId, distributorId, productId, snapshot.distributors, snapshot.products]);

  const productOptions: ComboOption[] = snapshot.products.map((entry) => ({
    id: entry.id,
    label: entry.name,
    searchText: `${entry.name} ${entry.unitLabel}`
  }));

  const distributorOptions: ComboOption[] = snapshot.distributors.map((entry) => ({
    id: entry.id,
    label: `${entry.name} (${entry.shortCode})`,
    searchText: `${entry.name} ${entry.shortCode} ${entry.area ?? ""}`
  }));
  const batchRows = rows.map((row) => ({
    ...row,
    product: snapshot.products.find((entry) => entry.id === row.productId)
  }));
  const validBatchRows = batchRows.filter((row) => row.productId && Number(row.rate || 0) > 0);

  return (
    <ScreenFrame title="Log enquiry price" backTo="/master">
      <div className="content">
        <div className="card">
          <div className="ct">Quick enquiry</div>
          <div style={{ marginBottom: 10 }}>
            <SearchableComboBox
              label="Distributor"
              placeholder="Search distributor..."
              value={distributor ? `${distributor.name} (${distributor.shortCode})` : ""}
              options={distributorOptions}
              onSelect={(option) => setDistributorId(option.id)}
            />
          </div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Date</div>
            <input className="auto-f" readOnly value={formatDate(enquiryDate)} />
          </div>
          {existingEntry ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <SearchableComboBox
                  label="Item"
                  placeholder="Search item..."
                  value={product?.name ?? ""}
                  options={productOptions}
                  onSelect={(option) => setProductId(option.id)}
                />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <div className="fl">Quoted price (₹/{product?.unitLabel ?? "unit"})</div>
                <input type="number" value={rate} onChange={(event) => setRate(event.target.value)} />
              </div>
              <div className="fg">
                <div className="fl">Remarks (optional)</div>
                <textarea placeholder="Any short note" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
                Add multiple item prices for this distributor, then save them together.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {batchRows.map((row, index) => (
                  <div className="card" key={row.id} style={{ margin: 0 }}>
                    <div className="row" style={{ padding: 0, border: "none", marginBottom: 10 }}>
                      <div className="lbl">Item {index + 1}</div>
                      {batchRows.length > 1 ? (
                        <button
                          className="btn btn-d btn-sm"
                          type="button"
                          onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <SearchableComboBox
                        label="Item"
                        placeholder="Search item..."
                        value={row.product?.name ?? ""}
                        options={productOptions}
                        onSelect={(option) =>
                          setRows((current) =>
                            current.map((entry) => (entry.id === row.id ? { ...entry, productId: option.id } : entry))
                          )
                        }
                      />
                    </div>
                    <div className="fg" style={{ marginBottom: 10 }}>
                      <div className="fl">Quoted price (₹/{row.product?.unitLabel ?? "unit"})</div>
                      <input
                        type="number"
                        value={row.rate}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((entry) => (entry.id === row.id ? { ...entry, rate: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                    <div className="fg">
                      <div className="fl">Remarks (optional)</div>
                      <textarea
                        placeholder="Any short note"
                        value={row.notes}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((entry) => (entry.id === row.id ? { ...entry, notes: event.target.value } : entry))
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-s"
                type="button"
                onClick={() =>
                  setRows((current) => [...current, { id: crypto.randomUUID(), productId: "", rate: "", notes: "" }])
                }
              >
                + Add another enquiry
              </button>
            </>
          )}
        </div>
        <button
          className="btn btn-p"
          type="button"
          disabled={existingEntry ? !productId || !distributorId : !distributorId || !validBatchRows.length}
          onClick={async () => {
            if (existingEntry) {
              await updateEnquiry({
                entryId: existingEntry.id as never,
                productId: productId as never,
                distributorId: distributorId as never,
                quotedRatePerUnit: quotedRate,
                weightPerUnitKg: product?.weightPerUnitKg ?? 0,
                enquiryDate,
                source: existingEntry.source,
                notes
              });
            } else {
              addManyEnquiries({
                distributorId,
                enquiries: validBatchRows.map((row) => ({
                  productId: row.productId,
                  distributorId,
                  quotedRatePerUnit: Number(row.rate || 0),
                  weightPerUnitKg: row.product?.weightPerUnitKg ?? 0,
                  enquiryDate,
                  source: "other",
                  notes: row.notes
                }))
              });
            }
            navigate("/master");
          }}
        >
          {existingEntry ? "Update enquiry price" : `Save ${validBatchRows.length || ""} enquiry price${validBatchRows.length === 1 ? "" : "s"}`.trim()}
        </button>
        <Link className="btn btn-s" to="/master">
          Cancel
        </Link>
      </div>
    </ScreenFrame>
  );
}

function RegisterSessionScreen() {
  const { activeSession, setSessionBasics, setSessionOpeningBalance } = useAppData();

  return (
    <ScreenFrame title="Plan session" backTo="/register">
      <div className="content">
        <SessionPicker title="Planning session" subtitle="Pick the session you want to plan items for." compact />
        <div className="card">
          <div className="ct">Session details</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Session name</div>
            <input
              type="text"
              value={activeSession.name}
              onChange={(event) => setSessionBasics(event.target.value, activeSession.date)}
            />
          </div>
          <div className="fr2">
            <div className="fg">
              <div className="fl">Date</div>
              <input
                type="date"
                value={activeSession.date}
                onChange={(event) => setSessionBasics(activeSession.name, event.target.value)}
              />
            </div>
            <div className="fg">
              <div className="fl">Opening balance</div>
              <input
                type="number"
                value={activeSession.openingBalance || ""}
                onChange={(event) => setSessionOpeningBalance(Number(event.target.value))}
              />
            </div>
          </div>
        </div>
        <Link className="btn btn-p" to="/register">
          Back to item planning →
        </Link>
      </div>
    </ScreenFrame>
  );
}

function getUtilityRequiredFields(kind: UtilityDraftEntry["operationKind"]) {
  switch (kind) {
    case "update_product":
      return ["productId"];
    case "update_distributor":
      return ["distributorId"];
    case "link_product_distributor":
      return ["productId", "distributorId"];
    case "plan_purchase":
      return ["sessionId", "productId", "qtyRequired"];
    case "update_stock":
      return ["productId", "newQty"];
    case "log_enquiry":
      return ["productId", "distributorId", "quotedRatePerUnit"];
    case "create_session":
      return ["name", "date", "openingBalance"];
    case "update_session":
      return ["sessionId"];
    case "record_purchase":
      return ["sessionId", "distributorId", "items"];
    case "verify_delivery":
      return ["sessionId", "distributorId", "productId", "receivedQty"];
    case "create_product":
      return ["name", "unitLabel"];
    case "create_distributor":
      return ["name", "shortCode"];
    default:
      return [];
  }
}

function deriveUtilityStatus(entry: UtilityDraftEntry) {
  if (entry.status === "unsupported" || entry.status === "skipped" || entry.status === "applied") {
    return entry.status;
  }
  const payload = entry.payload as Record<string, unknown>;
  const required = getUtilityRequiredFields(entry.operationKind);
  const hasAllFields = required.every((field) => {
    const value = payload[field];
    if (field === "items") {
      return Array.isArray(value) && value.length > 0 && value.every((item) => !!(item as Record<string, unknown>).productId);
    }
    if (typeof value === "number") return Number.isFinite(value);
    return value !== undefined && value !== null && value !== "";
  });
  return hasAllFields ? "resolved" : "unresolved";
}

function formatOperationKind(kind: UtilityDraftEntry["operationKind"]) {
  return kind.split("_").join(" ");
}

function UtilityScreen() {
  const { snapshot, selectedSessionId } = useAppData();
  const { user } = useAuth();
  const parseDraftAction = useAction((api as any).opsAssistantNode.parseDraft);
  const applyDraftMutation = useMutation((api as any).opsAssistant.applyDraft);
  const [text, setText] = useState("");
  const [draftId, setDraftId] = useState<string>("");
  const [entriesState, setEntriesState] = useState<UtilityDraftEntry[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const speechRecognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const draft = useQuery(
    (api as any).opsAssistant.getDraft,
    draftId ? { draftId: draftId as never } : "skip"
  ) as UtilityDraft | null | undefined;

  useEffect(() => {
    if (draft?.entries) {
      setEntriesState(draft.entries);
    }
  }, [draft?.id]);

  const unresolvedCount = entriesState.filter((entry) => {
    const status = deriveUtilityStatus(entry);
    return status !== "resolved" && status !== "skipped" && status !== "applied";
  }).length;

  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId);

  const updateEntry = (entryId: string, updater: (entry: UtilityDraftEntry) => UtilityDraftEntry) => {
    setEntriesState((current) => current.map((entry) => (entry.id === entryId ? updater(entry) : entry)));
  };

  const setPayloadField = (entryId: string, field: string, value: unknown) => {
    updateEntry(entryId, (entry) => {
      const next = {
        ...entry,
        payload: {
          ...(entry.payload as Record<string, unknown>),
          [field]: value
        }
      };
      return {
        ...next,
        status: deriveUtilityStatus(next)
      };
    });
  };

  const toggleListening = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setFeedback("This browser does not support inbuilt speech recognition.");
      return;
    }

    if (isListening && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setText((current) => (current ? `${current}\n${transcript}` : transcript));
        setFeedback("Voice text added. You can edit it with the keyboard before parsing.");
      }
    };
    recognition.onerror = (event) => {
      setFeedback(event.error ? `Microphone error: ${event.error}` : "Microphone input failed.");
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setFeedback("Listening... speak now and the text will be added here.");
  };

  return (
    <ScreenFrame title="Utility" backTo="/">
      <div className="content">
        <div className="card">
          <div className="ct">Natural language utility</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Paste a business note like item additions, distributor updates, stock corrections, enquiries, purchases, or verification.
            The utility will prepare safe DB operations and wait for your confirmation.
          </div>
          {selectedSession ? (
            <div className="nbox nbox-g" style={{ marginBottom: 10 }}>
              Working session: <strong>{selectedSession.name}</strong> · {formatDate(selectedSession.date)}
            </div>
          ) : null}
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Business note</div>
            <textarea
              placeholder="Example: Add basmati rice as a new item, link it to Shanmuka, set min stock 50, current stock 10, and plan 25 bags for today’s session."
              value={text}
              onChange={(event) => setText(event.target.value)}
              style={{ minHeight: 140 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-s btn-sm"
              type="button"
              onClick={toggleListening}
            >
              {isListening ? "Stop mic" : "Mic"}
            </button>
            <button
              className="btn btn-p"
              type="button"
              disabled={!text.trim() || isParsing}
              onClick={async () => {
                setIsParsing(true);
                setFeedback("");
                try {
                  const result = await parseDraftAction({
                    text,
                    selectedSessionId: selectedSessionId ? (selectedSessionId as never) : undefined,
                    createdBy: user?.name
                  });
                  setDraftId(String(result.draftId));
                  setFeedback("Draft ready. Review each proposed operation before applying.");
                } catch (error) {
                  setFeedback(error instanceof Error ? error.message : "Parsing failed.");
                } finally {
                  setIsParsing(false);
                }
              }}
            >
              {isParsing ? "Parsing..." : "Parse note"}
            </button>
          </div>
        </div>

        {feedback ? <div className="nbox nbox-a">{feedback}</div> : null}
        {draft?.warning ? <div className="nbox nbox-w">{draft.warning}</div> : null}

        {entriesState.length ? (
          <>
            <div className="card">
              <div className="ct">Review draft</div>
              <div className={unresolvedCount ? "nbox nbox-w" : "nbox nbox-g"}>
                {unresolvedCount
                  ? `${unresolvedCount} operation(s) still need confirmation or mapping before apply.`
                  : "All operations are resolved and ready to apply."}
              </div>
            </div>

            {entriesState.map((entry) => {
              const payload = entry.payload as Record<string, unknown>;
              const candidates = entry.candidates as UtilityCandidateMatch[];
              const status = deriveUtilityStatus(entry);
              const productCandidates = candidates.filter((candidate) => candidate.field === "productId");
              const distributorCandidates = candidates.filter((candidate) => candidate.field === "distributorId");
              const sessionCandidates = candidates.filter((candidate) => candidate.field === "sessionId");

              return (
                <div className="card" key={entry.id}>
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className="iname">{capitalize(formatOperationKind(entry.operationKind))}</div>
                      <div className="isub">{entry.summary}</div>
                    </div>
                    <span className={`badge ${status === "resolved" ? "bg" : status === "applied" ? "bb" : status === "skipped" ? "bgr" : "bw"}`}>
                      {capitalize(status)}
                    </span>
                  </div>

                  {entry.warning ? <div className="nbox nbox-w" style={{ marginTop: 10 }}>{entry.warning}</div> : null}

                  {"productId" in payload || productCandidates.length || ["create_product", "update_stock", "plan_purchase", "verify_delivery"].includes(entry.operationKind) ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Product</div>
                      <select
                        value={String(payload.productId ?? "")}
                        onChange={(event) => setPayloadField(entry.id, "productId", event.target.value)}
                      >
                        <option value="">Select product</option>
                        {productCandidates.map((candidate) => (
                          <option key={`candidate-${candidate.id}`} value={candidate.id}>
                            Suggested: {candidate.label}
                          </option>
                        ))}
                        {snapshot.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {"distributorId" in payload || distributorCandidates.length || ["create_distributor", "update_distributor", "log_enquiry", "record_purchase", "verify_delivery"].includes(entry.operationKind) ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Distributor</div>
                      <select
                        value={String(payload.distributorId ?? "")}
                        onChange={(event) => setPayloadField(entry.id, "distributorId", event.target.value)}
                      >
                        <option value="">Select distributor</option>
                        {distributorCandidates.map((candidate) => (
                          <option key={`candidate-${candidate.id}`} value={candidate.id}>
                            Suggested: {candidate.label}
                          </option>
                        ))}
                        {snapshot.distributors.map((distributor) => (
                          <option key={distributor.id} value={distributor.id}>
                            {distributor.name} ({distributor.shortCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {"sessionId" in payload || sessionCandidates.length || ["plan_purchase", "record_purchase", "verify_delivery", "update_session"].includes(entry.operationKind) ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Session</div>
                      <select
                        value={String(payload.sessionId ?? "")}
                        onChange={(event) => setPayloadField(entry.id, "sessionId", event.target.value)}
                      >
                        <option value="">Select session</option>
                        {sessionCandidates.map((candidate) => (
                          <option key={`candidate-${candidate.id}`} value={candidate.id}>
                            Suggested: {candidate.label}
                          </option>
                        ))}
                        {snapshot.sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name} · {formatDate(session.date)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {"name" in payload ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Name</div>
                      <input
                        type="text"
                        value={String(payload.name ?? "")}
                        onChange={(event) => setPayloadField(entry.id, "name", event.target.value)}
                      />
                    </div>
                  ) : null}

                  {"shortCode" in payload ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Short code</div>
                      <input
                        type="text"
                        value={String(payload.shortCode ?? "")}
                        onChange={(event) => setPayloadField(entry.id, "shortCode", event.target.value)}
                      />
                    </div>
                  ) : null}

                  {"unitLabel" in payload ? (
                    <div className="fg" style={{ marginTop: 10 }}>
                      <div className="fl">Unit label</div>
                      <select
                        value={String(payload.unitLabel ?? "bag")}
                        onChange={(event) => setPayloadField(entry.id, "unitLabel", event.target.value)}
                      >
                        {["bag", "tin", "box", "kg"].map((unitLabel) => (
                          <option key={unitLabel} value={unitLabel}>
                            {capitalize(unitLabel)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {"qtyRequired" in payload || "newQty" in payload || "quotedRatePerUnit" in payload || "openingBalance" in payload || "receivedQty" in payload ? (
                    <div className="fr2" style={{ marginTop: 10 }}>
                      {"qtyRequired" in payload ? (
                        <div className="fg">
                          <div className="fl">Qty required</div>
                          <input
                            type="number"
                            value={String(payload.qtyRequired ?? "")}
                            onChange={(event) => setPayloadField(entry.id, "qtyRequired", Number(event.target.value))}
                          />
                        </div>
                      ) : null}
                      {"newQty" in payload ? (
                        <div className="fg">
                          <div className="fl">New stock qty</div>
                          <input
                            type="number"
                            value={String(payload.newQty ?? "")}
                            onChange={(event) => setPayloadField(entry.id, "newQty", Number(event.target.value))}
                          />
                        </div>
                      ) : null}
                      {"quotedRatePerUnit" in payload ? (
                        <div className="fg">
                          <div className="fl">Quoted rate</div>
                          <input
                            type="number"
                            value={String(payload.quotedRatePerUnit ?? "")}
                            onChange={(event) =>
                              setPayloadField(entry.id, "quotedRatePerUnit", Number(event.target.value))
                            }
                          />
                        </div>
                      ) : null}
                      {"openingBalance" in payload ? (
                        <div className="fg">
                          <div className="fl">Opening balance</div>
                          <input
                            type="number"
                            value={String(payload.openingBalance ?? "")}
                            onChange={(event) =>
                              setPayloadField(entry.id, "openingBalance", Number(event.target.value))
                            }
                          />
                        </div>
                      ) : null}
                      {"receivedQty" in payload ? (
                        <div className="fg">
                          <div className="fl">Received qty</div>
                          <input
                            type="number"
                            value={String(payload.receivedQty ?? "")}
                            onChange={(event) => setPayloadField(entry.id, "receivedQty", Number(event.target.value))}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {"items" in payload && Array.isArray(payload.items) ? (
                    <div className="card" style={{ marginTop: 10, padding: 10 }}>
                      <div className="ct">Purchase items</div>
                      {(payload.items as Array<Record<string, unknown>>).map((item, index) => (
                        <div key={`${entry.id}-item-${index}`} className="ep">
                          <div className="fg" style={{ marginBottom: 8 }}>
                            <div className="fl">Product</div>
                            <select
                              value={String(item.productId ?? "")}
                              onChange={(event) =>
                                updateEntry(entry.id, (current) => {
                                  const nextItems = [...((current.payload as Record<string, unknown>).items as Array<Record<string, unknown>>)];
                                  nextItems[index] = { ...nextItems[index], productId: event.target.value };
                                  const next = { ...current, payload: { ...(current.payload as Record<string, unknown>), items: nextItems } };
                                  return { ...next, status: deriveUtilityStatus(next) };
                                })
                              }
                            >
                              <option value="">Select product</option>
                              {snapshot.products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="fr2">
                            <div className="fg">
                              <div className="fl">Units bought</div>
                              <input
                                type="number"
                                value={String(item.unitsBought ?? "")}
                                onChange={(event) =>
                                  updateEntry(entry.id, (current) => {
                                    const nextItems = [...((current.payload as Record<string, unknown>).items as Array<Record<string, unknown>>)];
                                    nextItems[index] = { ...nextItems[index], unitsBought: Number(event.target.value) };
                                    const next = { ...current, payload: { ...(current.payload as Record<string, unknown>), items: nextItems } };
                                    return { ...next, status: deriveUtilityStatus(next) };
                                  })
                                }
                              />
                            </div>
                            <div className="fg">
                              <div className="fl">Total price</div>
                              <input
                                type="number"
                                value={String(item.totalPrice ?? "")}
                                onChange={(event) =>
                                  updateEntry(entry.id, (current) => {
                                    const nextItems = [...((current.payload as Record<string, unknown>).items as Array<Record<string, unknown>>)];
                                    nextItems[index] = { ...nextItems[index], totalPrice: Number(event.target.value) };
                                    const next = { ...current, payload: { ...(current.payload as Record<string, unknown>), items: nextItems } };
                                    return { ...next, status: deriveUtilityStatus(next) };
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      className="btn btn-s btn-sm"
                      type="button"
                      onClick={() =>
                        updateEntry(entry.id, (current) => ({
                          ...current,
                          status: current.status === "skipped" ? deriveUtilityStatus(current) : "skipped"
                        }))
                      }
                    >
                      {entry.status === "skipped" ? "Undo skip" : "Skip"}
                    </button>
                    <button
                      className="btn btn-p btn-sm"
                      type="button"
                      onClick={() =>
                        updateEntry(entry.id, (current) => ({
                          ...current,
                          status: deriveUtilityStatus(current)
                        }))
                      }
                    >
                      Update review
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              className="btn btn-p"
              type="button"
              disabled={!draftId || unresolvedCount > 0}
              onClick={async () => {
                try {
                  await applyDraftMutation({
                    draftId: draftId as never,
                    entries: entriesState.map((entry) => ({
                      id: entry.id as never,
                      operationKind: entry.operationKind,
                      status: deriveUtilityStatus(entry) as never,
                      payloadJson: JSON.stringify(entry.payload)
                    }))
                  });
                  setFeedback("Changes applied to Convex successfully.");
                } catch (error) {
                  setFeedback(error instanceof Error ? error.message : "Apply failed.");
                }
              }}
            >
              Apply changes
            </button>
          </>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

type DistributorImportRow = {
  id?: string;
  name: string;
  shortCode: string;
  phone?: string;
  area?: string;
  isActive?: boolean;
};

type ProductImportRow = {
  id?: string;
  name: string;
  unitLabel: string;
  weightPerUnitKg: number;
  currentStockQty: number;
  minStockAlert: number;
  linkedDistributorShortCodes: string[];
};

type ImportPreview = {
  distributors: DistributorImportRow[];
  products: ProductImportRow[];
  warnings: string[];
  fileName: string;
};

type StockImportRow = {
  productId: string;
  name: string;
  unitLabel: Product["unitLabel"];
  currentStockQty: number;
  updatedStockQty?: number;
  minStockAlert: number;
  notes?: string;
};

type StockImportPreview = {
  rows: StockImportRow[];
  warnings: string[];
  fileName: string;
};

type RegisterImportRow = {
  sessionId: string;
  sessionName: string;
  productId: string;
  productName: string;
  unitLabel: Product["unitLabel"];
  currentStockQty: number;
  minStockAlert: number;
  suggestedQty: number;
  plannedQty: number;
  notes?: string;
};

type RegisterImportPreview = {
  rows: RegisterImportRow[];
  warnings: string[];
  fileName: string;
};

function parseBooleanCell(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "active"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "inactive"].includes(normalized)) return false;
  }
  return fallback;
}

function parseNumberCell(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function useMasterDataExcel() {
  const { snapshot } = useAppData();
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkImport = useMutation((api as any).masterData.bulkImport);

  const exportWorkbook = () => {
    const distributorRows = snapshot.distributors.map((distributor) => ({
      id: distributor.id,
      name: distributor.name,
      shortCode: distributor.shortCode,
      phone: distributor.phone ?? "",
      area: distributor.area ?? "",
      isActive: distributor.isActive ? "TRUE" : "FALSE"
    }));

    const itemRows = snapshot.products.map((product) => ({
      id: product.id,
      name: product.name,
      unitLabel: product.unitLabel,
      weightPerUnitKg: product.weightPerUnitKg,
      currentStockQty: product.currentStockQty,
      minStockAlert: product.minStockAlert,
      linkedDistributorShortCodes: product.linkedDistributorIds
        .map((id) => snapshot.distributors.find((entry) => entry.id === id)?.shortCode)
        .filter(Boolean)
        .join(", ")
    }));

    const instructionRows = [
      { note: "Edit the Distributors and Items sheets, then import the workbook back into StockTrack." },
      { note: "Keep the id column when updating existing rows. Leave id blank to create a new row." },
      { note: "For linkedDistributorShortCodes, use comma-separated distributor codes like SHA, ABC." },
      { note: "Import will upsert distributors first, then items, then refresh product-distributor links from the sheet." }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructionRows), "Instructions");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(distributorRows), "Distributors");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(itemRows), "Items");
    XLSX.writeFile(workbook, `stocktrack-master-data-${todayInputValue()}.xlsx`);
  };

  const readImportFile = async (file: File) => {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const distributorSheet = workbook.Sheets.Distributors ?? workbook.Sheets.distributors;
    const itemsSheet = workbook.Sheets.Items ?? workbook.Sheets.items;
    const warnings: string[] = [];

    const distributors = distributorSheet
      ? (XLSX.utils.sheet_to_json(distributorSheet, { defval: "" }) as Array<Record<string, unknown>>)
          .map((row, index) => {
            const mapped: DistributorImportRow = {
              id: String(row.id ?? "").trim() || undefined,
              name: String(row.name ?? "").trim(),
              shortCode: String(row.shortCode ?? "").trim(),
              phone: String(row.phone ?? "").trim() || undefined,
              area: String(row.area ?? "").trim() || undefined,
              isActive: parseBooleanCell(row.isActive, true)
            };
            if (!mapped.name || !mapped.shortCode) {
              warnings.push(`Distributor row ${index + 2} is missing name or shortCode and will be skipped.`);
            }
            return mapped;
          })
          .filter((row) => row.name && row.shortCode)
      : [];

    const products = itemsSheet
      ? (XLSX.utils.sheet_to_json(itemsSheet, { defval: "" }) as Array<Record<string, unknown>>)
          .map((row, index) => {
            const linkedCodes = String(row.linkedDistributorShortCodes ?? "")
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean);
            const mapped: ProductImportRow = {
              id: String(row.id ?? "").trim() || undefined,
              name: String(row.name ?? "").trim(),
              unitLabel: String(row.unitLabel ?? "").trim() || "bag",
              weightPerUnitKg: parseNumberCell(row.weightPerUnitKg),
              currentStockQty: parseNumberCell(row.currentStockQty),
              minStockAlert: parseNumberCell(row.minStockAlert),
              linkedDistributorShortCodes: linkedCodes
            };
            if (!mapped.name) {
              warnings.push(`Item row ${index + 2} is missing name and will be skipped.`);
            }
            return mapped;
          })
          .filter((row) => row.name)
      : [];

    const knownCodes = new Set(distributors.map((row) => row.shortCode));
    snapshot.distributors.forEach((distributor) => knownCodes.add(distributor.shortCode));
    products.forEach((product, index) => {
      const unknownCodes = product.linkedDistributorShortCodes.filter((code) => !knownCodes.has(code));
      if (unknownCodes.length) {
        warnings.push(
          `Item row ${index + 2} references unknown distributor codes: ${unknownCodes.join(", ")}. Those links will be skipped.`
        );
      }
    });

    setImportPreview({
      distributors,
      products,
      warnings,
      fileName: file.name
    });
  };

  const applyImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    try {
      await bulkImport({
        distributors: importPreview.distributors.map((row) => ({
          id: row.id ? (row.id as never) : undefined,
          name: row.name,
          shortCode: row.shortCode,
          phone: row.phone,
          area: row.area,
          isActive: row.isActive
        })),
        products: importPreview.products.map((row) => ({
          id: row.id ? (row.id as never) : undefined,
          name: row.name,
          unitLabel: row.unitLabel,
          weightPerUnitKg: row.weightPerUnitKg,
          currentStockQty: row.currentStockQty,
          minStockAlert: row.minStockAlert,
          linkedDistributorShortCodes: row.linkedDistributorShortCodes
        }))
      });
      setImportPreview(null);
    } finally {
      setIsImporting(false);
    }
  };

  return {
    importPreview,
    isImporting,
    fileInputRef,
    exportWorkbook,
    readImportFile,
    applyImport,
    clearImportPreview: () => setImportPreview(null)
  };
}

function useStockExcel() {
  const { snapshot } = useAppData();
  const [importPreview, setImportPreview] = useState<StockImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkUpdateStock = useMutation((api as any).products.bulkUpdateStock);

  const exportWorkbook = () => {
    const stockRows = snapshot.products.map((product) => ({
      productId: product.id,
      name: product.name,
      unitLabel: product.unitLabel,
      currentStockQty: product.currentStockQty,
      updatedStockQty: "",
      minStockAlert: product.minStockAlert,
      notes: ""
    }));

    const instructionRows = [
      { note: "Export the current stock, fill only updatedStockQty for the items you want to change, then import the workbook back." },
      { note: "Keep productId unchanged. Rows with blank updatedStockQty will be skipped." },
      { note: "Use notes if you want a reason stored in the stock log for that row." }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructionRows), "Instructions");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stockRows), "StockUpdate");
    XLSX.writeFile(workbook, `stocktrack-stock-update-${todayInputValue()}.xlsx`);
  };

  const readImportFile = async (file: File) => {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const stockSheet = workbook.Sheets.StockUpdate ?? workbook.Sheets.stockupdate ?? workbook.Sheets.Stock;
    const warnings: string[] = [];

    const rows: StockImportRow[] = [];
    if (stockSheet) {
      const sheetRows = XLSX.utils.sheet_to_json(stockSheet, { defval: "" }) as Array<Record<string, unknown>>;
      for (const [index, row] of sheetRows.entries()) {
        const productId = String(row.productId ?? "").trim();
        const name = String(row.name ?? "").trim();
        const product =
          snapshot.products.find((entry) => entry.id === productId) ??
          snapshot.products.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

        if (!product) {
          warnings.push(`Stock row ${index + 2} does not match any existing item and will be skipped.`);
          continue;
        }

        const updatedCell = row.updatedStockQty;
        const updatedStockQty =
          updatedCell === "" || updatedCell === null || typeof updatedCell === "undefined"
            ? undefined
            : parseNumberCell(updatedCell);

        rows.push({
          productId: product.id,
          name: product.name,
          unitLabel: product.unitLabel,
          currentStockQty: product.currentStockQty,
          updatedStockQty,
          minStockAlert: product.minStockAlert,
          notes: String(row.notes ?? "").trim() || undefined
        });
      }
    }

    const changedRows = rows.filter((row) => typeof row.updatedStockQty === "number");
    if (!changedRows.length) {
      warnings.push("No updatedStockQty values were found. Nothing will change on import.");
    }

    setImportPreview({
      rows: changedRows,
      warnings,
      fileName: file.name
    });
  };

  const applyImport = async () => {
    if (!importPreview?.rows.length) return;
    setIsImporting(true);
    try {
      await bulkUpdateStock({
        rows: importPreview.rows.map((row) => ({
          productId: row.productId as never,
          newQty: row.updatedStockQty ?? row.currentStockQty,
          notes: row.notes
        }))
      });
      setImportPreview(null);
    } finally {
      setIsImporting(false);
    }
  };

  return {
    importPreview,
    isImporting,
    fileInputRef,
    exportWorkbook,
    readImportFile,
    applyImport,
    clearImportPreview: () => setImportPreview(null)
  };
}

function useRegisterExcel() {
  const { snapshot, selectedSessionId, activeSession } = useAppData();
  const [importPreview, setImportPreview] = useState<RegisterImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceSessionPlan = useMutation((api as any).register.replaceSessionPlan);

  const exportWorkbook = () => {
    const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
    const plannedQtyByProduct = new Map(
      snapshot.registerItems
        .filter((entry) => entry.sessionId === selectedSession.id)
        .map((entry) => [entry.productId, entry.qtyRequired])
    );

    const rows = snapshot.products.map((product) => ({
      sessionId: selectedSession.id,
      sessionName: selectedSession.name,
      productId: product.id,
      productName: product.name,
      unitLabel: product.unitLabel,
      currentStockQty: product.currentStockQty,
      minStockAlert: product.minStockAlert,
      suggestedQty: Math.max(product.minStockAlert - product.currentStockQty, 0),
      plannedQty: plannedQtyByProduct.get(product.id) ?? 0,
      notes: ""
    }));

    const instructionRows = [
      { note: "Edit only the plannedQty and notes columns for the selected session." },
      { note: "Import replaces the entire plan for this selected session." },
      { note: "Rows with plannedQty 0 or blank will be removed from the session plan." }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructionRows), "Instructions");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "SessionPlan");
    XLSX.writeFile(workbook, `stocktrack-plan-${selectedSession.name.replace(/\s+/g, "-").toLowerCase()}-${todayInputValue()}.xlsx`);
  };

  const readImportFile = async (file: File) => {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const planSheet = workbook.Sheets.SessionPlan ?? workbook.Sheets.sessionplan;
    const warnings: string[] = [];
    const rows: RegisterImportRow[] = [];

    if (planSheet) {
      const sheetRows = XLSX.utils.sheet_to_json(planSheet, { defval: "" }) as Array<Record<string, unknown>>;
      for (const [index, row] of sheetRows.entries()) {
        const productId = String(row.productId ?? "").trim();
        const productName = String(row.productName ?? "").trim();
        const product =
          snapshot.products.find((entry) => entry.id === productId) ??
          snapshot.products.find((entry) => entry.name.toLowerCase() === productName.toLowerCase());

        if (!product) {
          warnings.push(`Plan row ${index + 2} does not match any item and will be skipped.`);
          continue;
        }

        rows.push({
          sessionId: selectedSessionId,
          sessionName: activeSession.name,
          productId: product.id,
          productName: product.name,
          unitLabel: product.unitLabel,
          currentStockQty: product.currentStockQty,
          minStockAlert: product.minStockAlert,
          suggestedQty: Math.max(product.minStockAlert - product.currentStockQty, 0),
          plannedQty: parseNumberCell(row.plannedQty),
          notes: String(row.notes ?? "").trim() || undefined
        });
      }
    }

    setImportPreview({
      rows,
      warnings,
      fileName: file.name
    });
  };

  const applyImport = async () => {
    if (!selectedSessionId || !importPreview) return;
    setIsImporting(true);
    try {
      await replaceSessionPlan({
        sessionId: selectedSessionId as never,
        rows: importPreview.rows
          .filter((row) => row.plannedQty > 0)
          .map((row) => ({
            productId: row.productId as never,
            qtyRequired: row.plannedQty,
            notes: row.notes
          }))
      });
      setImportPreview(null);
    } finally {
      setIsImporting(false);
    }
  };

  return {
    importPreview,
    isImporting,
    fileInputRef,
    exportWorkbook,
    readImportFile,
    applyImport,
    clearImportPreview: () => setImportPreview(null)
  };
}

function RegisterScreen() {
  const { snapshot, selectedSessionId, activeSession, addRegisterItem, updateRegisterItem, removeRegisterItem } =
    useAppData();
  const [catalogFilter, setCatalogFilter] = useState<"all" | "low" | "planned" | "not_planned">("all");
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
  const registerCards = snapshot.registerItems
    .filter((entry) => entry.sessionId === selectedSessionId)
    .map((entry) => ({
      ...entry,
      product: snapshot.products.find((product) => product.id === entry.productId)!
    }));
  const totalPlannedQty = registerCards.reduce((sum, entry) => sum + entry.qtyRequired, 0);
  const catalogProducts = snapshot.products.filter((product) => {
    const planned = registerCards.some((entry) => entry.product.id === product.id);
    if (catalogFilter === "planned") return planned;
    if (catalogFilter === "not_planned") return !planned;
    if (catalogFilter === "low") return product.currentStockQty <= product.minStockAlert;
    return true;
  });
  const productOptions: ComboOption[] = catalogProducts.map((product) => {
    const plannedEntry = registerCards.find((entry) => entry.product.id === product.id);
    const suggestedQty = Math.max(product.minStockAlert - product.currentStockQty, 0);
    return {
      id: product.id,
      label: plannedEntry
        ? `${product.name} · Planned ${plannedEntry.qtyRequired}`
        : suggestedQty > 0
          ? `${product.name} · Need ${suggestedQty}`
          : product.name,
      searchText: `${product.name} ${product.unitLabel} ${product.currentStockQty} ${product.minStockAlert} ${plannedEntry?.qtyRequired ?? ""}`
    };
  });
  const selectedProduct = snapshot.products.find((product) => product.id === selectedProductId);
  const selectedPlannedEntry = selectedProduct
    ? registerCards.find((entry) => entry.product.id === selectedProduct.id)
    : undefined;

  const comparisonRows = (productId: string) => {
    const purchaseByDist = new Map(
      snapshot.purchaseHistory
        .filter((entry) => entry.productId === productId)
        .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
        .map((entry) => [entry.distributorId, entry] as const)
    );
    const enquiryByDist = new Map(
      snapshot.enquiryHistory
        .filter((entry) => entry.productId === productId)
        .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate))
        .map((entry) => [entry.distributorId, entry] as const)
    );
    const ids = Array.from(new Set([...purchaseByDist.keys(), ...enquiryByDist.keys()]));
    return ids.map((distributorId) => ({
      distributor: snapshot.distributors.find((entry) => entry.id === distributorId)!,
      purchase: purchaseByDist.get(distributorId),
      enquiry: enquiryByDist.get(distributorId)
    }));
  };

  return (
    <ScreenFrame
      title="Purchase register"
      backTo="/"
      action={
        <>
          <Link className="ta-btn" to="/register/excel">
            Excel
          </Link>
          <Link className="ta-btn" to="/register/session">
            {selectedSession.name}
          </Link>
          <Link className="ta-btn" to="/purchase">
            Shop →
          </Link>
        </>
      }
    >
      <div className="content">
        <div className="row" style={{ border: "none", padding: 0, marginBottom: 6 }}>
          <div>
            <div className="ct" style={{ marginBottom: 4 }}>
              Session
            </div>
            <div className="iname" style={{ fontSize: 22 }}>
              {selectedSession.name}
            </div>
            <div className="isub">
              {formatDate(selectedSession.date)} · Opening {formatMoney(selectedSession.openingBalance)}
            </div>
          </div>
          <Link className="btn btn-s" to="/register/session">
            Change
          </Link>
        </div>

        <div className="card">
          <div className="ct">Plan items from current stock</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Select an item first, then set the quantity and update the plan for this session.
          </div>
          <div className="row" style={{ border: "none", padding: 0, marginBottom: 10 }}>
            <span className="lbl">
              Already planned: {registerCards.length} item{registerCards.length === 1 ? "" : "s"} · {totalPlannedQty} total units
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { key: "all", label: "All" },
              { key: "low", label: "Low stock" },
              { key: "not_planned", label: "Not planned" },
              { key: "planned", label: "Planned" }
            ].map((entry) => (
              <button
                key={entry.key}
                className={`dchip btn-sm ${catalogFilter === entry.key ? "on" : ""}`}
                style={{ width: "auto", padding: "6px 12px" }}
                type="button"
                onClick={() => setCatalogFilter(entry.key as typeof catalogFilter)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {productOptions.length ? (
            <div style={{ marginBottom: 10 }}>
              <SearchableComboBox
                label="Item"
                placeholder="Search item to plan..."
                value={selectedProduct ? productOptions.find((option) => option.id === selectedProduct.id)?.label ?? selectedProduct.name : ""}
                options={productOptions}
                onSelect={(option) => setSelectedProductId(option.id)}
              />
            </div>
          ) : (
            <div className="empty-state">No items match this filter.</div>
          )}

          {selectedProduct ? (() => {
            const product = selectedProduct;
            const plannedEntry = selectedPlannedEntry;
            const alreadyPlanned = Boolean(plannedEntry);
            const suggestedQty = Math.max(product.minStockAlert - product.currentStockQty, 0);
            const qtyValue = plannedEntry
              ? draftQty[product.id] ?? String(plannedEntry.qtyRequired)
              : draftQty[product.id] ?? (suggestedQty ? String(suggestedQty) : "");
            const hasPlannedQtyChange =
              plannedEntry && qtyValue !== String(plannedEntry.qtyRequired) && qtyValue.trim() !== "";
            return (
              <div className="card" style={{ margin: "0 0 10px 0" }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <div>
                    <div className="iname">{product.name}</div>
                    <div className="isub">
                      Current stock: {product.currentStockQty} {product.unitLabel}s · Min level {product.minStockAlert}
                    </div>
                  </div>
                  <span className={`badge ${alreadyPlanned ? "bg" : suggestedQty > 0 ? "bw" : "bb"}`}>
                    {alreadyPlanned ? "Planned" : suggestedQty > 0 ? `Need ${suggestedQty}` : "Optional"}
                  </span>
                </div>
                <div className="row" style={{ border: "none", padding: 0 }}>
                  <span className="lbl">
                    {suggestedQty > 0
                      ? `Suggested buy qty: ${suggestedQty} ${product.unitLabel}s`
                      : "Stock is okay. Add only if you still want to purchase."}
                  </span>
                </div>
                <div className="fg" style={{ marginTop: 10, marginBottom: 8 }}>
                  <div className="fl">Qty to buy ({product.unitLabel}s)</div>
                  <input
                    type="number"
                    value={qtyValue}
                    onChange={(event) => {
                      setDraftQty((current) => ({ ...current, [product.id]: event.target.value }));
                    }}
                  />
                </div>
                <div className="isub" style={{ marginBottom: 8 }}>
                  Linked distributors:{" "}
                  {product.linkedDistributorIds
                    .map((distributorId) => snapshot.distributors.find((item) => item.id === distributorId)?.shortCode)
                    .filter(Boolean)
                    .join(", ") || "None linked yet"}
                </div>
                <div className="row" style={{ border: "none", padding: 0, marginBottom: 6 }}>
                  {plannedEntry ? (
                    <>
                      <span className="lbl">Already in the plan. Change qty here, then update it explicitly.</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {hasPlannedQtyChange ? (
                          <button
                            className="btn btn-p btn-sm"
                            type="button"
                            onClick={() => {
                              updateRegisterItem(plannedEntry.id, { qtyRequired: Number(qtyValue) || 0 });
                              setDraftQty((current) => ({ ...current, [product.id]: String(Number(qtyValue) || 0) }));
                            }}
                          >
                            Update planned qty
                          </button>
                        ) : null}
                        <button className="btn btn-d btn-sm" type="button" onClick={() => removeRegisterItem(plannedEntry.id)}>
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="lbl">Set the required quantity and add it directly to the session plan.</span>
                      <button
                        className="btn btn-p btn-sm"
                        type="button"
                        onClick={() => {
                          addRegisterItem(product.id, Number(draftQty[product.id] || suggestedQty || 1));
                          setSelectedProductId(product.id);
                        }}
                      >
                        Add to plan
                      </button>
                    </>
                  )}
                </div>
                <details className="ph-box" style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                    Purchase history
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {comparisonRows(product.id).some((row) => row.purchase) ? (
                      comparisonRows(product.id)
                        .filter((row) => row.purchase)
                        .map((row) => (
                          <div className="ph-row" key={row.distributor.id}>
                            <span className="ph-dist">
                              {row.distributor.name} ({row.distributor.shortCode})
                            </span>
                            <span className="ph-rate">
                              {formatMoney(row.purchase!.ratePerUnit)}/{product.unitLabel}
                            </span>
                            <span className="ph-date">{shortDate(row.purchase!.purchaseDate)}</span>
                          </div>
                        ))
                    ) : (
                      <div className="empty-state" style={{ marginTop: 6 }}>
                        No purchase history yet.
                      </div>
                    )}
                  </div>
                </details>
                <details className="eq-box" style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                    Enquiry prices
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    {comparisonRows(product.id).some((row) => row.enquiry) ? (
                      comparisonRows(product.id)
                        .filter((row) => row.enquiry)
                        .map((row) => (
                          <div className="eq-row" key={row.distributor.id}>
                            <span className="eq-dist">
                              {row.distributor.name} ({row.distributor.shortCode})
                            </span>
                            <span className="eq-rate">
                              {formatMoney(row.enquiry!.quotedRatePerUnit)}/{product.unitLabel}
                            </span>
                          </div>
                        ))
                    ) : (
                      <div className="empty-state" style={{ marginTop: 6 }}>
                        No enquiry prices yet.
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })() : null}
        </div>

        <div className="card">
          <div className="ct">Planned items for this session</div>
          <div className="isub" style={{ marginBottom: 10 }}>
            {registerCards.length} planned item{registerCards.length === 1 ? "" : "s"}
          </div>
          {registerCards.length ? (
            registerCards.map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <div className="iname" style={{ fontSize: 16 }}>{entry.product.name}</div>
                  <div className="isub">
                    Planned: {entry.qtyRequired} {entry.product.unitLabel}s
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-s btn-sm"
                    type="button"
                    onClick={() => {
                      setSelectedProductId(entry.product.id);
                      setDraftQty((current) => ({ ...current, [entry.product.id]: String(entry.qtyRequired) }));
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn btn-d btn-sm" type="button" onClick={() => removeRegisterItem(entry.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No items are planned for this session yet.</div>
          )}
        </div>
        <Link className="btn btn-p" to="/purchase">
          Go to purchase ({registerCards.length}) →
        </Link>
      </div>
    </ScreenFrame>
  );
}

function PurchaseScreen() {
  const { snapshot, activeSession, selectedSessionId, setSelectedSessionId, purchaseDraft, savePurchaseDraft } = useAppData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [itemFilter, setItemFilter] = useState<"planned" | "linked" | "all">("planned");
  const [selectedDistributorId, setSelectedDistributorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [stage, setStage] = useState<"session" | "distributor" | "items">("session");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState<string>("");
  const [billBasicsOpen, setBillBasicsOpen] = useState(false);
  const selectedSession =
    snapshot.sessions.find((session) => session.id === selectedSessionId) ??
    (activeSession.id ? activeSession : undefined) ??
    snapshot.sessions[0];
  const [billDate, setBillDate] = useState(selectedSession?.date ?? todayInputValue());
  const purchasedByProduct = new Map<string, number>();
  snapshot.purchaseHistory
    .filter((entry) => entry.sessionId === selectedSessionId)
    .forEach((entry) => {
      purchasedByProduct.set(entry.productId, (purchasedByProduct.get(entry.productId) ?? 0) + entry.unitsBought);
    });
  const plannedItems = snapshot.registerItems
    .filter((entry) => entry.sessionId === selectedSessionId)
    .map((entry) => ({
      register: entry,
      product: snapshot.products.find((product) => product.id === entry.productId)!,
      purchasedQty: purchasedByProduct.get(entry.productId) ?? 0,
      remainingQty: Math.max(entry.qtyRequired - (purchasedByProduct.get(entry.productId) ?? 0), 0)
    }));
  const plannedProducts = plannedItems.filter((entry) => entry.remainingQty > 0).map((entry) => entry.product);
  const purchasableProducts = snapshot.products;
  const purchaseItems = selectedProductIds.flatMap((productId) => {
    const product = snapshot.products.find((entry) => entry.id === productId);
    if (!product) return [];
    const registerEntry = plannedItems.find((entry) => entry.product.id === productId);
    return [{ product, register: registerEntry?.register, remainingQty: registerEntry?.remainingQty }];
  });

  const [formState, setFormState] = useState<
    Record<
      string,
      {
        priceMode: PriceEntryMode;
        unitsBought: number;
        totalPrice: number;
        ratePerUnit: number;
        weightPerUnitKg: number;
        weightType: WeightType;
      }
    >
  >({});

  useEffect(() => {
    const initial = Object.fromEntries(
      purchaseItems.map((entry) => {
        const lastPurchase = snapshot.purchaseHistory
          .filter(
            (history) => history.productId === entry.product.id && history.distributorId === selectedDistributorId
          )
          .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
        return [
          entry.product.id,
          {
            priceMode: "total" as PriceEntryMode,
            unitsBought: entry.register?.qtyRequired ?? 1,
            totalPrice: lastPurchase ? lastPurchase.ratePerUnit * (entry.register?.qtyRequired ?? 1) : 0,
            ratePerUnit: lastPurchase?.ratePerUnit ?? 0,
            weightPerUnitKg: entry.product.weightPerUnitKg,
            weightType: "kg" as WeightType
          }
        ];
      })
    );
    setFormState((current) => ({ ...initial, ...current }));
  }, [purchaseItems.length, selectedDistributorId, selectedSessionId, snapshot.purchaseHistory]);

  useEffect(() => {
    setBillDate(selectedSession?.date ?? todayInputValue());
  }, [selectedSession?.date]);

  useEffect(() => {
    if (!purchaseDraft?.editingBillId) return;
    setSelectedSessionId(purchaseDraft.sessionId);
    setSelectedDistributorId(purchaseDraft.distributorId);
    setBillNumber(purchaseDraft.billNumber);
    setBillDate(purchaseDraft.billDate);
    setStage("items");
    setSelectedProductIds(purchaseDraft.items.map((item) => item.productId));
    setCompletedItems(
      Object.fromEntries(purchaseDraft.items.map((item) => [item.productId, true]))
    );
    setActiveProductId(null);
    setSelectedCatalogProductId("");
    setFormState(
      Object.fromEntries(
        purchaseDraft.items.map((item) => [
          item.productId,
          {
            priceMode: item.priceMode,
            unitsBought: item.unitsBought,
            totalPrice: item.totalPrice,
            ratePerUnit: item.ratePerUnit,
            weightPerUnitKg: item.weightPerUnitKg,
            weightType: item.weightType
          }
        ])
      )
    );
  }, [purchaseDraft, setSelectedSessionId]);

  const filteredDistributors = snapshot.distributors.filter((entry) =>
    entry.name.toLowerCase().includes(query.toLowerCase())
  );

  const selectedDistributor = snapshot.distributors.find((entry) => entry.id === selectedDistributorId);
  const linkedProducts = selectedDistributor
    ? snapshot.products.filter((product) => product.linkedDistributorIds.includes(selectedDistributor.id))
    : [];
  const filteredCatalog = (
    itemFilter === "planned"
      ? plannedProducts
      : itemFilter === "linked"
        ? linkedProducts
        : purchasableProducts
  ).sort((a, b) => {
    const aSelected = selectedProductIds.includes(a.id) ? 1 : 0;
    const bSelected = selectedProductIds.includes(b.id) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return a.name.localeCompare(b.name);
  });
  const allPurchaseItemsCompleted =
    purchaseItems.length > 0 && purchaseItems.every((entry) => completedItems[entry.product.id]);
  const purchaseNetTotal = purchaseItems.reduce((sum, entry) => {
    const state = formState[entry.product.id];
    if (!state) return sum;
    return sum + (state.priceMode === "unit" ? state.ratePerUnit * state.unitsBought : state.totalPrice);
  }, 0);
  const itemOptions: ComboOption[] = filteredCatalog.map((product) => {
    const plannedEntry = plannedItems.find((entry) => entry.product.id === product.id);
    const alreadyAdded = selectedProductIds.includes(product.id);
    return {
      id: product.id,
      label: product.name,
      searchText: `${product.name} ${product.unitLabel} ${plannedEntry?.remainingQty ?? ""} ${alreadyAdded ? "added" : ""}`
    };
  });
  const distributorOptions: ComboOption[] = filteredDistributors.map((entry) => ({
    id: entry.id,
    label: `${entry.name} (${entry.shortCode})`,
    searchText: `${entry.name} ${entry.shortCode} ${entry.area ?? ""} ${entry.phone ?? ""}`
  }));
  const comparisonRows = (productId: string) => {
    const purchaseRows = snapshot.purchaseHistory
      .filter((entry) => entry.productId === productId)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
    const enquiryRows = snapshot.enquiryHistory
      .filter((entry) => entry.productId === productId)
      .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate));
    return {
      purchases: purchaseRows.map((entry) => ({
        distributor: snapshot.distributors.find((item) => item.id === entry.distributorId),
        entry
      })),
      enquiries: enquiryRows.map((entry) => ({
        distributor: snapshot.distributors.find((item) => item.id === entry.distributorId),
        entry
      }))
    };
  };

  return (
    <ScreenFrame title="Purchase at shop" backTo="/">
      <div className="content">
        {stage === "session" ? (
          <>
            <SessionPicker title="Purchase session" subtitle="Choose the session first, then continue to distributor." compact />
            <div className="nbox nbox-b" style={{ marginTop: 10 }}>
              {selectedSession
                ? `${selectedSession.name} · ${formatDate(selectedSession.date)} · ${plannedItems.length} planned item${plannedItems.length === 1 ? "" : "s"}`
                : `${plannedItems.length} planned item${plannedItems.length === 1 ? "" : "s"}`}
            </div>
            <button className="btn btn-s" type="button" onClick={() => setStage("session")} disabled>
              Session selected
            </button>
            <button className="btn btn-p" type="button" onClick={() => setStage("distributor")}>
              Continue to distributor →
            </button>
          </>
        ) : null}

        {stage === "distributor" ? (
          <>
            <div className="card">
              <div className="ct">Select distributor</div>
              <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
                {selectedSession.name} · {plannedItems.length} planned item{plannedItems.length === 1 ? "" : "s"}
              </div>
              <SearchableComboBox
                label="Distributor"
                placeholder="Search distributor..."
                value={selectedDistributor ? `${selectedDistributor.name} (${selectedDistributor.shortCode})` : ""}
                options={distributorOptions}
                onSelect={(option) => {
                  const distributor = snapshot.distributors.find((entry) => entry.id === option.id);
                  if (!distributor) return;
                  setQuery(distributor.name);
                  setSelectedDistributorId(distributor.id);
                  setBillNumber(`${distributor.shortCode.toUpperCase()}-${Date.now().toString().slice(-4)}`);
                  setSelectedProductIds([]);
                  setCompletedItems({});
                  setActiveProductId(null);
                  setSelectedCatalogProductId("");
                  setItemFilter("planned");
                }}
              />
              {!distributorOptions.length ? <div className="empty-state" style={{ marginTop: 10 }}>No distributor matches this search.</div> : null}
            </div>
            <button className="btn btn-s" type="button" onClick={() => setStage("session")}>
              ← Back to session
            </button>
            <button
              className="btn btn-p"
              type="button"
              onClick={() => {
                if (!selectedDistributorId) return;
                setStage("items");
              }}
            >
              Continue to items →
            </button>
          </>
        ) : null}

        {stage === "items" && selectedDistributor ? (
          <>
            <div className="card">
              <button
                className="row"
                type="button"
                style={{ width: "100%", background: "transparent", border: "none", padding: 0 }}
                onClick={() => setBillBasicsOpen((current) => !current)}
              >
                <div>
                  <div className="ct">Bill basics</div>
                  <div className="isub">
                    {selectedSession.name} · {selectedDistributor.name}
                  </div>
                </div>
                <span className="lbl">{billBasicsOpen ? "Hide" : "Show"}</span>
              </button>
              {billBasicsOpen ? (
                <>
                  <div className="row" style={{ border: "none", padding: 0, margin: "10px 0" }}>
                    <span className="lbl">
                      Session has {sessionBills(snapshot, selectedSession.id).length} saved bill{sessionBills(snapshot, selectedSession.id).length === 1 ? "" : "s"}
                    </span>
                    <Link className="btn btn-s btn-sm" to="/bills">
                      View bills
                    </Link>
                  </div>
                  <div className="fg">
                    <div className="fl">Bill date</div>
                    <input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
            <div className="card">
              <div className="ct">Add purchased items</div>
              {purchaseItems.length ? (
                <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
                  {purchaseItems.length} item{purchaseItems.length === 1 ? "" : "s"} added ·{" "}
                  {purchaseItems.filter((entry) => completedItems[entry.product.id]).length} done · Net {formatMoney(purchaseNetTotal)}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {[
                  { key: "planned", label: "Planned" },
                  { key: "linked", label: "Distributor items" },
                  { key: "all", label: "All items" }
                ].map((entry) => (
                  <button
                    key={entry.key}
                    className={`dchip btn-sm ${itemFilter === entry.key ? "on" : ""}`}
                    style={{ width: "auto", padding: "6px 12px" }}
                    type="button"
                    onClick={() => setItemFilter(entry.key as typeof itemFilter)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <SearchableComboBox
                  label="Add item"
                  placeholder="Search item to add..."
                  value={selectedCatalogProductId ? snapshot.products.find((product) => product.id === selectedCatalogProductId)?.name ?? "" : ""}
                  options={itemOptions}
                  onSelect={(option) => {
                    setSelectedCatalogProductId(option.id);
                    setSelectedProductIds((current) =>
                      current.includes(option.id)
                        ? [option.id, ...current.filter((productId) => productId !== option.id)]
                        : [option.id, ...current]
                    );
                    setActiveProductId(option.id);
                    setCompletedItems((current) => ({ ...current, [option.id]: false }));
                  }}
                />
              </div>
              {purchaseItems.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {purchaseItems.map((cartEntry) => {
                    const product = cartEntry.product;
                    const plannedEntry = plannedItems.find((entry) => entry.product.id === product.id);
                    const alreadyAdded = selectedProductIds.includes(product.id);
                    const state =
                      formState[product.id] ?? {
                        priceMode: "total" as PriceEntryMode,
                        unitsBought: cartEntry.remainingQty ?? cartEntry.register?.qtyRequired ?? plannedEntry?.remainingQty ?? 1,
                        totalPrice: 0,
                        ratePerUnit: 0,
                        weightPerUnitKg: product.weightPerUnitKg,
                        weightType: "kg" as WeightType
                      };
                    const comparison = comparisonRows(product.id);
                    const computedRatePerUnit =
                      state.priceMode === "unit" ? state.ratePerUnit : state.unitsBought ? state.totalPrice / state.unitsBought : 0;
                    const computedRatePerKg =
                      state.weightPerUnitKg && computedRatePerUnit ? computedRatePerUnit / state.weightPerUnitKg : 0;
                    const isItemReady =
                      state.unitsBought > 0 &&
                      (state.priceMode === "total" ? state.totalPrice > 0 : state.ratePerUnit > 0) &&
                      state.weightPerUnitKg > 0;
                    const isCompleted = completedItems[product.id] ?? false;
                    const isExpanded = alreadyAdded && (activeProductId === product.id || !isCompleted);
                    return (
                      <div className="irow" key={product.id}>
                        <div className="row" style={{ padding: "0 0 8px" }}>
                          <div>
                            <div className="iname" style={{ fontSize: 18 }}>
                              {product.name}
                            </div>
                            <div className="isub">
                              {plannedEntry?.remainingQty
                                ? `${plannedEntry.remainingQty} left from plan`
                                : alreadyAdded
                                  ? "Added to this bill"
                                  : "Add as extra item"}
                            </div>
                            <div className="isub">Current stock: {product.currentStockQty} {product.unitLabel}s</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {alreadyAdded ? (
                              <>
                                <button
                                  className="btn btn-s btn-sm"
                                  type="button"
                                  onClick={() => setActiveProductId((current) => (current === product.id ? null : product.id))}
                                >
                                  {isExpanded ? "Hide" : isCompleted ? "Edit" : "Open"}
                                </button>
                                <button
                                  className="btn btn-d btn-sm"
                                  type="button"
                                  onClick={() => {
                                    setSelectedProductIds((current) => current.filter((productId) => productId !== product.id));
                                    setCompletedItems((current) => ({ ...current, [product.id]: false }));
                                    setActiveProductId((current) => (current === product.id ? null : current));
                                    if (selectedCatalogProductId === product.id) {
                                      setSelectedCatalogProductId("");
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {alreadyAdded && isCompleted && !isExpanded ? (
                          <div className="nbox nbox-b" style={{ marginBottom: 8 }}>
                            {state.unitsBought} {product.unitLabel}s ·{" "}
                            {formatMoney(state.priceMode === "unit" ? state.ratePerUnit * state.unitsBought : state.totalPrice)} total ·{" "}
                            {computedRatePerKg ? `${formatMoney(computedRatePerKg)}/kg` : "rate pending"}
                          </div>
                        ) : null}
                        {alreadyAdded && isExpanded ? (
                          <>
                            <div className="fg" style={{ marginBottom: 8 }}>
                              <div className="fl">Price entry</div>
                              <div className="tog">
                                {(["total", "unit"] as PriceEntryMode[]).map((mode) => (
                                  <button
                                    key={mode}
                                    className={state.priceMode === mode ? "on" : ""}
                                    type="button"
                                    onClick={() =>
                                      setFormState((current) => ({
                                        ...current,
                                        [product.id]: {
                                          ...state,
                                          priceMode: mode
                                        }
                                      }))
                                    }
                                  >
                                    {mode === "total" ? "Total" : "Per unit"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="fr2" style={{ marginBottom: 8 }}>
                              <div className="fg">
                                <div className="fl">Units bought</div>
                                <input
                                  type="number"
                                  value={state.unitsBought || ""}
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      [product.id]: {
                                        ...state,
                                        unitsBought: Number(event.target.value)
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="fg">
                                <div className="fl">{state.priceMode === "total" ? "Total price (₹)" : "Rate per unit (₹)"}</div>
                                <input
                                  type="number"
                                  value={state.priceMode === "total" ? state.totalPrice || "" : state.ratePerUnit || ""}
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      [product.id]: {
                                        ...state,
                                        [state.priceMode === "total" ? "totalPrice" : "ratePerUnit"]: Number(event.target.value)
                                      }
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="fr2" style={{ marginBottom: 8 }}>
                              <div className="fg">
                                <div className="fl">Weight per unit</div>
                                <input
                                  type="number"
                                  value={state.weightPerUnitKg || ""}
                                  onChange={(event) =>
                                    setFormState((current) => ({
                                      ...current,
                                      [product.id]: {
                                        ...state,
                                        weightPerUnitKg: Number(event.target.value)
                                      }
                                    }))
                                  }
                                />
                              </div>
                              <div className="fg">
                                <div className="fl">Rate per kg/box</div>
                                <input className="auto-f" readOnly value={computedRatePerKg ? formatMoney(computedRatePerKg) : ""} />
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <button
                                className="btn btn-s btn-sm"
                                type="button"
                                disabled={!isItemReady}
                                onClick={() => {
                                  setCompletedItems((current) => ({
                                    ...current,
                                    [product.id]: true
                                  }));
                                  setActiveProductId((current) => (current === product.id ? null : current));
                                }}
                              >
                                Done
                              </button>
                            </div>
                            <details className="ph-box" style={{ marginTop: 10 }}>
                              <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                                Purchase history
                              </summary>
                              <div style={{ marginTop: 8 }}>
                                {comparison.purchases.length ? (
                                  comparison.purchases.map((row, index) => (
                                    <div className="ph-row" key={`${product.id}-purchase-${index}`}>
                                      <span className="ph-dist">
                                        {row.distributor?.name} ({row.distributor?.shortCode})
                                      </span>
                                      <span className="ph-rate">
                                        {formatMoney(row.entry.ratePerUnit)}/{product.unitLabel}
                                      </span>
                                      <span className="ph-date">{shortDate(row.entry.purchaseDate)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="empty-state" style={{ marginTop: 6 }}>
                                    No purchase history yet.
                                  </div>
                                )}
                              </div>
                            </details>
                            <details className="eq-box" style={{ marginTop: 10 }}>
                              <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                                Enquiry prices
                              </summary>
                              <div style={{ marginTop: 8 }}>
                                {comparison.enquiries.length ? (
                                  comparison.enquiries.map((row, index) => (
                                    <div className="eq-row" key={`${product.id}-enquiry-${index}`}>
                                      <span className="eq-dist">
                                        {row.distributor?.name} ({row.distributor?.shortCode})
                                      </span>
                                      <span className="eq-rate">
                                        {formatMoney(row.entry.quotedRatePerUnit)}/{product.unitLabel}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="empty-state" style={{ marginTop: 6 }}>
                                    No enquiry prices yet.
                                  </div>
                                )}
                              </div>
                            </details>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ marginBottom: 12 }}>
                  No items added yet. Search above and add what you purchased.
                </div>
              )}
            </div>
            <button className="btn btn-s" type="button" onClick={() => setStage("distributor")}>
              ← Back to distributor
            </button>
          </>
        ) : null}
        {stage === "items" ? (
          <button
            className="btn btn-p"
            type="button"
            disabled={!allPurchaseItemsCompleted}
            onClick={() => {
              if (!selectedDistributor) return;
              savePurchaseDraft({
                sessionId: selectedSessionId,
                distributorId: selectedDistributorId,
                billNumber: billNumber || `${selectedDistributor.shortCode.toUpperCase()}-${Date.now().toString().slice(-4)}`,
                billDate,
                items: purchaseItems.map((entry) => {
                  const state =
                    formState[entry.product.id] ?? {
                      priceMode: "total" as PriceEntryMode,
                      unitsBought: entry.register?.qtyRequired ?? 1,
                      totalPrice: 0,
                      ratePerUnit: 0,
                      weightPerUnitKg: entry.product.weightPerUnitKg,
                      weightType: "kg" as WeightType
                    };
                  const totalPrice = state.priceMode === "unit" ? state.ratePerUnit * state.unitsBought : state.totalPrice;
                  return {
                    productId: entry.product.id,
                    unitsBought: state.unitsBought,
                    totalPrice,
                    ratePerUnit: state.priceMode === "unit" ? state.ratePerUnit : state.unitsBought ? totalPrice / state.unitsBought : 0,
                    weightPerUnitKg: state.weightPerUnitKg,
                    weightType: state.weightType,
                    priceMode: state.priceMode
                  };
                })
              });
              navigate("/bag-fill");
            }}
          >
            {allPurchaseItemsCompleted ? `Continue to save bill (${formatMoney(purchaseNetTotal)}) →` : "Complete all added items first"}
          </button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function BagFillScreen() {
  const { purchaseDraft, snapshot, generateGatePassFromDraft } = useAppData();
  const navigate = useNavigate();
  const [smallBagCount, setSmallBagCount] = useState(purchaseDraft?.smallBagCount ?? 0);
  const [bigBagCount, setBigBagCount] = useState(purchaseDraft?.bigBagCount ?? 0);
  const [note, setNote] = useState(purchaseDraft?.courierNote ?? "Handle oil tins carefully...");

  if (!purchaseDraft) {
    return (
      <ScreenFrame title="Save bill" backTo="/purchase">
        <div className="content">
          <div className="nbox nbox-w">Save a bill from the Purchase screen first. The bill-save flow uses that draft.</div>
          <Link className="btn btn-p" to="/purchase">
            Back to purchase →
          </Link>
        </div>
      </ScreenFrame>
    );
  }

  const distributor = snapshot.distributors.find((entry) => entry.id === purchaseDraft.distributorId)!;
  const autoTotal = smallBagCount * 11 + bigBagCount * 21;
  const distributorBillTotal = purchaseDraft.items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <ScreenFrame title="Save bill" backTo="/purchase">
      <div className="content">
        <div className="nbox nbox-g" style={{ fontFamily: "Sora, sans-serif", fontWeight: 600 }}>
          {distributor.name} · Bill {purchaseDraft.billNumber}
          <br />
          <span style={{ fontWeight: 400, fontSize: 12 }}>
            {purchaseDraft.items
              .map((item) => {
                const product = snapshot.products.find((entry) => entry.id === item.productId);
                return `${product?.name} (${item.unitsBought} ${product?.unitLabel}s)`;
              })
              .join(" + ")}
          </span>
        </div>
        <div className="card">
          <div className="ct">Bill summary</div>
          {purchaseDraft.items.map((item) => {
            const product = snapshot.products.find((entry) => entry.id === item.productId);
            return (
              <div className="row" key={item.productId}>
                <div>
                  <div className="lbl">{product?.name}</div>
                  <div className="isub">
                    Qty: {item.unitsBought} {product?.unitLabel}s
                  </div>
                </div>
                <span className="val">{formatMoney(item.totalPrice)}</span>
              </div>
            );
          })}
          <div className="divider" />
          <div className="row">
            <span className="lbl">Total cost from {distributor.name}</span>
            <span className="val">{formatMoney(distributorBillTotal)}</span>
          </div>
        </div>
        <div className="card">
          <div className="ct">Bag counts</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Enter only the number of small and big bags. Courier is fixed automatically.
          </div>
          <div className="fr2" style={{ marginBottom: 8 }}>
            <div className="fg">
              <div className="fl">Small bags</div>
              <input type="number" min={0} value={smallBagCount || ""} onChange={(event) => setSmallBagCount(Number(event.target.value) || 0)} />
            </div>
            <div className="fg">
              <div className="fl">Big bags</div>
              <input type="number" min={0} value={bigBagCount || ""} onChange={(event) => setBigBagCount(Number(event.target.value) || 0)} />
            </div>
          </div>
          <div className="row">
            <span className="lbl">Courier rule</span>
            <span className="val">Small ₹11 · Big ₹21</span>
          </div>
          <div className="row">
            <span className="lbl">Auto courier total</span>
            <span className="val">{formatMoney(autoTotal)}</span>
          </div>
          <div className="fg">
            <div className="fl">Note to courier</div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-p"
          type="button"
          onClick={async () => {
            const gatePassId = await generateGatePassFromDraft({
              bags: [],
              courierFeePerBag: undefined,
              courierFeeOverride: autoTotal,
              courierNote: note,
              smallBagCount,
              bigBagCount
            });
            if (gatePassId) navigate(`/gate-passes/${gatePassId}`);
          }}
        >
          Save bill →
        </button>
      </div>
    </ScreenFrame>
  );
}

function GatePassViewScreen() {
  const { gatePassId } = useParams();
  const { snapshot, beginBillEdit } = useAppData();
  const navigate = useNavigate();
  const gatePass = snapshot.gatePasses.find((entry) => entry.id === gatePassId) ?? snapshot.gatePasses[0];
  if (!gatePass) {
    return (
      <ScreenFrame title="Gate pass" backTo="/gate-passes">
        <div className="empty-state">No gate pass found yet.</div>
      </ScreenFrame>
    );
  }
  const bill = snapshot.bills.find((entry) => entry.id === gatePass.billId)!;
  const distributor = snapshot.distributors.find((entry) => entry.id === gatePass.distributorId)!;
  const session = snapshot.sessions.find((entry) => entry.id === gatePass.sessionId) ?? snapshot.sessions[0];

  const handleExport = () => {
    exportGatePassPdf({
      gatePass,
      bill,
      session,
      distributor,
      products: snapshot.products
    });
  };

  return (
    <ScreenFrame
      title="Gate pass"
      backTo="/gate-passes"
      action={
        <>
          <button
            className="ta-btn"
            type="button"
            onClick={() => {
              beginBillEdit(bill.id);
              navigate("/purchase");
            }}
          >
            Edit bill
          </button>
          <button className="ta-btn" type="button" onClick={handleExport}>
            Share
          </button>
        </>
      }
    >
      <div className="content">
        <div className="gp-head">
          <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            Gate pass · {session.name}
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-.3px" }}>
            {distributor.name}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 5 }}>
            Bill: {bill.billNumber} · {formatDate(bill.billDate)}
          </div>
        </div>
        <div className="card">
          <div className="ct">Bags to collect</div>
          <table className="gp-table">
            <thead>
              <tr>
                <th>Bag</th>
                <th>Contents</th>
              </tr>
            </thead>
            <tbody>
              {gatePass.bags.map((bag) => (
                <tr key={bag.id}>
                  <td>{bag.bagNumber}</td>
                  <td>
                    {bag.isBundled ? <span className="bundle-tag">Bundle</span> : null}{" "}
                    {bag.items
                      .map((item) => {
                        const product = snapshot.products.find((entry) => entry.id === item.productId)!;
                        return `${product.name} × ${item.unitsInBag}`;
                      })
                      .join(" + ")}
                  </td>
                </tr>
              ))}
              <tr className="gp-tot">
                <td colSpan={2}>
                  <strong>
                    Total — {gatePassBagCount(gatePass)} bags
                    {typeof gatePass.smallBagCount === "number" || typeof gatePass.bigBagCount === "number"
                      ? ` (${gatePass.smallBagCount ?? 0} small, ${gatePass.bigBagCount ?? 0} big)`
                      : ""}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="ct">Item price reference</div>
          <table className="gp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Units</th>
                <th>Total</th>
                <th>Rate/kg</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item) => {
                const product = snapshot.products.find((entry) => entry.id === item.productId)!;
                return (
                  <tr key={item.id}>
                    <td>{product.name}</td>
                    <td>
                      {item.unitsBought} {product.unitLabel}s
                    </td>
                    <td>{formatMoney(item.totalPrice)}</td>
                    <td>{formatMoney(item.ratePerKg)}/kg</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="ct">Courier fee</div>
          <div className="row">
            <span className="lbl">Bags</span>
            <span className="val">
              {gatePassBagCount(gatePass)}
              {typeof gatePass.smallBagCount === "number" || typeof gatePass.bigBagCount === "number"
                ? ` (${gatePass.smallBagCount ?? 0} small, ${gatePass.bigBagCount ?? 0} big)`
                : ""}
            </span>
          </div>
          <div className="row">
            <span className="lbl">Rate</span>
            <span className="val">
              {typeof gatePass.courierFeePerBag === "number"
                ? `${formatMoney(gatePass.courierFeePerBag)}/bag`
                : "Auto by bag weight"}
            </span>
          </div>
          <div className="row">
            <span className="lbl">Total</span>
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, color: "var(--g)", fontSize: 16 }}>
              {formatMoney(gatePass.courierFeeTotal)}
            </span>
          </div>
        </div>
        <button className="btn btn-p" type="button" onClick={handleExport}>
          Download PDF
        </button>
        <Link className="btn btn-s" to="/purchase">
          Purchase from another shop
        </Link>
        <Link className="btn btn-s" to="/">
          Back to home
        </Link>
        <Link className="btn btn-s" to="/gate-passes">
          All gate passes
        </Link>
      </div>
    </ScreenFrame>
  );
}

function BillsScreen() {
  const { snapshot, activeSession, beginBillEdit } = useAppData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const bills = sessionBills(snapshot, activeSession.id).filter((bill) => {
    const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId);
    return `${bill.billNumber} ${bill.billDate} ${distributor?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <ScreenFrame title="Session bills" backTo="/purchase">
      <div className="sw">
        <input
          type="text"
          placeholder="Search bills..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="content">
        <SessionPicker title="Bills session" subtitle="Pick the session whose bills you want to review." compact />
        <div className="card">
          <div className="ct">Saved bills</div>
          <div className="isub" style={{ marginBottom: 10 }}>
            {activeSession.name} · {bills.length} bill{bills.length === 1 ? "" : "s"}
          </div>
          {bills.length ? (
            bills.map((bill) => {
              const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId);
              return (
                <div className="card" key={bill.id} style={{ margin: "0 0 10px 0", cursor: "default" }}>
                  <div className="row">
                    <div>
                      <div className="iname">{distributor?.name}</div>
                      <div className="isub">Bill {bill.billNumber} · {formatDate(bill.billDate)}</div>
                    </div>
                    <span className="badge bg">{formatMoney(bill.totalAmount)}</span>
                  </div>
                  <div className="isub" style={{ marginTop: 8 }}>
                    {bill.items
                      .map((item) => {
                        const product = snapshot.products.find((entry) => entry.id === item.productId);
                        return `${product?.name} (${item.unitsBought})`;
                      })
                      .join(", ")}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-s btn-sm"
                      type="button"
                      onClick={() => {
                        beginBillEdit(bill.id);
                        navigate("/purchase");
                      }}
                    >
                      Edit bill
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">No saved bills for this session yet.</div>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}

function GatePassesScreen() {
  const { snapshot, activeSession } = useAppData();
  const [query, setQuery] = useState("");
  const sessions = snapshot.sessions.map((session) => {
    const gatePasses = snapshot.gatePasses.filter((gatePass) => gatePass.sessionId === session.id);
    const pendingBills = snapshot.bills.filter(
      (bill) => bill.sessionId === session.id && !snapshot.gatePasses.some((gatePass) => gatePass.billId === bill.id)
    );
    return { session, gatePasses, pendingBills };
  });

  return (
    <ScreenFrame title="Gate passes" backTo="/" action={<Link className="ta-btn" to="/summary">Summary</Link>}>
      <div className="sw">
        <input
          type="text"
          placeholder="Search gate passes..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="content">
        <div className="sbar">
          <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 700 }}>{activeSession.name}</span> ·{" "}
          <span style={{ fontSize: 12, color: "var(--g)" }}>{sessionGatePasses(snapshot, activeSession.id).length} gate passes</span>
        </div>
        {sessions.map(({ session, gatePasses, pendingBills }) => {
          const visibleGatePasses = gatePasses.filter((gatePass) => {
            const bill = snapshot.bills.find((entry) => entry.id === gatePass.billId);
            const distributor = snapshot.distributors.find((entry) => entry.id === gatePass.distributorId);
            const haystack = `${session.name} ${bill?.billNumber ?? ""} ${distributor?.name ?? ""}`.toLowerCase();
            return haystack.includes(query.toLowerCase());
          });
          const visiblePending = pendingBills.filter((bill) => {
            const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId);
            return `${session.name} ${bill.billNumber} ${distributor?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
          });

          if (!visibleGatePasses.length && !visiblePending.length) return null;
          return (
            <div key={session.id} className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <div>
                  <div className="iname">{session.name}</div>
                  <div className="isub">{formatDate(session.date)}</div>
                </div>
                <span className="badge bg">{visibleGatePasses.length} done</span>
              </div>
              <div className="ghost-list">
                {visibleGatePasses.map((gatePass) => {
                  const bill = snapshot.bills.find((entry) => entry.id === gatePass.billId)!;
                  const distributor = snapshot.distributors.find((entry) => entry.id === gatePass.distributorId)!;
                  return (
                    <Link key={gatePass.id} className="card" style={{ cursor: "pointer" }} to={`/gate-passes/${gatePass.id}`}>
                      <div className="row">
                        <div>
                          <div className="iname">{distributor.name}</div>
                          <div className="isub">Bill: {bill.billNumber}</div>
                        </div>
                        <span className="badge bg">Done</span>
                      </div>
                      <div style={{ marginTop: 8 }} className="row">
                        <span className="lbl">
                          {gatePassBagCount(gatePass)} bags · Fee {formatMoney(gatePass.courierFeeTotal)}
                        </span>
                        <span style={{ color: "var(--g)", fontSize: 13, fontWeight: 700 }}>
                          {formatMoney(bill.totalAmount)} ›
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {visiblePending.map((bill) => {
                  const distributor = snapshot.distributors.find((entry) => entry.id === bill.distributorId)!;
                  return (
                    <div className="card" key={bill.id}>
                      <div className="row">
                        <div>
                          <div className="iname">{distributor.name}</div>
                          <div className="isub">Bill: {bill.billNumber}</div>
                        </div>
                        <span className="badge bw">Save bill</span>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Link className="btn btn-w btn-sm" to="/bag-fill">
                          Save bill details →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Link className="btn btn-p" to="/summary">
          View session summary →
        </Link>
      </div>
    </ScreenFrame>
  );
}

function SummaryScreen() {
  const { snapshot, activeSession, updateCourierRate } = useAppData();
  const [query, setQuery] = useState("");
  const sessionBills = snapshot.bills.filter((bill) => bill.sessionId === activeSession.id);
  const sessionGatePasses = snapshot.gatePasses.filter((gatePass) => gatePass.sessionId === activeSession.id);
  const totalBags = sessionGatePasses.reduce((sum, gatePass) => sum + gatePassBagCount(gatePass), 0);
  const totalSpend = sessionBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalCourier = sessionGatePasses.reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);
  const expected = activeSession.openingBalance - totalSpend - totalCourier;
  const purchasedRows = sessionBills
    .flatMap((bill) =>
      bill.items.map((item) => ({
        key: `${bill.id}-${item.id}`,
        bill,
        item,
        product: snapshot.products.find((entry) => entry.id === item.productId),
        distributor: snapshot.distributors.find((entry) => entry.id === bill.distributorId)
      }))
    )
    .filter((row) => `${row.product?.name ?? ""} ${row.distributor?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScreenFrame
      title="Session summary"
      backTo="/"
      action={
        <>
          <button
            className="ta-btn"
            type="button"
            onClick={() =>
              exportPurchasedItemsPdf({
                session: activeSession,
                bills: sessionBills,
                distributors: snapshot.distributors,
                products: snapshot.products
              })
            }
          >
            Items PDF
          </button>
          <button
            className="ta-btn"
            type="button"
            onClick={() =>
              exportSessionSummaryPdf({
                session: activeSession,
                gatePasses: sessionGatePasses,
                bills: sessionBills,
                distributors: snapshot.distributors
              })
            }
          >
            PDF
          </button>
        </>
      }
    >
      <div className="content">
        <SessionPicker title="Summary session" subtitle="Pick the session you want to review." compact />
        <Link className="btn btn-s" to="/bills">
          View session bills →
        </Link>
        <div className="card">
          <div className="ct">Overview</div>
          <div className="isub" style={{ marginBottom: 6 }}>
            {activeSession.name} · {formatDate(activeSession.date)}
          </div>
          <div className="row">
            <span className="lbl">Gate passes</span>
            <span className="val">{sessionGatePasses.length}</span>
          </div>
          <div className="row">
            <span className="lbl">Total bags</span>
            <span className="val-big">{totalBags} bags</span>
          </div>
          <div className="row">
            <span className="lbl">Total spend</span>
            <span className="val">{formatMoney(totalSpend)}</span>
          </div>
        </div>
        <div className={typeof activeSession.closingBalance === "number" && activeSession.closingBalance < expected ? "bal-err" : "bal-ok"}>
          <div className="ct" style={{ color: "var(--g)" }}>
            Balance validation
          </div>
          <div className="bal-row">
            <span className="lbl">Opening balance</span>
            <span className="val">{formatMoney(activeSession.openingBalance)}</span>
          </div>
          <div className="bal-row">
            <span className="lbl" style={{ color: "var(--r)" }}>
              − Bills spent
            </span>
            <span style={{ color: "var(--r)", fontWeight: 600 }}>{formatMoney(totalSpend)}</span>
          </div>
          <div className="bal-row">
            <span className="lbl" style={{ color: "var(--r)" }}>
              − Courier paid
            </span>
            <span style={{ color: "var(--r)", fontWeight: 600 }}>{formatMoney(totalCourier)}</span>
          </div>
          <div className="bal-div" />
          <div className="bal-row">
            <span style={{ fontWeight: 700 }}>Expected in hand</span>
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, color: "var(--g)" }}>{formatMoney(expected)}</span>
          </div>
          <div className="bal-row">
            <span className="lbl">Actual closing balance</span>
            <span style={{ color: "var(--muted)" }}>
              {typeof activeSession.closingBalance === "number"
                ? formatMoney(activeSession.closingBalance)
                : "Not entered yet"}
            </span>
          </div>
        </div>
        <div className="card" style={{ background: "var(--gl)", borderColor: "var(--gb)" }}>
          <div className="ct" style={{ color: "var(--g)" }}>
            Courier fee — per gate pass
          </div>
          <div className="nbox nbox-b" style={{ marginBottom: 10, fontSize: 11 }}>
            Rate per bag you pay the courier person per distributor pickup.
          </div>
          {sessionGatePasses.map((gatePass) => {
            const distributor = snapshot.distributors.find((entry) => entry.id === gatePass.distributorId)!;
            return (
              <div className="cour-row" key={gatePass.id}>
                <span style={{ flex: 1, fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                  {distributor.name} ({gatePassBagCount(gatePass)} bags)
                </span>
                <span className="lbl">{typeof gatePass.courierFeePerBag === "number" ? "₹/bag" : "Auto"}</span>
                <input
                  type="number"
                  value={gatePass.courierFeePerBag ?? ""}
                  placeholder="Auto"
                  onChange={(event) => updateCourierRate(gatePass.id, Number(event.target.value))}
                />
                <span style={{ minWidth: 50, textAlign: "right", fontWeight: 800, color: "var(--g)" }}>
                  {formatMoney(gatePass.courierFeeTotal)}
                </span>
              </div>
            );
          })}
          <div className="divider" style={{ margin: "10px 0" }} />
          <div className="row">
            <span style={{ fontWeight: 700, color: "var(--g)" }}>Total courier</span>
            <span style={{ fontFamily: "Sora, sans-serif", fontWeight: 800, color: "var(--g)", fontSize: 18 }}>
              {formatMoney(totalCourier)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="ct">Per distributor</div>
          {snapshot.distributors
            .filter((distributor) => sessionBills.some((bill) => bill.distributorId === distributor.id))
            .map((distributor) => {
              const bill = sessionBills.find((entry) => entry.distributorId === distributor.id)!;
              const gatePass = sessionGatePasses.find((entry) => entry.distributorId === distributor.id);
              return (
                <div className="sdrow" key={distributor.id}>
                  <div className="row">
                    <span className="iname">{distributor.name}</span>
                    <span className={`badge ${gatePass ? "bg" : "bw"}`}>{gatePass ? "Done" : "Pending"}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color: "var(--muted)" }}>
                    {gatePass
                      ? `${gatePassBagCount(gatePass)} bags · Courier ${formatMoney(gatePass.courierFeeTotal)}`
                      : "Waiting for bag details"}
                  </div>
                  <div className="row" style={{ marginTop: 4, border: "none", padding: 0 }}>
                    <span className="lbl">Bill total</span>
                    <span className="val">{formatMoney(bill.totalAmount)}</span>
                  </div>
                </div>
              );
            })}
        </div>
        <div className="card">
          <div className="ct">Purchased items</div>
          <div className="sw" style={{ marginBottom: 10 }}>
            <input
              type="text"
              placeholder="Search item or distributor..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {purchasedRows.length ? (
            purchasedRows.map((row) => (
              <div className="irow" key={row.key}>
                <div className="row">
                  <span className="iname">{row.product?.name}</span>
                  <span className="badge bb">
                    {row.item.unitsBought} {row.product?.unitLabel}s
                  </span>
                </div>
                <div className="row" style={{ marginTop: 4, border: "none", padding: 0 }}>
                  <span className="lbl">{row.distributor?.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {formatMoney(row.item.ratePerUnit)} / {row.product?.unitLabel} · {formatMoney(row.item.ratePerKg)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No purchased items match this search.</div>
          )}
        </div>
        <Link className="btn btn-s" to="/delivery-verify">
          Delivery verification →
        </Link>
      </div>
    </ScreenFrame>
  );
}

function MasterScreen() {
  const { snapshot } = useAppData();
  const [tab, setTab] = useState<"items" | "distributors" | "history">("items");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PriceHistoryFilter>("all");

  const itemCards = snapshot.products.filter((product) => product.name.toLowerCase().includes(query.toLowerCase()));
  const distributorCards = snapshot.distributors.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));

  const historyGroups = snapshot.products
    .filter((product) => product.name.toLowerCase().includes(query.toLowerCase()))
    .map((product) => {
      const purchased = snapshot.purchaseHistory
        .filter((entry) => entry.productId === product.id)
        .map((entry) => ({ type: "purchased" as const, date: entry.purchaseDate, entry }));
      const enquiries = snapshot.enquiryHistory
        .filter((entry) => entry.productId === product.id)
        .map((entry) => ({ type: "enquiries" as const, date: entry.enquiryDate, entry }));
      return {
        product,
        rows: [...purchased, ...enquiries]
          .filter((entry) => filter === "all" || entry.type === filter)
          .sort((a, b) => b.date.localeCompare(a.date))
      };
    })
    .filter((group) => group.rows.length);

  return (
    <ScreenFrame title="Items & distributors" backTo="/" action={<Link className="ta-btn" to="/enquiry/new">+ Enquiry</Link>}>
      <div className="tabs">
        {[
          { key: "items", label: "Items" },
          { key: "distributors", label: "Distributors" },
          { key: "history", label: "Price history" }
        ].map((entry) => (
          <button
            className={`tbtn ${tab === entry.key ? "on" : ""}`}
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key as typeof tab)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="sw">
        <input type="text" placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {tab === "items" ? (
        <div className="content">
          <Link className="btn btn-p" to="/master/items/new">
            + Add new item
          </Link>
          {itemCards.map((product) => (
            <Link className="card" key={product.id} style={{ cursor: "pointer" }} to={`/master/items/${product.id}`}>
              <div className="row">
                <div>
                  <div className="iname">{product.name}</div>
                  <div className="isub">
                    {product.weightPerUnitKg} kg/{product.unitLabel}
                  </div>
                </div>
                <span className="badge bb">{product.linkedDistributorIds.length} dists</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>
                {product.linkedDistributorIds.map((id) => (
                  <span className="tag" key={id}>
                    {snapshot.distributors.find((entry) => entry.id === id)?.shortCode}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
      {tab === "distributors" ? (
        <div className="content">
          <Link className="btn btn-p" to="/master/distributors/new">
            + Add new distributor
          </Link>
          {distributorCards.map((distributor) => {
            const suppliedProducts = snapshot.products.filter((product) => product.linkedDistributorIds.includes(distributor.id));
            return (
              <Link
                className="card"
                key={distributor.id}
                style={{ cursor: "pointer" }}
                to={`/master/distributors/${distributor.id}`}
              >
                <div className="row">
                  <div>
                    <div className="iname">{distributor.name}</div>
                    <div className="isub">
                      Dist {distributor.shortCode} · {distributor.area}
                    </div>
                  </div>
                  <span className="badge bg">Active</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  {suppliedProducts.map((product) => product.name).join(", ")}
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
      {tab === "history" ? (
        <div className="content">
          <div className="card" style={{ padding: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { key: "all", label: "All", extraClass: "" },
                { key: "purchased", label: "🟦 Purchased", extraClass: "border-color:var(--bb);background:var(--bl);color:var(--b)" },
                { key: "enquiries", label: "🟡 Enquiries", extraClass: "border-color:var(--ab);background:var(--al);color:var(--a)" }
              ].map((entry) => (
                <button
                  key={entry.key}
                  className={`dchip btn-sm ${filter === entry.key ? "on" : ""}`}
                  style={{
                    width: "auto",
                    padding: "6px 12px",
                    ...(entry.key === "purchased"
                      ? { borderColor: "var(--bb)", background: "var(--bl)", color: "var(--b)" }
                      : entry.key === "enquiries"
                        ? { borderColor: "var(--ab)", background: "var(--al)", color: "var(--a)" }
                        : {})
                  }}
                  type="button"
                  onClick={() => setFilter(entry.key as PriceHistoryFilter)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          {historyGroups.map((group) => (
            <div className="card" key={group.product.id}>
              <div className="ct">{group.product.name}</div>
              {group.rows.map((row, index) => {
                if (row.type === "purchased") {
                  const distributor = snapshot.distributors.find((entry) => entry.id === row.entry.distributorId)!;
                  return (
                    <div
                      key={row.entry.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                        padding: "5px 0",
                        borderBottom: index === group.rows.length - 1 ? "none" : "1px solid var(--border)"
                      }}
                    >
                      <div>
                        <span className="badge bb" style={{ fontSize: 10, marginRight: 6 }}>
                          🟦 Bought
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {distributor.name} ({distributor.shortCode})
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>
                          {formatMoney(row.entry.ratePerUnit)}/{group.product.unitLabel} · {formatMoney(row.entry.ratePerKg)}/kg
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(row.entry.purchaseDate)}</div>
                      </div>
                    </div>
                  );
                }

                const distributor = snapshot.distributors.find((entry) => entry.id === row.entry.distributorId)!;
                return (
                  <div
                    key={row.entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      padding: "5px 0",
                      borderBottom: index === group.rows.length - 1 ? "none" : "1px solid var(--border)"
                    }}
                  >
                    <div>
                      <span className="badge ba" style={{ fontSize: 10, marginRight: 6 }}>
                        🟡 Enquiry
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {distributor.name} ({distributor.shortCode})
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{formatMoney(row.entry.quotedRatePerUnit)}/{group.product.unitLabel}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {shortDate(row.entry.enquiryDate)} ·{" "}
                        <span className={`src-${row.entry.source === "whatsapp" ? "wa" : row.entry.source}`}>
                          {sourceLabelMap[row.entry.source]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </ScreenFrame>
  );
}

function MasterExcelScreen() {
  const { importPreview, isImporting, fileInputRef, exportWorkbook, readImportFile, applyImport, clearImportPreview } =
    useMasterDataExcel();

  return (
    <ScreenFrame title="Import / export" backTo="/">
      <div className="content">
        <div className="card">
          <div className="ct">Excel import / export</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Export the current master data to Excel, edit items/distributors offline, then import the same workbook back.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-p btn-sm" type="button" onClick={exportWorkbook}>
              Export Excel
            </button>
            <button className="btn btn-s btn-sm" type="button" onClick={() => fileInputRef.current?.click()}>
              Import Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                await readImportFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        {importPreview ? (
          <div className="card">
            <div className="row" style={{ border: "none", padding: 0 }}>
              <div>
                <div className="iname">{importPreview.fileName}</div>
                <div className="isub">
                  {importPreview.distributors.length} distributors · {importPreview.products.length} items ready to import
                </div>
              </div>
              <span className={`badge ${importPreview.warnings.length ? "bw" : "bg"}`}>
                {importPreview.warnings.length ? `${importPreview.warnings.length} warning(s)` : "Clean"}
              </span>
            </div>
            {importPreview.warnings.length ? (
              <div className="ep" style={{ marginTop: 10 }}>
                {importPreview.warnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="isub" style={{ marginTop: index ? 6 : 0 }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-p btn-sm" type="button" disabled={isImporting} onClick={() => void applyImport()}>
                {isImporting ? "Importing..." : "Apply import"}
              </button>
              <button className="btn btn-s btn-sm" type="button" onClick={clearImportPreview}>
                Clear
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function StockExcelScreen() {
  const { importPreview, isImporting, fileInputRef, exportWorkbook, readImportFile, applyImport, clearImportPreview } =
    useStockExcel();

  return (
    <ScreenFrame title="Stock Excel" backTo="/stock">
      <div className="content">
        <div className="card">
          <div className="ct">Bulk stock update</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Export the current stock workbook, fill the <code>updatedStockQty</code> column offline, then import it back to update stock in bulk.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-p btn-sm" type="button" onClick={exportWorkbook}>
              Export stock Excel
            </button>
            <button className="btn btn-s btn-sm" type="button" onClick={() => fileInputRef.current?.click()}>
              Import stock Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                await readImportFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        {importPreview ? (
          <div className="card">
            <div className="row" style={{ border: "none", padding: 0 }}>
              <div>
                <div className="iname">{importPreview.fileName}</div>
                <div className="isub">{importPreview.rows.length} stock row(s) ready to update</div>
              </div>
              <span className={`badge ${importPreview.warnings.length ? "bw" : "bg"}`}>
                {importPreview.warnings.length ? `${importPreview.warnings.length} warning(s)` : "Clean"}
              </span>
            </div>
            {importPreview.warnings.length ? (
              <div className="ep" style={{ marginTop: 10 }}>
                {importPreview.warnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="isub" style={{ marginTop: index ? 6 : 0 }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="ep" style={{ marginTop: 10 }}>
              {importPreview.rows.slice(0, 8).map((row) => (
                <div className="row" key={row.productId}>
                  <span className="lbl">{row.name}</span>
                  <span className="val">
                    {row.currentStockQty} → {row.updatedStockQty}
                  </span>
                </div>
              ))}
              {importPreview.rows.length > 8 ? (
                <div className="isub" style={{ marginTop: 8 }}>
                  +{importPreview.rows.length - 8} more row(s)
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn btn-p btn-sm" type="button" disabled={isImporting || !importPreview.rows.length} onClick={applyImport}>
                {isImporting ? "Importing..." : "Apply stock update"}
              </button>
              <button className="btn btn-s btn-sm" type="button" onClick={clearImportPreview}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function RegisterExcelScreen() {
  const { importPreview, isImporting, fileInputRef, exportWorkbook, readImportFile, applyImport, clearImportPreview } =
    useRegisterExcel();

  return (
    <ScreenFrame title="Plan Excel" backTo="/register">
      <div className="content">
        <SessionPicker title="Plan session" subtitle="Pick the session whose plan you want to export or replace." compact />
        <div className="card">
          <div className="ct">Session plan import / export</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            Export the selected session plan, edit planned quantities offline, then import the workbook back to replace that session plan.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-p btn-sm" type="button" onClick={exportWorkbook}>
              Export plan Excel
            </button>
            <button className="btn btn-s btn-sm" type="button" onClick={() => fileInputRef.current?.click()}>
              Import plan Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                await readImportFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
        {importPreview ? (
          <div className="card">
            <div className="row" style={{ border: "none", padding: 0 }}>
              <div>
                <div className="iname">{importPreview.fileName}</div>
                <div className="isub">{importPreview.rows.length} row(s) ready to replace for this session</div>
              </div>
              <span className={`badge ${importPreview.warnings.length ? "bw" : "bg"}`}>
                {importPreview.warnings.length ? `${importPreview.warnings.length} warning(s)` : "Clean"}
              </span>
            </div>
            {importPreview.warnings.length ? (
              <div className="ep" style={{ marginTop: 10 }}>
                {importPreview.warnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} className="isub" style={{ marginTop: index ? 6 : 0 }}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="ep" style={{ marginTop: 10 }}>
              {importPreview.rows.slice(0, 8).map((row) => (
                <div className="row" key={row.productId}>
                  <span className="lbl">{row.productName}</span>
                  <span className="val">{row.plannedQty}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn btn-p btn-sm" type="button" onClick={applyImport} disabled={isImporting}>
                {isImporting ? "Importing..." : "Replace session plan"}
              </button>
              <button className="btn btn-s btn-sm" type="button" onClick={clearImportPreview}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function ItemDetailScreen() {
  const { productId } = useParams();
  const { snapshot } = useAppData();
  const navigate = useNavigate();
  const createProduct = useMutation((api as any).products.create);
  const updateProduct = useMutation((api as any).products.update);
  const isCreateMode = !productId || productId === "new";
  const product = isCreateMode ? undefined : snapshot.products.find((entry) => entry.id === productId);
  const [name, setName] = useState(product?.name ?? "");
  const [unitLabel, setUnitLabel] = useState<Product["unitLabel"]>(product?.unitLabel ?? "bag");
  const [weightPerUnitKg, setWeightPerUnitKg] = useState(product ? String(product.weightPerUnitKg) : "");
  const [minStockAlert, setMinStockAlert] = useState(product ? String(product.minStockAlert) : "");
  const [currentStockQty, setCurrentStockQty] = useState(product ? String(product.currentStockQty) : "");
  const [linkedDistributorIds, setLinkedDistributorIds] = useState<string[]>(product?.linkedDistributorIds ?? []);
  const [distributorPickerValue, setDistributorPickerValue] = useState("");

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setUnitLabel(product.unitLabel);
    setWeightPerUnitKg(String(product.weightPerUnitKg));
    setMinStockAlert(String(product.minStockAlert));
    setCurrentStockQty(String(product.currentStockQty));
    setLinkedDistributorIds(product.linkedDistributorIds);
  }, [product]);

  const purchaseHistory = product
    ? snapshot.purchaseHistory.filter((entry) => entry.productId === product.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
    : [];
  const enquiryHistory = product
    ? snapshot.enquiryHistory.filter((entry) => entry.productId === product.id).sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate)).slice(0, 10)
    : [];
  const linkedDistributors = snapshot.distributors.filter((distributor) => linkedDistributorIds.includes(distributor.id));
  const availableDistributorOptions: ComboOption[] = snapshot.distributors
    .filter((distributor) => !linkedDistributorIds.includes(distributor.id))
    .map((distributor) => ({
      id: distributor.id,
      label: `${distributor.name} (${distributor.shortCode})`,
      searchText: `${distributor.name} ${distributor.shortCode} ${distributor.area ?? ""} ${distributor.phone ?? ""}`
    }));

  return (
    <ScreenFrame title={isCreateMode ? "Add item" : "Item detail"} backTo="/master">
      <div className="content">
        <div className="card">
          <div className="ct">Item info</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Item name</div>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="fr2" style={{ marginBottom: 10 }}>
            <div className="fg">
              <div className="fl">Unit type</div>
              <select value={unitLabel} onChange={(event) => setUnitLabel(event.target.value as Product["unitLabel"])}>
                {(["bag", "tin", "box", "kg"] as Product["unitLabel"][]).map((entry) => (
                  <option key={entry} value={entry}>
                    {capitalize(entry)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fg">
              <div className="fl">Wt per unit (kg)</div>
              <input type="number" value={weightPerUnitKg} onChange={(event) => setWeightPerUnitKg(event.target.value)} />
            </div>
          </div>
          <div className="fr2">
            <div className="fg">
              <div className="fl">Min stock alert</div>
              <input type="number" value={minStockAlert} onChange={(event) => setMinStockAlert(event.target.value)} />
            </div>
            <div className="fg">
              <div className="fl">Current stock</div>
              <input type="number" value={currentStockQty} onChange={(event) => setCurrentStockQty(event.target.value)} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="ct">Linked distributors</div>
          <div style={{ marginBottom: 10 }}>
            <SearchableComboBox
              label="Add distributor"
              placeholder="Search distributor to link..."
              value={distributorPickerValue}
              options={availableDistributorOptions}
              onSelect={(option) => {
                setLinkedDistributorIds((current) => [...current, option.id]);
                setDistributorPickerValue("");
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {linkedDistributors.length ? (
              linkedDistributors.map((distributor) => (
                <div
                  className="row"
                  key={distributor.id}
                  style={{
                    border: "2px solid var(--border)",
                    borderRadius: "var(--rs)",
                    padding: "10px 12px",
                    background: "var(--gl)"
                  }}
                >
                  <Link
                    to={`/master/distributors/${distributor.id}`}
                    style={{ flex: 1, fontWeight: 600, color: "var(--g)", textDecoration: "none" }}
                  >
                    {distributor.name} ({distributor.shortCode})
                  </Link>
                  <button
                    className="btn btn-d btn-sm"
                    type="button"
                    onClick={() => setLinkedDistributorIds((current) => current.filter((entry) => entry !== distributor.id))}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">No linked distributors yet.</div>
            )}
          </div>
        </div>
        {!isCreateMode && product ? (
          <>
            <div className="card">
              <div className="ph-title" style={{ fontFamily: "Sora, sans-serif", fontSize: 11, marginBottom: 8 }}>
                🟦 Purchase history (actual)
              </div>
              {purchaseHistory.map((entry) => {
                const distributor = snapshot.distributors.find((item) => item.id === entry.distributorId)!;
                return (
                  <div
                    key={entry.id}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>
                        {distributor.name} ({distributor.shortCode})
                      </span>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(entry.purchaseDate)}</div>
                    </div>
                    <span style={{ fontWeight: 700 }}>{rateLabel(entry.ratePerUnit, product.unitLabel, entry.ratePerKg)}</span>
                  </div>
                );
              })}
            </div>
            <div className="card" style={{ background: "var(--al)", borderColor: "var(--ab)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="eq-title" style={{ fontFamily: "Sora, sans-serif", fontSize: 11, marginBottom: 0 }}>
                  🟡 Enquiry / quoted prices
                </div>
                <Link className="btn btn-a btn-sm" to={`/enquiry/new?productId=${product.id}`}>
                  + Log enquiry
                </Link>
              </div>
              {enquiryHistory.map((entry) => {
                const distributor = snapshot.distributors.find((item) => item.id === entry.distributorId)!;
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(245,212,138,.5)"
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--a)" }}>
                        {distributor.name} ({distributor.shortCode})
                      </span>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {shortDate(entry.enquiryDate)} ·{" "}
                        <span className={`src-${entry.source === "whatsapp" ? "wa" : entry.source}`}>
                          {sourceLabelMap[entry.source]}
                        </span>{" "}
                        {entry.notes ? `· "${entry.notes}"` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontWeight: 700 }}>{formatMoney(entry.quotedRatePerUnit)}/{product.unitLabel}</span>
                      <Link className="btn btn-s btn-sm" to={`/enquiry/new?entryId=${entry.id}`}>
                        Edit
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        <button
          className="btn btn-p"
          type="button"
          onClick={async () => {
            if (!name.trim()) return;
            if (isCreateMode) {
              await createProduct({
                name: name.trim(),
                unitLabel,
                weightPerUnitKg: Number(weightPerUnitKg || 0),
                currentStockQty: Number(currentStockQty || 0),
                minStockAlert: Number(minStockAlert || 0),
                linkedDistributorIds: linkedDistributorIds as never[]
              });
            } else if (product) {
              await updateProduct({
                productId: product.id as never,
                name: name.trim(),
                unitLabel,
                weightPerUnitKg: Number(weightPerUnitKg || 0),
                currentStockQty: Number(currentStockQty || 0),
                minStockAlert: Number(minStockAlert || 0),
                linkedDistributorIds: linkedDistributorIds as never[]
              });
            }
            navigate("/master");
          }}
        >
          {isCreateMode ? "Save item" : "Save"}
        </button>
      </div>
    </ScreenFrame>
  );
}

function DistributorDetailScreen() {
  const { distributorId } = useParams();
  const { snapshot } = useAppData();
  const navigate = useNavigate();
  const createDistributor = useMutation((api as any).distributors.create);
  const updateDistributor = useMutation((api as any).distributors.update);
  const isCreateMode = !distributorId || distributorId === "new";
  const distributor = isCreateMode ? undefined : snapshot.distributors.find((entry) => entry.id === distributorId);
  const [name, setName] = useState(distributor?.name ?? "");
  const [shortCode, setShortCode] = useState(distributor?.shortCode ?? "");
  const [phone, setPhone] = useState(distributor?.phone ?? "");
  const [area, setArea] = useState(distributor?.area ?? "");

  useEffect(() => {
    if (!distributor) return;
    setName(distributor.name);
    setShortCode(distributor.shortCode);
    setPhone(distributor.phone ?? "");
    setArea(distributor.area ?? "");
  }, [distributor]);

  const suppliedProducts = distributor ? snapshot.products.filter((product) => product.linkedDistributorIds.includes(distributor.id)) : [];
  const purchases = distributor
    ? snapshot.purchaseHistory.filter((entry) => entry.distributorId === distributor.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
    : [];
  const enquiries = distributor
    ? snapshot.enquiryHistory.filter((entry) => entry.distributorId === distributor.id).sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate)).slice(0, 10)
    : [];

  return (
    <ScreenFrame title={isCreateMode ? "Add distributor" : "Distributor"} backTo="/master">
      <div className="content">
        <div className="card">
          <div className="ct">Info</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Name</div>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="fr2" style={{ marginBottom: 10 }}>
            <div className="fg">
              <div className="fl">Code</div>
              <input type="text" value={shortCode} onChange={(event) => setShortCode(event.target.value)} />
            </div>
            <div className="fg">
              <div className="fl">Phone</div>
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
          </div>
          <div className="fg">
            <div className="fl">Area</div>
            <input type="text" value={area} onChange={(event) => setArea(event.target.value)} />
          </div>
        </div>
        {!isCreateMode && distributor ? (
          <>
            <div className="card">
              <div className="ct">Items from this distributor</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {suppliedProducts.map((product) => (
                  <div className="row" key={product.id}>
                    <button className="dchip on" style={{ flex: 1 }} type="button">
                      {product.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="ph-title" style={{ fontFamily: "Sora, sans-serif", fontSize: 11, marginBottom: 8 }}>
                🟦 Purchases from this distributor
              </div>
              {purchases.map((entry) => {
                const product = snapshot.products.find((item) => item.id === entry.productId)!;
                return (
                  <div
                    key={entry.id}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{product.name}</span>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(entry.purchaseDate)}</div>
                    </div>
                    <span style={{ fontWeight: 700 }}>{rateLabel(entry.ratePerUnit, product.unitLabel, entry.ratePerKg)}</span>
                  </div>
                );
              })}
            </div>
            <div className="card" style={{ background: "var(--al)", borderColor: "var(--ab)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="eq-title" style={{ fontFamily: "Sora, sans-serif", fontSize: 11, marginBottom: 0 }}>
                  🟡 Enquiry prices from this dist
                </div>
                <Link className="btn btn-a btn-sm" to={`/enquiry/new?distributorId=${distributor.id}`}>
                  + Log
                </Link>
              </div>
              {enquiries.length ? (
                enquiries.map((entry) => {
                  const product = snapshot.products.find((item) => item.id === entry.productId)!;
                  return (
                    <div key={entry.id} className="row">
                      <span style={{ color: "var(--a)", fontWeight: 600 }}>{product.name}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 700 }}>{formatMoney(entry.quotedRatePerUnit)}/{product.unitLabel}</span>
                        <Link className="btn btn-s btn-sm" to={`/enquiry/new?entryId=${entry.id}`}>
                          Edit
                        </Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 12, color: "var(--a)", fontStyle: "italic", textAlign: "center", padding: 8 }}>
                  No enquiry prices logged yet for this distributor.
                </div>
              )}
            </div>
          </>
        ) : null}
        <button
          className="btn btn-p"
          type="button"
          onClick={async () => {
            if (!name.trim() || !shortCode.trim()) return;
            if (isCreateMode) {
              await createDistributor({
                name: name.trim(),
                shortCode: shortCode.trim(),
                phone: phone.trim() || undefined,
                area: area.trim() || undefined
              });
            } else if (distributor) {
              await updateDistributor({
                distributorId: distributor.id as never,
                name: name.trim(),
                shortCode: shortCode.trim(),
                phone: phone.trim() || undefined,
                area: area.trim() || undefined
              });
            }
            navigate("/master");
          }}
        >
          {isCreateMode ? "Save distributor" : "Save"}
        </button>
      </div>
    </ScreenFrame>
  );
}

function VerifyScreen() {
  const { snapshot, activeSession, updateDeliveryStatus } = useAppData();
  const [query, setQuery] = useState("");
  const [received, setReceived] = useState<Record<string, number>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const verificationRows = snapshot.deliveryVerifications
    .filter((entry) => entry.sessionId === activeSession.id)
    .flatMap((verification) =>
      verification.items.map((item) => ({
        verification,
        item,
        product: snapshot.products.find((entry) => entry.id === item.productId)!,
        distributor: snapshot.distributors.find((entry) => entry.id === verification.distributorId)!
      }))
    )
    .filter((row) => row.product.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScreenFrame
      title="Delivery verification"
      backTo="/"
      search={
        <div className="sw">
          <input
            type="text"
            placeholder="Search item..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      }
    >
      <div className="content">
        <SessionPicker title="Verification session" subtitle="Verify items for the selected session." compact />
        <div className="card">
          <div className="ct">Verify received items</div>
          {feedback ? (
            <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
              {feedback}
            </div>
          ) : null}
          {verificationRows.length ? (
            verificationRows.map(({ verification, item, product, distributor }) => {
              const purchase = snapshot.purchaseHistory
                .filter(
                  (entry) =>
                    entry.productId === item.productId &&
                    entry.distributorId === verification.distributorId &&
                    entry.sessionId === verification.sessionId
                )
                .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
              const value = received[item.productId] ?? item.receivedQty ?? item.expectedQty;
              const actionKey = `${verification.distributorId}-${item.productId}`;
              return (
                <div className="irow" key={`${verification.id}-${item.productId}`}>
                  <div className="row">
                    <div>
                      <span className="iname">{product.name}</span>
                      <div className="isub">{distributor.name}</div>
                      <div className="isub">Current stock: {product.currentStockQty} {product.unitLabel}s</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span className="badge bb">
                        Expected: {item.expectedQty} {product.unitLabel}s
                      </span>
                      <span className={`badge ${item.status === "match" ? "bg" : item.status === "shortage" ? "br" : "bw"}`}>
                        {capitalize(item.status)}
                      </span>
                    </div>
                  </div>
                  <div className="fr2" style={{ marginTop: 8 }}>
                    <div className="fg">
                      <div className="fl">Received {product.unitLabel}s</div>
                      <input
                        type="number"
                        value={value}
                        onChange={(event) =>
                          setReceived((current) => ({
                            ...current,
                            [item.productId]: Number(event.target.value)
                          }))
                        }
                      />
                    </div>
                    <div className="fg">
                      <div className="fl">Rate paid</div>
                      <input
                        type="text"
                        readOnly
                        value={
                          purchase ? `${formatMoney(purchase.ratePerUnit)}/${product.unitLabel} · ${formatMoney(purchase.ratePerKg)}` : "—"
                        }
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: "var(--gl)", color: "var(--g)", border: "1.5px solid var(--gb)" }}
                      type="button"
                      disabled={submittingKey === actionKey}
                      onClick={async () => {
                        setSubmittingKey(actionKey);
                        try {
                          await updateDeliveryStatus(
                            verification.distributorId,
                            item.productId,
                            value,
                            "match" satisfies DeliveryStatus
                          );
                          setFeedback(`${product.name} matched and stock updated.`);
                        } catch (error) {
                          setFeedback(error instanceof Error ? error.message : "Failed to update verification.");
                        } finally {
                          setSubmittingKey(null);
                        }
                      }}
                    >
                      {submittingKey === actionKey ? "Saving..." : "Match"}
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: "var(--rl)", color: "var(--r)", border: "1.5px solid var(--rb)" }}
                      type="button"
                      disabled={submittingKey === actionKey}
                      onClick={async () => {
                        setSubmittingKey(actionKey);
                        try {
                          await updateDeliveryStatus(
                            verification.distributorId,
                            item.productId,
                            value,
                            "shortage" satisfies DeliveryStatus
                          );
                          setFeedback(`${product.name} marked as shortage.`);
                        } catch (error) {
                          setFeedback(error instanceof Error ? error.message : "Failed to update verification.");
                        } finally {
                          setSubmittingKey(null);
                        }
                      }}
                    >
                      {submittingKey === actionKey ? "Saving..." : "Shortage"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">No items to verify for this session.</div>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}

export default App;
