export type UnitLabel = "bag" | "tin" | "box" | "kg";
export type WeightType = "kg" | "box" | "litre";
export type SessionStatus = "open" | "closed";
export type StockReason = "manual_count" | "sale" | "damage" | "received";
export type EnquirySource = "phone" | "visit" | "whatsapp" | "other";
export type UserRole = "owner" | "staff";
export type DeliveryStatus = "pending" | "match" | "shortage";
export type PriceHistoryFilter = "all" | "purchased" | "enquiries";
export type PriceEntryMode = "total" | "unit";

export interface Product {
  id: string;
  name: string;
  unitLabel: UnitLabel;
  weightPerUnitKg: number;
  currentStockQty: number;
  minStockAlert: number;
  linkedDistributorIds: string[];
}

export interface Distributor {
  id: string;
  name: string;
  shortCode: string;
  phone?: string;
  area?: string;
  isActive: boolean;
}

export interface Session {
  id: string;
  name: string;
  date: string;
  status: SessionStatus;
  openingBalance: number;
  closingBalance?: number;
  notes?: string;
}

export interface RegisterItem {
  id: string;
  sessionId: string;
  productId: string;
  qtyRequired: number;
  preferredDistributorId?: string;
  notes?: string;
}

export interface PurchaseHistoryEntry {
  id: string;
  productId: string;
  distributorId: string;
  billId: string;
  sessionId: string;
  ratePerUnit: number;
  ratePerKg: number;
  purchaseDate: string;
  unitsBought: number;
  totalPrice: number;
}

export interface EnquiryHistoryEntry {
  id: string;
  productId: string;
  distributorId: string;
  quotedRatePerUnit: number;
  quotedRatePerKg?: number;
  weightPerUnitKg?: number;
  enquiryDate: string;
  enquiredBy?: string;
  notes?: string;
  source: EnquirySource;
  sessionId?: string;
}

export interface BillItem {
  id: string;
  productId: string;
  unitsBought: number;
  totalPrice: number;
  ratePerUnit: number;
  weightPerUnitKg: number;
  ratePerKg: number;
  weightType: WeightType;
}

export interface Bill {
  id: string;
  sessionId: string;
  distributorId: string;
  billNumber: string;
  billDate: string;
  totalAmount: number;
  items: BillItem[];
}

export interface GatePassBagItem {
  id: string;
  billItemId: string;
  productId: string;
  unitsInBag: number;
}

export interface GatePassBag {
  id: string;
  bagNumber: number;
  totalWeightKg: number;
  sealLabel?: string;
  isBundled: boolean;
  items: GatePassBagItem[];
}

export interface GatePass {
  id: string;
  billId: string;
  distributorId: string;
  sessionId: string;
  courierFeePerBag?: number;
  courierFeeTotal: number;
  courierNote?: string;
  generatedAt: number;
  bags: GatePassBag[];
}

export interface StockLogEntry {
  id: string;
  productId: string;
  previousQty: number;
  newQty: number;
  reason: StockReason;
  notes?: string;
  updatedAt: number;
}

export interface DeliveryVerificationItem {
  productId: string;
  expectedQty: number;
  receivedQty?: number;
  status: DeliveryStatus;
}

export interface DeliveryVerification {
  id: string;
  sessionId: string;
  distributorId: string;
  items: DeliveryVerificationItem[];
  verifiedAt?: number;
}

export interface PurchaseDraftItem {
  productId: string;
  unitsBought: number;
  weightPerUnitKg: number;
  priceMode: PriceEntryMode;
  totalPrice: number;
  ratePerUnit: number;
  weightType: WeightType;
}

export interface PurchaseDraft {
  sessionId: string;
  distributorId: string;
  billNumber: string;
  billDate: string;
  items: PurchaseDraftItem[];
}

export interface AppSnapshot {
  products: Product[];
  distributors: Distributor[];
  sessions: Session[];
  registerItems: RegisterItem[];
  purchaseHistory: PurchaseHistoryEntry[];
  enquiryHistory: EnquiryHistoryEntry[];
  bills: Bill[];
  gatePasses: GatePass[];
  stockLog: StockLogEntry[];
  deliveryVerifications: DeliveryVerification[];
}
