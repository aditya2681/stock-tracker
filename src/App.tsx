import { useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams
} from "react-router-dom";
import { useAppData } from "./context/AppDataContext";
import { useAuth } from "./context/AuthContext";
import { exportGatePassPdf, exportPurchasedItemsPdf, exportSessionSummaryPdf } from "./lib/pdf";
import type {
  DeliveryStatus,
  EnquirySource,
  GatePassBag,
  GatePassBagItem,
  PriceEntryMode,
  PriceHistoryFilter,
  Product,
  StockReason,
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
  const { snapshot, selectedSessionId, setSelectedSessionId, createSession, removeSession } = useAppData();
  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId) ?? snapshot.sessions[0];
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
            <Route path="/register" element={<RegisterScreen />} />
            <Route path="/register/session" element={<RegisterSessionScreen />} />
            <Route path="/purchase" element={<PurchaseScreen />} />
            <Route path="/bag-fill" element={<BagFillScreen />} />
            <Route path="/gate-passes" element={<GatePassesScreen />} />
            <Route path="/gate-passes/:gatePassId" element={<GatePassViewScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
            <Route path="/master" element={<MasterScreen />} />
            <Route path="/master/items/:productId" element={<ItemDetailScreen />} />
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
  const totalSpend = snapshot.bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalCourier = snapshot.gatePasses.reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);
  const totalBags = snapshot.gatePasses.reduce((sum, gatePass) => sum + gatePass.bags.length, 0);
  const remaining = activeSession.openingBalance - totalSpend - totalCourier;

  const todayStats = [
    { label: "Bills raised", value: String(snapshot.bills.length) },
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
            { to: "/register", icon: "📋", title: "Register", sub: "Plan purchases" },
            { to: "/purchase", icon: "🛒", title: "Purchase", sub: "Clear at shop" },
            { to: "/gate-passes", icon: "🧾", title: "Gate passes", sub: "View & export" },
            { to: "/summary", icon: "📊", title: "Summary", sub: "Balance & courier" },
            { to: "/master", icon: "🗂", title: "Items & Dists", sub: "Catalogue + prices" }
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
      </div>
    </ScreenFrame>
  );
}

function SessionDetailsScreen() {
  const { snapshot, activeSession, setSessionOpeningBalance, setSessionClosingBalance } = useAppData();
  const totalSpend = snapshot.bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalCourier = snapshot.gatePasses.reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);
  const expected = activeSession.openingBalance - totalSpend - totalCourier;
  const diff = typeof activeSession.closingBalance === "number" ? activeSession.closingBalance - expected : null;

  const purchasedRows = snapshot.bills.flatMap((bill) =>
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
          {snapshot.bills.map((bill) => {
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
                  <div className="isub">{gatePass ? `${gatePass.bags.length} bags` : "bags pending"}</div>
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
      action={isOwner ? <Link className="ta-btn" to="/register">+ Plan</Link> : undefined}
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
  const { snapshot, addEnquiry } = useAppData();
  const navigate = useNavigate();
  const [productId, setProductId] = useState(snapshot.products[0]?.id ?? "");
  const [distributorId, setDistributorId] = useState(snapshot.distributors[0]?.id ?? "");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const product = snapshot.products.find((entry) => entry.id === productId);
  const quotedRate = Number(rate || 0);
  const enquiryDate = todayInputValue();

  return (
    <ScreenFrame title="Log enquiry price" backTo="/master">
      <div className="content">
        <div className="card">
          <div className="ct">Quick enquiry</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Item</div>
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              {snapshot.products.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Distributor</div>
            <select value={distributorId} onChange={(event) => setDistributorId(event.target.value)}>
              {snapshot.distributors.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} ({entry.shortCode})
                </option>
              ))}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Quoted price (₹/{product?.unitLabel ?? "unit"})</div>
            <input type="number" value={rate} onChange={(event) => setRate(event.target.value)} />
          </div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Date</div>
            <input className="auto-f" readOnly value={formatDate(enquiryDate)} />
          </div>
          <div className="fg">
            <div className="fl">Remarks (optional)</div>
            <textarea placeholder="Any short note" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-p"
          type="button"
          onClick={() => {
            addEnquiry({
              productId,
              distributorId,
              quotedRatePerUnit: quotedRate,
              weightPerUnitKg: product?.weightPerUnitKg ?? 0,
              enquiryDate,
              source: "other",
              notes
            });
            navigate("/master");
          }}
        >
          Save enquiry price
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

function RegisterScreen() {
  const { snapshot, selectedSessionId, activeSession, addRegisterItem, updateRegisterItem, removeRegisterItem } =
    useAppData();
  const [query, setQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "low" | "planned" | "not_planned">("all");
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId) ?? activeSession;
  const registerCards = snapshot.registerItems
    .filter((entry) => entry.sessionId === selectedSessionId)
    .map((entry) => ({
      ...entry,
      product: snapshot.products.find((product) => product.id === entry.productId)!
    }));
  const visibleProducts = snapshot.products.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase())
  );
  const catalogProducts = visibleProducts.filter((product) => {
    const planned = registerCards.some((entry) => entry.product.id === product.id);
    if (catalogFilter === "planned") return planned;
    if (catalogFilter === "not_planned") return !planned;
    if (catalogFilter === "low") return product.currentStockQty <= product.minStockAlert;
    return true;
  });

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
            Search items first, set the buy quantity here, then add them directly to the session plan.
          </div>
          <div className="sw" style={{ marginBottom: 10 }}>
            <input
              type="text"
              placeholder="Search items to plan..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
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
          {catalogProducts.length ? (
            catalogProducts.map((product) => {
              const plannedEntry = registerCards.find((entry) => entry.product.id === product.id);
              const alreadyPlanned = Boolean(plannedEntry);
              const suggestedQty = Math.max(product.minStockAlert - product.currentStockQty, 0);
              const qtyValue = plannedEntry
                ? draftQty[product.id] ?? String(plannedEntry.qtyRequired)
                : draftQty[product.id] ?? (suggestedQty ? String(suggestedQty) : "");
              const hasPlannedQtyChange =
                plannedEntry && qtyValue !== String(plannedEntry.qtyRequired) && qtyValue.trim() !== "";
              return (
                <div className="card" key={product.id} style={{ margin: "0 0 10px 0" }}>
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
                          onClick={() => addRegisterItem(product.id, Number(draftQty[product.id] || suggestedQty || 1))}
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
            })
          ) : (
            <div className="empty-state">No items match this search.</div>
          )}
        </div>
        <Link className="btn btn-p" to="/purchase">
          Go to purchase →
        </Link>
      </div>
    </ScreenFrame>
  );
}

function PurchaseScreen() {
  const { snapshot, selectedSessionId, savePurchaseDraft } = useAppData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [itemFilter, setItemFilter] = useState<"planned" | "all">("planned");
  const [selectedDistributorId, setSelectedDistributorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [stage, setStage] = useState<"session" | "distributor" | "items">("session");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId) ?? snapshot.sessions[0];
  const [billDate, setBillDate] = useState(selectedSession.date);
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
  const filteredCatalog = (itemFilter === "planned" ? plannedProducts : purchasableProducts).filter(
    (product) => !selectedProductIds.includes(product.id) && product.name.toLowerCase().includes(itemQuery.toLowerCase())
  );

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
    setBillDate(selectedSession.date);
  }, [selectedSession.date]);

  const filteredDistributors = snapshot.distributors.filter((entry) =>
    entry.name.toLowerCase().includes(query.toLowerCase())
  );

  const selectedDistributor = snapshot.distributors.find((entry) => entry.id === selectedDistributorId);
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
    <ScreenFrame
      title="Purchase at shop"
      backTo="/"
      search={stage === "distributor" ? (
        <div className="sw">
          <input
            type="text"
            placeholder="Search distributor..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : undefined}
    >
      <div className="content">
        <div className="card" style={{ paddingBottom: 10 }}>
          <div className="ct">Flow</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className={`badge ${stage === "session" ? "bg" : "bb"}`}>1. Session</span>
            <span className={`badge ${stage === "distributor" ? "bg" : "bb"}`}>2. Distributor</span>
            <span className={`badge ${stage === "items" ? "bg" : "bb"}`}>3. Add purchased items</span>
          </div>
        </div>

        {stage === "session" ? (
          <>
            <SessionPicker title="Purchase session" subtitle="Choose the session first, then continue to distributor." compact />
            <div className="nbox nbox-b" style={{ marginTop: 10 }}>
              {selectedSession.name} · {formatDate(selectedSession.date)} · {plannedItems.length} planned item
              {plannedItems.length === 1 ? "" : "s"}
            </div>
            <button className="btn btn-s" type="button" onClick={() => setStage("session")} disabled>
              Session selected
            </button>
            <div className="card">
              <div className="ct">Next step</div>
              <div className="isub">Choose the shop/distributor for this purchase. Planned items will be preloaded when they are linked to that distributor.</div>
            </div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {filteredDistributors.map((distributor) => (
                  <button
                    className={`dchip ${selectedDistributorId === distributor.id ? "on" : ""}`}
                    key={distributor.id}
                    type="button"
                    onClick={() => {
                      setSelectedDistributorId(distributor.id);
                      setBillNumber(`${distributor.shortCode.toUpperCase()}-${Date.now().toString().slice(-4)}`);
                      setSelectedProductIds([]);
                      setCompletedItems({});
                      setItemFilter("planned");
                    }}
                  >
                    {distributor.name} ({distributor.shortCode})
                  </button>
                ))}
                {!filteredDistributors.length ? <div className="empty-state">No distributor matches this search.</div> : null}
              </div>
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
              <div className="ct">Bill basics</div>
              <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
                {selectedSession.name} · {selectedDistributor.name}
              </div>
              <div className="fg">
                <div className="fl">Bill date</div>
                <input type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} />
              </div>
            </div>
            <div className="card">
              <div className="ct">Add purchased items</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {[
                  { key: "planned", label: "Planned" },
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
              <div className="sw" style={{ marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Search items to add..."
                  value={itemQuery}
                  onChange={(event) => setItemQuery(event.target.value)}
                />
              </div>
              {filteredCatalog.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {filteredCatalog.slice(0, 12).map((product) => {
                    const plannedEntry = plannedItems.find((entry) => entry.product.id === product.id);
                    const alreadyAdded = selectedProductIds.includes(product.id);
                    return (
                      <div className="row" key={product.id} style={{ padding: "10px 0" }}>
                        <div>
                          <div className="iname" style={{ fontSize: 18 }}>
                            {product.name}
                          </div>
                          <div className="isub">
                            {plannedEntry?.remainingQty
                              ? `${plannedEntry.remainingQty} left from plan`
                              : alreadyAdded
                                ? "Already in this bill"
                                : "Add as extra item"}
                          </div>
                        </div>
                        <button
                          className={`btn btn-sm ${alreadyAdded ? "btn-s" : "btn-p"}`}
                          type="button"
                          onClick={() => {
                            if (!alreadyAdded) {
                              setSelectedProductIds((current) => [...current, product.id]);
                            }
                          }}
                        >
                          {alreadyAdded ? "Added" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ marginBottom: 12 }}>
                  No items match this filter.
                </div>
              )}
              <div className="ct" style={{ marginBottom: 10 }}>
                Items in this bill
              </div>
              {purchaseItems.length ? (
                purchaseItems.map((entry) => {
                  const state =
                    formState[entry.product.id] ?? {
                      priceMode: "total" as PriceEntryMode,
                      unitsBought: entry.remainingQty ?? entry.register?.qtyRequired ?? 1,
                      totalPrice: 0,
                      ratePerUnit: 0,
                      weightPerUnitKg: entry.product.weightPerUnitKg,
                      weightType: "kg" as WeightType
                    };
                  const comparison = comparisonRows(entry.product.id);
                  const computedRatePerUnit =
                    state.priceMode === "unit" ? state.ratePerUnit : state.unitsBought ? state.totalPrice / state.unitsBought : 0;
                  const computedRatePerKg =
                    state.weightPerUnitKg && computedRatePerUnit ? computedRatePerUnit / state.weightPerUnitKg : 0;
                  const isItemReady =
                    state.unitsBought > 0 &&
                    (state.priceMode === "total" ? state.totalPrice > 0 : state.ratePerUnit > 0) &&
                    state.weightPerUnitKg > 0;
                  const isCompleted = completedItems[entry.product.id] ?? false;
                  return (
                    <div className="irow" key={entry.product.id}>
                      <div className="row" style={{ marginBottom: 10 }}>
                        <div>
                          <div className="iname">{entry.product.name}</div>
                          <div className="isub">
                            {entry.register
                              ? `${entry.remainingQty ?? entry.register.qtyRequired} remaining from planned ${entry.register.qtyRequired} ${entry.product.unitLabel}s`
                              : "Extra item for this purchase"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            className="btn btn-sm"
                            type="button"
                            style={{
                              background: isCompleted ? "var(--gl)" : "var(--card)",
                              color: isCompleted ? "var(--g)" : "var(--muted)",
                              border: `1.5px solid ${isCompleted ? "var(--gb)" : "var(--border)"}`,
                              opacity: isItemReady ? 1 : 0.6
                            }}
                            disabled={!isItemReady}
                            onClick={() =>
                              setCompletedItems((current) => ({
                                ...current,
                                [entry.product.id]: !current[entry.product.id]
                              }))
                            }
                          >
                            {isCompleted ? "Edit" : "Done"}
                          </button>
                          <button
                            className="btn btn-d btn-sm"
                            type="button"
                            onClick={() => {
                              setSelectedProductIds((current) => current.filter((productId) => productId !== entry.product.id));
                              setCompletedItems((current) => ({ ...current, [entry.product.id]: false }));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {isCompleted ? (
                        <div className="nbox nbox-b" style={{ marginBottom: 8 }}>
                          {state.unitsBought} {entry.product.unitLabel}s · {formatMoney(state.priceMode === "unit" ? state.ratePerUnit * state.unitsBought : state.totalPrice)} total · {computedRatePerKg ? `${formatMoney(computedRatePerKg)}/kg` : "rate pending"}
                        </div>
                      ) : null}
                      {!isCompleted ? (
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
                                  [entry.product.id]: {
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
                                [entry.product.id]: {
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
                                [entry.product.id]: {
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
                                [entry.product.id]: {
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
                      <details className="ph-box" style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontFamily: "Sora, sans-serif", fontWeight: 700 }}>
                          Purchase history
                        </summary>
                        <div style={{ marginTop: 8 }}>
                          {comparison.purchases.length ? (
                            comparison.purchases.map((row, index) => (
                              <div className="ph-row" key={`${entry.product.id}-purchase-${index}`}>
                                <span className="ph-dist">
                                  {row.distributor?.name} ({row.distributor?.shortCode})
                                </span>
                                <span className="ph-rate">
                                  {formatMoney(row.entry.ratePerUnit)}/{entry.product.unitLabel}
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
                              <div className="eq-row" key={`${entry.product.id}-enquiry-${index}`}>
                                <span className="eq-dist">
                                  {row.distributor?.name} ({row.distributor?.shortCode})
                                </span>
                                <span className="eq-rate">
                                  {formatMoney(row.entry.quotedRatePerUnit)}/{entry.product.unitLabel}
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
                })
              ) : (
                <div className="empty-state">No items selected yet. Search above and add what you purchased.</div>
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
            Save bill → fill bag details
          </button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

function buildDefaultBags(draft: ReturnType<typeof useAppData>["purchaseDraft"], products: Product[]): GatePassBag[] {
  if (!draft) return [];
  return draft.items.map((item, index) => {
    const product = products.find((entry) => entry.id === item.productId);
    return {
      id: `draft-bag-${index + 1}`,
      bagNumber: index + 1,
      totalWeightKg: product ? product.weightPerUnitKg : 0,
      sealLabel: "",
      isBundled: false,
      items: []
    } satisfies GatePassBag;
  });
}

function BagFillScreen() {
  const { purchaseDraft, snapshot, generateGatePassFromDraft } = useAppData();
  const navigate = useNavigate();
  const [bags, setBags] = useState<GatePassBag[]>([]);
  const [bagPickers, setBagPickers] = useState<Record<string, { productId: string; units: number }>>({});
  const [ratePerBag, setRatePerBag] = useState(30);
  const [override, setOverride] = useState("");
  const [note, setNote] = useState("Handle oil tins carefully...");

  useEffect(() => {
    if (purchaseDraft) {
      const initialBags = buildDefaultBags(purchaseDraft, snapshot.products);
      setBags(initialBags);
      const initialPicker = purchaseDraft.items[0]?.productId ?? "";
      setBagPickers(
        Object.fromEntries(
          initialBags.map((bag) => [
            bag.id,
            { productId: initialPicker, units: 1 }
          ])
        )
      );
    }
  }, [purchaseDraft, snapshot.products]);

  if (!purchaseDraft) {
    return (
      <ScreenFrame title="Fill bag details" backTo="/purchase">
        <div className="content">
          <div className="nbox nbox-w">Save a bill from the Purchase screen first. The bag-fill flow uses that bill draft.</div>
          <Link className="btn btn-p" to="/purchase">
            Back to purchase →
          </Link>
        </div>
      </ScreenFrame>
    );
  }

  const distributor = snapshot.distributors.find((entry) => entry.id === purchaseDraft.distributorId)!;
  const autoTotal = ratePerBag * bags.length;

  return (
    <ScreenFrame title="Fill bag details" backTo="/purchase">
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
        <div className="nbox nbox-w">Multiple items can go into one physical bag — mark those as Bundled.</div>
        <div className="card">
          <div className="ct">Physical bags</div>
          {bags.map((bag, index) => {
            const picker = bagPickers[bag.id] ?? { productId: purchaseDraft.items[0]?.productId ?? "", units: 1 };
            return (
            <div className="irow" key={bag.id}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="iname">Bag {index + 1}</span>
                {bag.isBundled ? <span className="bundle-tag">Bundled</span> : <span className="badge bgr">Single</span>}
              </div>
              <div className="fg" style={{ marginBottom: 8 }}>
                <div className="fl">Contents</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 7 }}>
                  {bag.items.map((item) => {
                    const product = snapshot.products.find((entry) => entry.id === item.productId)!;
                    return (
                      <div className="row" key={item.id}>
                        <span style={{ fontSize: 13 }}>
                          {product.name} × {item.unitsInBag} {product.unitLabel}s
                        </span>
                        <button
                          className="btn btn-d btn-sm"
                          style={{ padding: "3px 8px" }}
                          type="button"
                          onClick={() =>
                            setBags((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      isBundled: entry.items.length - 1 > 1,
                                      items: entry.items.filter((bagItem) => bagItem.id !== item.id)
                                    }
                                  : entry
                              )
                            )
                          }
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="fr2" style={{ marginBottom: 8 }}>
                  <div className="fg">
                    <div className="fl">Item</div>
                    <select
                      value={picker.productId}
                      onChange={(event) =>
                        setBagPickers((current) => ({
                          ...current,
                          [bag.id]: { ...picker, productId: event.target.value }
                        }))
                      }
                    >
                      {purchaseDraft.items.map((item) => {
                        const product = snapshot.products.find((entry) => entry.id === item.productId);
                        return (
                          <option key={item.productId} value={item.productId}>
                            {product?.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="fg">
                    <div className="fl">Units</div>
                    <input
                      type="number"
                      value={picker.units || ""}
                      onChange={(event) =>
                        setBagPickers((current) => ({
                          ...current,
                          [bag.id]: { ...picker, units: Number(event.target.value) }
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  className="btn btn-s btn-sm"
                  type="button"
                  onClick={() => {
                    const product = snapshot.products.find((entry) => entry.id === picker.productId);
                    if (!product || !picker.units) return;
                    setBags((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? {
                              ...entry,
                              isBundled: entry.items.length > 0,
                              items: [
                                ...entry.items,
                                {
                                  id: `extra-${Date.now()}`,
                                  billItemId: `pending-${picker.productId}`,
                                  productId: picker.productId,
                                  unitsInBag: picker.units
                                } as GatePassBagItem
                              ]
                            }
                          : entry
                      )
                    );
                  }}
                >
                  + Add item to bag
                </button>
              </div>
              <div className="fr2">
                <div className="fg">
                  <div className="fl">Bag weight (kg)</div>
                  <input
                    type="number"
                    value={bag.totalWeightKg}
                    onChange={(event) =>
                      setBags((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, totalWeightKg: Number(event.target.value) } : entry
                        )
                      )
                    }
                  />
                </div>
                <div className="fg">
                  <div className="fl">Seal / label</div>
                  <input
                    type="text"
                    placeholder="optional"
                    value={bag.sealLabel ?? ""}
                    onChange={(event) =>
                      setBags((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, sealLabel: event.target.value } : entry
                        )
                      )
                    }
                  />
                </div>
              </div>
            </div>
          );
          })}
          <button
            className="btn btn-s"
            style={{ marginTop: 8 }}
            type="button"
            onClick={() =>
              setBags((current) => [
                ...current,
                {
                  id: `draft-bag-${current.length + 1}`,
                  bagNumber: current.length + 1,
                  totalWeightKg: 0,
                  sealLabel: "",
                  isBundled: false,
                  items: []
                }
              ])
            }
          >
            + Add another bag
          </button>
        </div>
        <div className="card">
          <div className="ct">Courier fee — this gate pass</div>
          <div className="nbox nbox-b" style={{ marginBottom: 10 }}>
            What you pay the courier person to carry these bags to the courier room.
          </div>
          <div className="fr2" style={{ marginBottom: 8 }}>
            <div className="fg">
              <div className="fl">Bags (auto)</div>
              <input className="auto-f" readOnly value={`${bags.length} bags`} />
            </div>
            <div className="fg">
              <div className="fl">Rate per bag (₹)</div>
              <input type="number" value={ratePerBag} onChange={(event) => setRatePerBag(Number(event.target.value))} />
            </div>
          </div>
          <div className="fr2" style={{ marginBottom: 8 }}>
            <div className="fg">
              <div className="fl">Auto total (₹)</div>
              <input className="auto-f" readOnly value={formatMoney(autoTotal)} />
            </div>
            <div className="fg">
              <div className="fl">Override (₹)</div>
              <input type="number" placeholder="flat if needed" value={override} onChange={(event) => setOverride(event.target.value)} />
            </div>
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
              bags,
              courierFeePerBag: ratePerBag,
              courierFeeOverride: override ? Number(override) : undefined,
              courierNote: note
            });
            if (gatePassId) navigate(`/gate-passes/${gatePassId}`);
          }}
        >
          Generate gate pass →
        </button>
      </div>
    </ScreenFrame>
  );
}

function GatePassViewScreen() {
  const { gatePassId } = useParams();
  const { snapshot } = useAppData();
  const gatePass = snapshot.gatePasses.find((entry) => entry.id === gatePassId) ?? snapshot.gatePasses[0];
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
        <button className="ta-btn" type="button" onClick={handleExport}>
          Share
        </button>
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
                  <strong>Total — {gatePass.bags.length} bags</strong>
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
            <span className="val">{gatePass.bags.length}</span>
          </div>
          <div className="row">
            <span className="lbl">Rate</span>
            <span className="val">{formatMoney(gatePass.courierFeePerBag ?? 0)}/bag</span>
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
          <span style={{ fontSize: 12, color: "var(--g)" }}>{snapshot.gatePasses.length} gate passes</span>
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
                          {gatePass.bags.length} bags · Fee {formatMoney(gatePass.courierFeeTotal)}
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
                        <span className="badge bw">Fill bags</span>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Link className="btn btn-w btn-sm" to="/bag-fill">
                          Fill bag details →
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
  const totalBags = sessionGatePasses.reduce((sum, gatePass) => sum + gatePass.bags.length, 0);
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
                  {distributor.name} ({gatePass.bags.length} bags)
                </span>
                <span className="lbl">₹/bag</span>
                <input
                  type="number"
                  value={gatePass.courierFeePerBag ?? 0}
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
                      ? `${gatePass.bags.length} bags · Courier ${formatMoney(gatePass.courierFeeTotal)}`
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
          <Link className="btn btn-p" to={`/master/items/${snapshot.products[0]?.id ?? ""}`}>
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
          <Link className="btn btn-p" to={`/master/distributors/${snapshot.distributors[0]?.id ?? ""}`}>
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

function ItemDetailScreen() {
  const { productId } = useParams();
  const { snapshot } = useAppData();
  const product = snapshot.products.find((entry) => entry.id === productId) ?? snapshot.products[0];
  const purchaseHistory = snapshot.purchaseHistory
    .filter((entry) => entry.productId === product.id)
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const enquiryHistory = snapshot.enquiryHistory
    .filter((entry) => entry.productId === product.id)
    .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate));

  return (
    <ScreenFrame title="Item detail" backTo="/master" action={<button className="ta-btn">Save</button>}>
      <div className="content">
        <div className="card">
          <div className="ct">Item info</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Item name</div>
            <input type="text" value={product.name} readOnly />
          </div>
          <div className="fr2" style={{ marginBottom: 10 }}>
            <div className="fg">
              <div className="fl">Unit type</div>
              <select value={product.unitLabel} disabled>
                <option>{capitalize(product.unitLabel)}</option>
              </select>
            </div>
            <div className="fg">
              <div className="fl">Wt per unit (kg)</div>
              <input type="number" value={product.weightPerUnitKg} readOnly />
            </div>
          </div>
          <div className="fr2">
            <div className="fg">
              <div className="fl">Min stock alert</div>
              <input type="number" value={product.minStockAlert} readOnly />
            </div>
            <div className="fg">
              <div className="fl">Current stock</div>
              <input type="number" value={product.currentStockQty} readOnly />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="ct">Linked distributors</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {product.linkedDistributorIds.map((distributorId) => {
              const distributor = snapshot.distributors.find((entry) => entry.id === distributorId)!;
              return (
                <div className="row" key={distributor.id}>
                  <button className="dchip on" style={{ flex: 1 }} type="button">
                    {distributor.name} ({distributor.shortCode})
                  </button>
                  <button className="btn btn-d btn-sm" style={{ flexShrink: 0 }} type="button">
                    ✕
                  </button>
                </div>
              );
            })}
            <button className="btn btn-s btn-sm" style={{ width: "auto" }} type="button">
              + Link distributor
            </button>
          </div>
        </div>
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
            <Link className="btn btn-a btn-sm" to="/enquiry/new">
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
                <span style={{ fontWeight: 700 }}>{formatMoney(entry.quotedRatePerUnit)}/{product.unitLabel}</span>
              </div>
            );
          })}
        </div>
        <button className="btn btn-p" type="button">
          Save item
        </button>
      </div>
    </ScreenFrame>
  );
}

function DistributorDetailScreen() {
  const { distributorId } = useParams();
  const { snapshot } = useAppData();
  const distributor = snapshot.distributors.find((entry) => entry.id === distributorId) ?? snapshot.distributors[0];
  const suppliedProducts = snapshot.products.filter((product) => product.linkedDistributorIds.includes(distributor.id));
  const purchases = snapshot.purchaseHistory
    .filter((entry) => entry.distributorId === distributor.id)
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const enquiries = snapshot.enquiryHistory
    .filter((entry) => entry.distributorId === distributor.id)
    .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate));

  return (
    <ScreenFrame title="Distributor" backTo="/master" action={<button className="ta-btn">Save</button>}>
      <div className="content">
        <div className="card">
          <div className="ct">Info</div>
          <div className="fg" style={{ marginBottom: 10 }}>
            <div className="fl">Name</div>
            <input type="text" value={distributor.name} readOnly />
          </div>
          <div className="fr2" style={{ marginBottom: 10 }}>
            <div className="fg">
              <div className="fl">Code</div>
              <input type="text" value={`Dist ${distributor.shortCode}`} readOnly />
            </div>
            <div className="fg">
              <div className="fl">Phone</div>
              <input type="tel" value={distributor.phone} readOnly />
            </div>
          </div>
          <div className="fg">
            <div className="fl">Area</div>
            <input type="text" value={distributor.area} readOnly />
          </div>
        </div>
        <div className="card">
          <div className="ct">Items from this distributor</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {suppliedProducts.map((product) => (
              <div className="row" key={product.id}>
                <button className="dchip on" style={{ flex: 1 }} type="button">
                  {product.name}
                </button>
                <button className="btn btn-d btn-sm" style={{ flexShrink: 0 }} type="button">
                  ✕
                </button>
              </div>
            ))}
            <button className="btn btn-s btn-sm" style={{ width: "auto" }} type="button">
              + Add item
            </button>
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
            <Link className="btn btn-a btn-sm" to="/enquiry/new">
              + Log
            </Link>
          </div>
          {enquiries.length ? (
            enquiries.map((entry) => {
              const product = snapshot.products.find((item) => item.id === entry.productId)!;
              return (
                <div key={entry.id} className="row">
                  <span style={{ color: "var(--a)", fontWeight: 600 }}>{product.name}</span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(entry.quotedRatePerUnit)}/{product.unitLabel}</span>
                </div>
              );
            })
          ) : (
            <div style={{ fontSize: 12, color: "var(--a)", fontStyle: "italic", textAlign: "center", padding: 8 }}>
              No enquiry prices logged yet for this distributor.
            </div>
          )}
        </div>
        <button className="btn btn-p" type="button">
          Save distributor
        </button>
      </div>
    </ScreenFrame>
  );
}

function VerifyScreen() {
  const { snapshot, activeSession, updateDeliveryStatus } = useAppData();
  const [query, setQuery] = useState("");
  const [received, setReceived] = useState<Record<string, number>>({});
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
              return (
                <div className="irow" key={`${verification.id}-${item.productId}`}>
                  <div className="row">
                    <div>
                      <span className="iname">{product.name}</span>
                      <div className="isub">{distributor.name}</div>
                    </div>
                    <span className="badge bb">
                      Expected: {item.expectedQty} {product.unitLabel}s
                    </span>
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
                      onClick={() =>
                        updateDeliveryStatus(verification.distributorId, item.productId, value, "match" satisfies DeliveryStatus)
                      }
                    >
                      Match
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: "var(--rl)", color: "var(--r)", border: "1.5px solid var(--rb)" }}
                      type="button"
                      onClick={() =>
                        updateDeliveryStatus(verification.distributorId, item.productId, value, "shortage" satisfies DeliveryStatus)
                      }
                    >
                      Shortage
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
