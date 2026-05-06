import type {
  AppSnapshot,
  Bill,
  DeliveryVerification,
  Distributor,
  EnquiryHistoryEntry,
  GatePass,
  Product,
  PurchaseHistoryEntry,
  RegisterItem,
  Session,
  StockLogEntry
} from "../types";

export const currentUser = {
  id: "user-owner-1",
  name: "Aditya",
  role: "owner" as const
};

export const products: Product[] = [
  {
    id: "prod-rice",
    name: "Basmati Rice",
    unitLabel: "bag",
    weightPerUnitKg: 25,
    currentStockQty: 12,
    minStockAlert: 10,
    linkedDistributorIds: ["dist-a", "dist-b", "dist-c", "dist-d", "dist-e"]
  },
  {
    id: "prod-wheat",
    name: "Wheat Flour",
    unitLabel: "bag",
    weightPerUnitKg: 50,
    currentStockQty: 4,
    minStockAlert: 8,
    linkedDistributorIds: ["dist-a", "dist-b", "dist-c"]
  },
  {
    id: "prod-oil",
    name: "Cooking Oil",
    unitLabel: "tin",
    weightPerUnitKg: 15,
    currentStockQty: 3,
    minStockAlert: 5,
    linkedDistributorIds: ["dist-a", "dist-c"]
  },
  {
    id: "prod-sugar",
    name: "Sugar",
    unitLabel: "bag",
    weightPerUnitKg: 50,
    currentStockQty: 18,
    minStockAlert: 10,
    linkedDistributorIds: ["dist-a", "dist-c"]
  },
  {
    id: "prod-dal",
    name: "Toor Dal",
    unitLabel: "bag",
    weightPerUnitKg: 30,
    currentStockQty: 9,
    minStockAlert: 7,
    linkedDistributorIds: ["dist-b", "dist-d"]
  },
  {
    id: "prod-salt",
    name: "Salt",
    unitLabel: "bag",
    weightPerUnitKg: 25,
    currentStockQty: 21,
    minStockAlert: 8,
    linkedDistributorIds: ["dist-c"]
  }
];

export const distributors: Distributor[] = [
  { id: "dist-a", name: "Sri Venkata Traders", shortCode: "A", area: "Hyderabad", phone: "9876543210", isActive: true },
  { id: "dist-b", name: "Raju Wholesale", shortCode: "B", area: "Secunderabad", phone: "9876543201", isActive: true },
  { id: "dist-c", name: "Lakshmi Agencies", shortCode: "C", area: "Begumpet", phone: "9876543202", isActive: true },
  { id: "dist-d", name: "Kumar Traders", shortCode: "D", area: "Balanagar", phone: "9876543203", isActive: true },
  { id: "dist-e", name: "Navya Supplies", shortCode: "E", area: "Kompally", phone: "9876543204", isActive: true }
];

export const sessions: Session[] = [
  {
    id: "session-0024",
    name: "Morning trip",
    date: "2026-05-03",
    status: "open",
    openingBalance: 30000
  }
];

export const registerItems: RegisterItem[] = [
  {
    id: "reg-wheat",
    sessionId: "session-0024",
    productId: "prod-wheat",
    qtyRequired: 10,
    preferredDistributorId: "dist-b",
    notes: "Check for fresh stock"
  },
  {
    id: "reg-oil",
    sessionId: "session-0024",
    productId: "prod-oil",
    qtyRequired: 12,
    preferredDistributorId: "dist-a",
    notes: ""
  },
  {
    id: "reg-rice",
    sessionId: "session-0024",
    productId: "prod-rice",
    qtyRequired: 5,
    preferredDistributorId: "dist-a",
    notes: "Take premium grain"
  }
];

export const bills: Bill[] = [
  {
    id: "bill-sv-0051",
    sessionId: "session-0024",
    distributorId: "dist-a",
    billNumber: "SV-0051",
    billDate: "2026-05-03",
    totalAmount: 15950,
    items: [
      {
        id: "billitem-oil-1",
        productId: "prod-oil",
        unitsBought: 12,
        totalPrice: 14400,
        ratePerUnit: 1200,
        weightPerUnitKg: 15,
        ratePerKg: 80,
        weightType: "kg"
      },
      {
        id: "billitem-rice-1",
        productId: "prod-rice",
        unitsBought: 5,
        totalPrice: 1550,
        ratePerUnit: 310,
        weightPerUnitKg: 25,
        ratePerKg: 12.4,
        weightType: "kg"
      }
    ]
  },
  {
    id: "bill-rw-0088",
    sessionId: "session-0024",
    distributorId: "dist-b",
    billNumber: "RW-0088",
    billDate: "2026-05-03",
    totalAmount: 4800,
    items: [
      {
        id: "billitem-wheat-1",
        productId: "prod-wheat",
        unitsBought: 10,
        totalPrice: 4800,
        ratePerUnit: 480,
        weightPerUnitKg: 50,
        ratePerKg: 9.6,
        weightType: "kg"
      }
    ]
  },
  {
    id: "bill-la-0112",
    sessionId: "session-0024",
    distributorId: "dist-c",
    billNumber: "LA-112",
    billDate: "2026-05-03",
    totalAmount: 3600,
    items: [
      {
        id: "billitem-sugar-1",
        productId: "prod-sugar",
        unitsBought: 6,
        totalPrice: 3600,
        ratePerUnit: 600,
        weightPerUnitKg: 50,
        ratePerKg: 12,
        weightType: "kg"
      }
    ]
  }
];

export const gatePasses: GatePass[] = [
  {
    id: "gp-sv-0051",
    billId: "bill-sv-0051",
    distributorId: "dist-a",
    sessionId: "session-0024",
    courierFeePerBag: 30,
    courierFeeTotal: 120,
    courierNote: "Handle oil tins carefully.",
    generatedAt: new Date("2026-05-03T10:15:00").getTime(),
    bags: [
      {
        id: "bag-1",
        bagNumber: 1,
        totalWeightKg: 45,
        sealLabel: "",
        isBundled: true,
        items: [
          { id: "bagitem-1", billItemId: "billitem-oil-1", productId: "prod-oil", unitsInBag: 2 },
          { id: "bagitem-2", billItemId: "billitem-rice-1", productId: "prod-rice", unitsInBag: 1 }
        ]
      },
      {
        id: "bag-2",
        bagNumber: 2,
        totalWeightKg: 75,
        sealLabel: "",
        isBundled: false,
        items: [{ id: "bagitem-3", billItemId: "billitem-oil-1", productId: "prod-oil", unitsInBag: 5 }]
      },
      {
        id: "bag-3",
        bagNumber: 3,
        totalWeightKg: 75,
        sealLabel: "",
        isBundled: false,
        items: [{ id: "bagitem-4", billItemId: "billitem-oil-1", productId: "prod-oil", unitsInBag: 5 }]
      },
      {
        id: "bag-4",
        bagNumber: 4,
        totalWeightKg: 100,
        sealLabel: "",
        isBundled: false,
        items: [{ id: "bagitem-5", billItemId: "billitem-rice-1", productId: "prod-rice", unitsInBag: 4 }]
      }
    ]
  },
  {
    id: "gp-rw-0088",
    billId: "bill-rw-0088",
    distributorId: "dist-b",
    sessionId: "session-0024",
    courierFeePerBag: 30,
    courierFeeTotal: 300,
    courierNote: "Keep flour away from moisture.",
    generatedAt: new Date("2026-05-03T11:10:00").getTime(),
    bags: Array.from({ length: 10 }, (_, index) => ({
      id: `rw-bag-${index + 1}`,
      bagNumber: index + 1,
      totalWeightKg: 50,
      sealLabel: "",
      isBundled: false,
      items: [
        {
          id: `rw-bag-item-${index + 1}`,
          billItemId: "billitem-wheat-1",
          productId: "prod-wheat",
          unitsInBag: 1
        }
      ]
    }))
  }
];

export const purchaseHistory: PurchaseHistoryEntry[] = [
  {
    id: "ph-rice-1",
    productId: "prod-rice",
    distributorId: "dist-a",
    billId: "bill-sv-0051",
    sessionId: "session-0024",
    ratePerUnit: 310,
    ratePerKg: 12.4,
    purchaseDate: "2026-04-15",
    unitsBought: 5,
    totalPrice: 1550
  },
  {
    id: "ph-rice-2",
    productId: "prod-rice",
    distributorId: "dist-b",
    billId: "bill-rw-old",
    sessionId: "session-0023",
    ratePerUnit: 305,
    ratePerKg: 12.2,
    purchaseDate: "2026-04-02",
    unitsBought: 4,
    totalPrice: 1220
  },
  {
    id: "ph-rice-3",
    productId: "prod-rice",
    distributorId: "dist-a",
    billId: "bill-sv-old",
    sessionId: "session-0022",
    ratePerUnit: 298,
    ratePerKg: 11.9,
    purchaseDate: "2026-03-20",
    unitsBought: 5,
    totalPrice: 1490
  },
  {
    id: "ph-wheat-1",
    productId: "prod-wheat",
    distributorId: "dist-b",
    billId: "bill-rw-0088",
    sessionId: "session-0024",
    ratePerUnit: 480,
    ratePerKg: 9.6,
    purchaseDate: "2026-04-10",
    unitsBought: 10,
    totalPrice: 4800
  },
  {
    id: "ph-wheat-2",
    productId: "prod-wheat",
    distributorId: "dist-c",
    billId: "bill-la-old",
    sessionId: "session-0021",
    ratePerUnit: 475,
    ratePerKg: 9.5,
    purchaseDate: "2026-03-28",
    unitsBought: 8,
    totalPrice: 3800
  },
  {
    id: "ph-oil-1",
    productId: "prod-oil",
    distributorId: "dist-a",
    billId: "bill-sv-0051",
    sessionId: "session-0024",
    ratePerUnit: 1200,
    ratePerKg: 80,
    purchaseDate: "2026-04-12",
    unitsBought: 12,
    totalPrice: 14400
  },
  {
    id: "ph-oil-2",
    productId: "prod-oil",
    distributorId: "dist-c",
    billId: "bill-la-oil",
    sessionId: "session-0020",
    ratePerUnit: 1180,
    ratePerKg: 78.7,
    purchaseDate: "2026-03-22",
    unitsBought: 6,
    totalPrice: 7080
  }
];

export const enquiryHistory: EnquiryHistoryEntry[] = [
  {
    id: "eq-rice-1",
    productId: "prod-rice",
    distributorId: "dist-d",
    quotedRatePerUnit: 295,
    quotedRatePerKg: 11.8,
    weightPerUnitKg: 25,
    enquiryDate: "2026-04-30",
    source: "phone"
  },
  {
    id: "eq-rice-2",
    productId: "prod-rice",
    distributorId: "dist-c",
    quotedRatePerUnit: 300,
    quotedRatePerKg: 12,
    weightPerUnitKg: 25,
    enquiryDate: "2026-04-28",
    source: "whatsapp",
    notes: "bulk rate"
  },
  {
    id: "eq-rice-3",
    productId: "prod-rice",
    distributorId: "dist-b",
    quotedRatePerUnit: 302,
    quotedRatePerKg: 12.08,
    weightPerUnitKg: 25,
    enquiryDate: "2026-04-15",
    source: "visit"
  },
  {
    id: "eq-wheat-1",
    productId: "prod-wheat",
    distributorId: "dist-a",
    quotedRatePerUnit: 468,
    quotedRatePerKg: 9.36,
    weightPerUnitKg: 50,
    enquiryDate: "2026-04-25",
    source: "visit"
  },
  {
    id: "eq-oil-1",
    productId: "prod-oil",
    distributorId: "dist-c",
    quotedRatePerUnit: 1150,
    quotedRatePerKg: 76.67,
    weightPerUnitKg: 15,
    enquiryDate: "2026-05-01",
    source: "whatsapp"
  }
];

export const stockLog: StockLogEntry[] = [
  {
    id: "stock-1",
    productId: "prod-rice",
    previousQty: 14,
    newQty: 12,
    reason: "manual_count",
    notes: "Morning physical count",
    updatedAt: new Date("2026-05-03T08:15:00").getTime()
  }
];

export const deliveryVerifications: DeliveryVerification[] = [
  {
    id: "verify-a",
    sessionId: "session-0024",
    distributorId: "dist-a",
    items: [
      { productId: "prod-oil", expectedQty: 12, status: "pending" },
      { productId: "prod-rice", expectedQty: 5, status: "pending" }
    ]
  }
];

export const initialSnapshot: AppSnapshot = {
  products,
  distributors,
  sessions,
  registerItems,
  purchaseHistory,
  enquiryHistory,
  bills,
  gatePasses,
  stockLog,
  deliveryVerifications
};
