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

interface MultiEnquiryInput {
  distributorId: string;
  enquiries: EnquiryInput[];
}

interface SavePurchaseInput {
  sessionId: string;
  distributorId: string;
  billNumber: string;
  billDate: string;
  manualTotalAmount?: number;
  quickEntry?: boolean;
  editingBillId?: string;
  editingGatePassId?: string;
  items: Array<{
    productId: string;
    unitsBought: number;
    unitsPerBag?: number;
    totalPrice: number;
    ratePerUnit: number;
    weightPerUnitKg: number;
    weightType: WeightType;
    priceMode: PriceEntryMode;
  }>;
}

interface GenerateGatePassInput {
  manualTotalAmount?: number;
  bags: Array<{
    bagNumber: number;
    totalWeightKg: number;
    sealLabel?: string;
    isBundled: boolean;
    items: Array<{
      productId: string;
      unitsInBag: number;
    }>;
  }>;
  courierFeePerBag?: number;
  courierFeeOverride?: number;
  courierNote?: string;
  smallBagCount?: number;
  bigBagCount?: number;
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
  addManyEnquiries: (input: MultiEnquiryInput) => void;
  savePurchaseDraft: (input: SavePurchaseInput) => void;
  clearPurchaseDraft: () => void;
  beginBillEdit: (billId: string) => void;
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
  const addManyEnquiriesMutation = useMutation((api as any).priceHistory.logManyEnquiries);
  const finalizePurchaseMutation = useMutation((api as any).purchases.finalizeWithGatePass);
  const updatePurchaseMutation = useMutation((api as any).purchases.updateFinalizedBill);
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
      addManyEnquiries: (input) => {
        void addManyEnquiriesMutation({
          distributorId: input.distributorId as never,
          enquiries: input.enquiries.map((entry) => ({
            productId: entry.productId as never,
            quotedRatePerUnit: entry.quotedRatePerUnit,
            weightPerUnitKg: entry.weightPerUnitKg,
            enquiryDate: entry.enquiryDate,
            source: entry.source,
            notes: entry.notes,
            sessionId: entry.sessionId as never
          }))
        });
      },
      savePurchaseDraft: (input) => {
        setPurchaseDraft((current) => ({
          sessionId: input.sessionId,
          distributorId: input.distributorId,
          billNumber: input.billNumber,
          billDate: input.billDate,
          manualTotalAmount: "manualTotalAmount" in input ? input.manualTotalAmount : current?.manualTotalAmount,
          quickEntry: "quickEntry" in input ? input.quickEntry : current?.quickEntry,
          items: input.items,
          editingBillId: "editingBillId" in input ? input.editingBillId : current?.editingBillId,
          editingGatePassId: "editingGatePassId" in input ? input.editingGatePassId : current?.editingGatePassId,
          smallBagCount: current?.smallBagCount,
          bigBagCount: current?.bigBagCount,
          courierNote: current?.courierNote
        }));
      },
      clearPurchaseDraft: () => setPurchaseDraft(null),
      beginBillEdit: (billId) => {
        const bill = snapshot.bills.find((entry) => entry.id === billId);
        if (!bill) return;
        const gatePass = snapshot.gatePasses.find((entry) => entry.billId === bill.id);
        setSelectedSessionId(bill.sessionId);
        setPurchaseDraft({
          sessionId: bill.sessionId,
          distributorId: bill.distributorId,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          manualTotalAmount: bill.totalAmount,
          quickEntry: bill.items.length === 0,
          items: bill.items.map((item) => ({
            productId: item.productId,
            unitsBought: item.unitsBought,
            unitsPerBag: item.unitsPerBag,
            weightPerUnitKg: item.weightPerUnitKg,
            priceMode: "total",
            totalPrice: item.totalPrice,
            ratePerUnit: item.ratePerUnit,
            weightType: item.weightType
          })),
          editingBillId: bill.id,
          editingGatePassId: gatePass?.id,
          smallBagCount: gatePass?.smallBagCount ?? 0,
          bigBagCount: gatePass?.bigBagCount ?? 0,
          courierNote: gatePass?.courierNote ?? ""
        });
      },
      generateGatePassFromDraft: async ({ manualTotalAmount, bags, courierFeePerBag, courierFeeOverride, courierNote, smallBagCount, bigBagCount }) => {
        if (!purchaseDraft) return null;
        const payload = {
          sessionId: purchaseDraft.sessionId as never,
          distributorId: purchaseDraft.distributorId as never,
          billNumber: purchaseDraft.billNumber,
          billDate: purchaseDraft.billDate,
          manualTotalAmount: manualTotalAmount ?? purchaseDraft.manualTotalAmount,
          items: purchaseDraft.items.map((item) => ({
            productId: item.productId as never,
            unitsBought: item.unitsBought,
            unitsPerBag: item.unitsPerBag,
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
          courierNote,
          smallBagCount,
          bigBagCount
        };
        const gatePassId = purchaseDraft.editingBillId
          ? await updatePurchaseMutation({
              billId: purchaseDraft.editingBillId as never,
              gatePassId: purchaseDraft.editingGatePassId as never,
              ...payload
            })
          : await finalizePurchaseMutation(payload);
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
    addManyEnquiriesMutation,
    createSessionMutation,
    finalizePurchaseMutation,
    updatePurchaseMutation,
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
