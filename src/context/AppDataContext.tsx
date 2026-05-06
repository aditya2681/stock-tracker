import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  AppSnapshot,
  DeliveryStatus,
  EnquiryHistoryEntry,
  GatePassBag,
  PriceEntryMode,
  PurchaseDraft,
  RegisterItem,
  Session,
  StockReason,
  WeightType
} from "../types";

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
  createSession: (input?: { name?: string; date?: string; openingBalance?: number }) => void | Promise<void>;
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
  generateGatePassFromDraft: (input: GenerateGatePassInput) => Promise<string | null> | string | null;
  updateCourierRate: (gatePassId: string, rate: number) => void;
  updateDeliveryStatus: (distributorId: string, productId: string, receivedQty: number, status: DeliveryStatus) => Promise<void> | void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function ConvexAppDataProvider({ children }: PropsWithChildren) {
  const liveSnapshot = useQuery((api as any).app.snapshot, {}) as AppSnapshot | undefined;
  const createSessionMutation = useMutation((api as any).sessions.create);
  const updateSessionBasicsMutation = useMutation((api as any).sessions.updateBasics);
  const updateSessionBalancesMutation = useMutation((api as any).sessions.updateBalances);
  const removeSessionMutation = useMutation((api as any).sessions.remove);
  const updateStockMutation = useMutation((api as any).products.updateStock);
  const upsertRegisterMutation = useMutation((api as any).register.upsert);
  const removeRegisterMutation = useMutation((api as any).register.remove);
  const addEnquiryMutation = useMutation((api as any).priceHistory.logEnquiry);
  const finalizePurchaseMutation = useMutation((api as any).purchases.finalizeWithGatePass);
  const updateCourierRateMutation = useMutation((api as any).gatePasses.updateCourierRate);
  const updateDeliveryStatusMutation = useMutation((api as any).deliveryVerification.markForSession);

  const emptySnapshot: AppSnapshot = useMemo(
    () => ({
      products: [],
      distributors: [],
      sessions: [],
      registerItems: [],
      purchaseHistory: [],
      enquiryHistory: [],
      bills: [],
      gatePasses: [],
      stockLog: [],
      deliveryVerifications: []
    }),
    []
  );
  const snapshot = liveSnapshot ?? emptySnapshot;
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const isLoaded = Boolean(liveSnapshot);

  const activeSession = useMemo(() => {
    return (
      snapshot.sessions.find((session) => session.id === selectedSessionId) ??
      snapshot.sessions.find((session) => session.status === "open") ?? {
        id: "",
        name: "No session",
        date: new Date().toISOString().slice(0, 10),
        status: "open" as const,
        openingBalance: 0
      }
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
      createSession: async (input) => {
        const id = await createSessionMutation({
          name: input?.name?.trim() || `Session ${snapshot.sessions.length + 1}`,
          date: input?.date ?? new Date().toISOString().slice(0, 10),
          openingBalance: input?.openingBalance ?? 30000
        });
        setSelectedSessionId(String(id));
      },
      removeSession: (sessionId) => {
        void removeSessionMutation({ sessionId: sessionId as never });
      },
      updateStock: ({ productId, newQty, reason, notes }) => {
        void updateStockMutation({
          productId: productId as never,
          newQty,
          reason,
          notes
        });
      },
      setSessionBasics: (name, date) => {
        if (!activeSession.id) return;
        void updateSessionBasicsMutation({
          sessionId: activeSession.id as never,
          name,
          date
        });
      },
      setSessionOpeningBalance: (amount) => {
        if (!activeSession.id) return;
        void updateSessionBalancesMutation({
          sessionId: activeSession.id as never,
          openingBalance: amount
        });
      },
      setSessionClosingBalance: (amount) => {
        if (!activeSession.id) return;
        void updateSessionBalancesMutation({
          sessionId: activeSession.id as never,
          closingBalance: amount
        });
      },
      addRegisterItem: (productId, qtyRequired = 1) => {
        if (!activeSession.id) return;
        const existing = snapshot.registerItems.find(
          (item) => item.sessionId === activeSession.id && item.productId === productId
        );
        void upsertRegisterMutation({
          id: existing?.id ? (existing.id as never) : undefined,
          sessionId: activeSession.id as never,
          productId: productId as never,
          qtyRequired,
          notes: existing?.notes
        });
      },
      updateRegisterItem: (id, patch) => {
        const existing = snapshot.registerItems.find((item) => item.id === id);
        if (!existing) return;
        void upsertRegisterMutation({
          id: id as never,
          sessionId: (patch.sessionId ?? existing.sessionId) as never,
          productId: (patch.productId ?? existing.productId) as never,
          qtyRequired: patch.qtyRequired ?? existing.qtyRequired,
          notes: patch.notes ?? existing.notes
        });
      },
      removeRegisterItem: (id) => {
        void removeRegisterMutation({ id: id as never });
      },
      addEnquiry: (input) => {
        void addEnquiryMutation({
          productId: input.productId as never,
          distributorId: input.distributorId as never,
          quotedRatePerUnit: input.quotedRatePerUnit,
          weightPerUnitKg: input.weightPerUnitKg,
          enquiryDate: input.enquiryDate,
          source: input.source,
          notes: input.notes
        });
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
      generateGatePassFromDraft: async ({ bags, courierFeePerBag, courierFeeOverride, courierNote }) => {
        if (!purchaseDraft) return null;
        const gatePassId = await finalizePurchaseMutation({
          sessionId: purchaseDraft.sessionId as never,
          distributorId: purchaseDraft.distributorId as never,
          billNumber: purchaseDraft.billNumber,
          billDate: purchaseDraft.billDate,
          items: purchaseDraft.items.map((item) => ({
            productId: item.productId as never,
            unitsBought: item.unitsBought,
            totalPrice: item.totalPrice,
            ratePerUnit: item.ratePerUnit,
            weightPerUnitKg: item.weightPerUnitKg,
            weightType: item.weightType,
            priceMode: item.priceMode
          })),
          bags: bags.map((bag, index) => ({
            bagNumber: bag.bagNumber || index + 1,
            totalWeightKg: bag.totalWeightKg,
            sealLabel: bag.sealLabel,
            isBundled: bag.isBundled,
            items: bag.items.map((item) => ({
              productId: item.productId as never,
              unitsInBag: item.unitsInBag
            }))
          })),
          courierFeePerBag,
          courierFeeOverride,
          courierNote
        });
        setPurchaseDraft(null);
        return String(gatePassId);
      },
      updateCourierRate: (gatePassId, rate) => {
        void updateCourierRateMutation({
          gatePassId: gatePassId as never,
          rate
        });
      },
      updateDeliveryStatus: async (distributorId, productId, receivedQty, status) => {
        if (!activeSession.id) return;
        await updateDeliveryStatusMutation({
          sessionId: activeSession.id as never,
          distributorId: distributorId as never,
          productId: productId as never,
          receivedQty,
          status
        });
      }
    };
  }, [
    activeSession,
    addEnquiryMutation,
    createSessionMutation,
    finalizePurchaseMutation,
    isLoaded,
    purchaseDraft,
    removeRegisterMutation,
    removeSessionMutation,
    selectedSessionId,
    snapshot,
    updateCourierRateMutation,
    updateDeliveryStatusMutation,
    updateSessionBalancesMutation,
    updateSessionBasicsMutation,
    updateStockMutation,
    upsertRegisterMutation
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function AppDataProvider({ children }: PropsWithChildren) {
  return <ConvexAppDataProvider>{children}</ConvexAppDataProvider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return context;
}
