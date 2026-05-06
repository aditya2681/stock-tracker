import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { initialSnapshot } from "../data/seed";
import { loadSnapshot, saveSnapshot } from "../lib/cache";
import type {
  AppSnapshot,
  Bill,
  DeliveryStatus,
  EnquiryHistoryEntry,
  GatePass,
  GatePassBag,
  PriceEntryMode,
  Product,
  PurchaseDraft,
  RegisterItem,
  Session,
  StockReason,
  WeightType
} from "../types";

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function calcRatePerKg(totalPrice: number, unitsBought: number, weightPerUnitKg: number) {
  if (!unitsBought || !weightPerUnitKg) return 0;
  return Number((totalPrice / unitsBought / weightPerUnitKg).toFixed(2));
}

interface UpdateStockInput {
  productId: string;
  newQty: number;
  reason: StockReason;
  notes?: string;
}

interface EnquiryInput {
  productId: string;
  distributorId: string;
  quotedRatePerUnit: number;
  weightPerUnitKg: number;
  enquiryDate: string;
  source: EnquiryHistoryEntry["source"];
  notes?: string;
  sessionId?: string;
}

interface SavePurchaseInput {
  sessionId: string;
  distributorId: string;
  billNumber: string;
  billDate: string;
  items: Array<{
    productId: string;
    unitsBought: number;
    totalPrice: number;
    ratePerUnit: number;
    weightPerUnitKg: number;
    weightType: WeightType;
    priceMode: PriceEntryMode;
  }>;
}

interface GenerateGatePassInput {
  bags: GatePassBag[];
  courierFeePerBag?: number;
  courierFeeOverride?: number;
  courierNote?: string;
}

interface AppDataContextValue {
  snapshot: AppSnapshot;
  isLoaded: boolean;
  purchaseDraft: PurchaseDraft | null;
  activeSession: Session;
  selectedSessionId: string;
  setSelectedSessionId: (sessionId: string) => void;
  createSession: (input?: { name?: string; date?: string; openingBalance?: number }) => string;
  removeSession: (sessionId: string) => void;
  updateStock: (input: UpdateStockInput) => void;
  setSessionBasics: (name: string, date: string) => void;
  setSessionOpeningBalance: (amount: number) => void;
  setSessionClosingBalance: (amount?: number) => void;
  addRegisterItem: (productId: string, qtyRequired?: number) => void;
  updateRegisterItem: (id: string, patch: Partial<RegisterItem>) => void;
  removeRegisterItem: (id: string) => void;
  addEnquiry: (input: EnquiryInput) => void;
  savePurchaseDraft: (input: SavePurchaseInput) => void;
  clearPurchaseDraft: () => void;
  generateGatePassFromDraft: (input: GenerateGatePassInput) => string | null;
  updateCourierRate: (gatePassId: string, rate: number) => void;
  updateDeliveryStatus: (distributorId: string, productId: string, receivedQty: number, status: DeliveryStatus) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initialSnapshot);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(() => initialSnapshot.sessions[0]?.id ?? "");

  useEffect(() => {
    let isMounted = true;
    loadSnapshot()
      .then((cached) => {
        if (cached && isMounted) {
          setSnapshot(cached);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void saveSnapshot(snapshot);
  }, [isLoaded, snapshot]);

  const activeSession = useMemo(() => {
    return (
      snapshot.sessions.find((session) => session.id === selectedSessionId) ??
      snapshot.sessions.find((session) => session.status === "open") ??
      snapshot.sessions[0]
    );
  }, [selectedSessionId, snapshot.sessions]);

  useEffect(() => {
    if (!snapshot.sessions.length) return;
    if (selectedSessionId && snapshot.sessions.some((session) => session.id === selectedSessionId)) return;
    setSelectedSessionId(snapshot.sessions.find((session) => session.status === "open")?.id ?? snapshot.sessions[0].id);
  }, [selectedSessionId, snapshot.sessions]);

  const value = useMemo<AppDataContextValue>(() => {
    return {
      snapshot,
      isLoaded,
      purchaseDraft,
      activeSession,
      selectedSessionId,
      setSelectedSessionId,
      createSession: (input) => {
        const id = makeId("session");
        const now = new Date();
        const date = input?.date ?? now.toISOString().slice(0, 10);
        const session: Session = {
          id,
          name: input?.name?.trim() || `Session ${snapshot.sessions.length + 1}`,
          date,
          status: "open",
          openingBalance: input?.openingBalance ?? 30000
        };
        setSnapshot((current) => ({
          ...current,
          sessions: [session, ...current.sessions]
        }));
        setSelectedSessionId(id);
        return id;
      },
      removeSession: (sessionId) => {
        setSnapshot((current) => ({
          ...current,
          sessions: current.sessions.filter((session) => session.id !== sessionId),
          registerItems: current.registerItems.filter((item) => item.sessionId !== sessionId)
        }));
      },
      updateStock: ({ productId, newQty, reason, notes }) => {
        setSnapshot((current) => {
          const products = current.products.map((product) =>
            product.id === productId ? { ...product, currentStockQty: newQty } : product
          );
          const previousQty = current.products.find((product) => product.id === productId)?.currentStockQty ?? 0;
          return {
            ...current,
            products,
            stockLog: [
              {
                id: makeId("stock"),
                productId,
                previousQty,
                newQty,
                reason,
                notes,
                updatedAt: Date.now()
              },
              ...current.stockLog
            ]
          };
        });
      },
      setSessionBasics: (name, date) => {
        setSnapshot((current) => ({
          ...current,
          sessions: current.sessions.map((session) =>
            session.id === activeSession.id ? { ...session, name, date } : session
          )
        }));
      },
      setSessionOpeningBalance: (amount) => {
        setSnapshot((current) => ({
          ...current,
          sessions: current.sessions.map((session) =>
            session.id === activeSession.id ? { ...session, openingBalance: amount } : session
          )
        }));
      },
      setSessionClosingBalance: (amount) => {
        setSnapshot((current) => ({
          ...current,
          sessions: current.sessions.map((session) =>
            session.id === activeSession.id ? { ...session, closingBalance: amount } : session
          )
        }));
      },
      addRegisterItem: (productId, qtyRequired = 1) => {
        setSnapshot((current) => {
          if (current.registerItems.some((item) => item.productId === productId && item.sessionId === activeSession.id)) {
            return current;
          }
          return {
            ...current,
            registerItems: [
              ...current.registerItems,
              {
                id: makeId("register"),
                sessionId: activeSession.id,
                productId,
                qtyRequired
              }
            ]
          };
        });
      },
      updateRegisterItem: (id, patch) => {
        setSnapshot((current) => ({
          ...current,
          registerItems: current.registerItems.map((item) => (item.id === id ? { ...item, ...patch } : item))
        }));
      },
      removeRegisterItem: (id) => {
        setSnapshot((current) => ({
          ...current,
          registerItems: current.registerItems.filter((item) => item.id !== id)
        }));
      },
      addEnquiry: (input) => {
        setSnapshot((current) => ({
          ...current,
          enquiryHistory: [
            {
              id: makeId("enquiry"),
              quotedRatePerKg: input.weightPerUnitKg
                ? Number((input.quotedRatePerUnit / input.weightPerUnitKg).toFixed(2))
                : undefined,
              ...input
            },
            ...current.enquiryHistory
          ]
        }));
      },
      savePurchaseDraft: (input) => {
        setPurchaseDraft({
          sessionId: input.sessionId,
          distributorId: input.distributorId,
          billNumber: input.billNumber,
          billDate: input.billDate,
          items: input.items
        });
      },
      clearPurchaseDraft: () => setPurchaseDraft(null),
      generateGatePassFromDraft: ({ bags, courierFeePerBag, courierFeeOverride, courierNote }) => {
        if (!purchaseDraft) return null;

        const billId = makeId("bill");
        const newBillItems = purchaseDraft.items.map((item) => ({
          id: makeId("billitem"),
          productId: item.productId,
          unitsBought: item.unitsBought,
          totalPrice: item.totalPrice,
          ratePerUnit: item.ratePerUnit,
          weightPerUnitKg: item.weightPerUnitKg,
          ratePerKg: calcRatePerKg(item.totalPrice, item.unitsBought, item.weightPerUnitKg),
          weightType: item.weightType
        }));

        const newBill: Bill = {
          id: billId,
          sessionId: purchaseDraft.sessionId,
          distributorId: purchaseDraft.distributorId,
          billNumber: purchaseDraft.billNumber,
          billDate: purchaseDraft.billDate,
          totalAmount: newBillItems.reduce((sum, item) => sum + item.totalPrice, 0),
          items: newBillItems
        };

        const bagCount = bags.length;
        const feeTotal = courierFeeOverride ?? (courierFeePerBag ?? 0) * bagCount;
        const gatePassId = makeId("gatepass");
        const gatePass: GatePass = {
          id: gatePassId,
          billId,
          distributorId: purchaseDraft.distributorId,
          sessionId: purchaseDraft.sessionId,
          courierFeePerBag,
          courierFeeTotal: feeTotal,
          courierNote,
          generatedAt: Date.now(),
          bags: bags.map((bag, index) => ({
            ...bag,
            id: makeId("bag"),
            bagNumber: index + 1
          }))
        };

        setSnapshot((current) => {
          const historyEntries = newBill.items.map((item) => ({
            id: makeId("purchase"),
            productId: item.productId,
            distributorId: newBill.distributorId,
            billId: newBill.id,
            sessionId: purchaseDraft.sessionId,
            ratePerUnit: item.ratePerUnit,
            ratePerKg: item.ratePerKg,
            purchaseDate: newBill.billDate,
            unitsBought: item.unitsBought,
            totalPrice: item.totalPrice
          }));

          return {
            ...current,
            bills: [newBill, ...current.bills],
            gatePasses: [gatePass, ...current.gatePasses],
            purchaseHistory: [...historyEntries, ...current.purchaseHistory]
          };
        });

        setPurchaseDraft(null);
        return gatePassId;
      },
      updateCourierRate: (gatePassId, rate) => {
        setSnapshot((current) => ({
          ...current,
          gatePasses: current.gatePasses.map((gatePass) =>
            gatePass.id === gatePassId
              ? {
                  ...gatePass,
                  courierFeePerBag: rate,
                  courierFeeTotal: rate * gatePass.bags.length
                }
              : gatePass
          )
        }));
      },
      updateDeliveryStatus: (distributorId, productId, receivedQty, status) => {
        setSnapshot((current) => {
          const product = current.products.find((entry) => entry.id === productId);
          const verification = current.deliveryVerifications.find(
            (entry) => entry.distributorId === distributorId && entry.sessionId === activeSession.id
          );
          const verificationItem = verification?.items.find((item) => item.productId === productId);
          const previousReceivedQty = verificationItem?.receivedQty ?? 0;
          const delta = receivedQty - previousReceivedQty;
          return {
            ...current,
            products: current.products.map((entry) =>
              entry.id === productId ? { ...entry, currentStockQty: entry.currentStockQty + delta } : entry
            ),
            deliveryVerifications: current.deliveryVerifications.map((entry) =>
              entry.id === verification?.id
                ? {
                    ...entry,
                    verifiedAt: Date.now(),
                    items: entry.items.map((item) =>
                      item.productId === productId ? { ...item, receivedQty, status } : item
                    )
                  }
                : entry
            ),
            stockLog: product
              ? [
                  {
                    id: makeId("stock"),
                    productId,
                    previousQty: product.currentStockQty,
                    newQty: product.currentStockQty + delta,
                    reason: "received",
                    notes: `Delivery ${status}`,
                    updatedAt: Date.now()
                  },
                  ...current.stockLog
                ]
              : current.stockLog
          };
        });
      }
    };
  }, [activeSession, isLoaded, purchaseDraft, selectedSessionId, snapshot]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return context;
}
