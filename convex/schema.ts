import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("owner"), v.literal("staff")),
    isActive: v.boolean(),
    createdAt: v.number()
  }).index("by_email", ["email"]),

  products: defineTable({
    name: v.string(),
    unitLabel: v.string(),
    weightPerUnitKg: v.number(),
    currentStockQty: v.number(),
    minStockAlert: v.number(),
    createdAt: v.number()
  }).index("by_name", ["name"]),

  distributors: defineTable({
    name: v.string(),
    shortCode: v.string(),
    phone: v.optional(v.string()),
    area: v.optional(v.string()),
    isActive: v.boolean()
  })
    .index("by_name", ["name"])
    .index("by_shortCode", ["shortCode"]),

  productDistributors: defineTable({
    productId: v.id("products"),
    distributorId: v.id("distributors")
  })
    .index("by_product", ["productId"])
    .index("by_distributor", ["distributorId"]),

  sessions: defineTable({
    name: v.string(),
    date: v.string(),
    status: v.union(v.literal("open"), v.literal("closed")),
    openingBalance: v.number(),
    closingBalance: v.optional(v.number()),
    totalSpent: v.number(),
    courierTotal: v.number(),
    notes: v.optional(v.string())
  })
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  purchaseRequirements: defineTable({
    sessionId: v.id("sessions"),
    productId: v.id("products"),
    qtyRequired: v.number(),
    preferredDistributorId: v.optional(v.id("distributors")),
    notes: v.optional(v.string())
  })
    .index("by_session", ["sessionId"])
    .index("by_product", ["productId"]),

  bills: defineTable({
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    totalAmount: v.number()
  })
    .index("by_session", ["sessionId"])
    .index("by_distributor", ["distributorId"]),

  billItems: defineTable({
    billId: v.id("bills"),
    productId: v.id("products"),
    unitsBought: v.number(),
    totalPrice: v.number(),
    ratePerUnit: v.number(),
    weightPerUnitKg: v.number(),
    ratePerKg: v.number(),
    weightType: v.union(v.literal("kg"), v.literal("box"), v.literal("litre"))
  })
    .index("by_bill", ["billId"])
    .index("by_product", ["productId"]),

  gatePasses: defineTable({
    billId: v.id("bills"),
    distributorId: v.id("distributors"),
    sessionId: v.id("sessions"),
    courierFeePerBag: v.optional(v.number()),
    courierFeeTotal: v.number(),
    courierNote: v.optional(v.string()),
    generatedAt: v.number()
  })
    .index("by_bill", ["billId"])
    .index("by_session", ["sessionId"])
    .index("by_distributor", ["distributorId"]),

  gatePassBags: defineTable({
    gatePassId: v.id("gatePasses"),
    bagNumber: v.number(),
    totalWeightKg: v.number(),
    sealLabel: v.optional(v.string()),
    isBundled: v.boolean()
  }).index("by_gatePass", ["gatePassId"]),

  gatePassBagItems: defineTable({
    bagId: v.id("gatePassBags"),
    billItemId: v.id("billItems"),
    unitsInBag: v.number()
  })
    .index("by_bag", ["bagId"])
    .index("by_billItem", ["billItemId"]),

  purchasePriceHistory: defineTable({
    productId: v.id("products"),
    distributorId: v.id("distributors"),
    billId: v.id("bills"),
    sessionId: v.id("sessions"),
    ratePerUnit: v.number(),
    ratePerKg: v.number(),
    purchaseDate: v.string(),
    unitsBought: v.number(),
    totalPrice: v.number()
  })
    .index("by_product", ["productId"])
    .index("by_distributor", ["distributorId"])
    .index("by_session", ["sessionId"]),

  enquiryPriceHistory: defineTable({
    productId: v.id("products"),
    distributorId: v.id("distributors"),
    quotedRatePerUnit: v.number(),
    quotedRatePerKg: v.optional(v.number()),
    weightPerUnitKg: v.optional(v.number()),
    enquiryDate: v.string(),
    enquiredBy: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(
      v.literal("phone"),
      v.literal("visit"),
      v.literal("whatsapp"),
      v.literal("other")
    ),
    sessionId: v.optional(v.id("sessions"))
  })
    .index("by_product", ["productId"])
    .index("by_distributor", ["distributorId"])
    .index("by_session", ["sessionId"]),

  stockLog: defineTable({
    productId: v.id("products"),
    previousQty: v.number(),
    newQty: v.number(),
    reason: v.union(
      v.literal("manual_count"),
      v.literal("sale"),
      v.literal("damage"),
      v.literal("received")
    ),
    notes: v.optional(v.string()),
    updatedAt: v.number()
  }).index("by_product", ["productId"]),

  deliveryVerifications: defineTable({
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    productId: v.id("products"),
    expectedQty: v.number(),
    receivedQty: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("match"), v.literal("shortage")),
    notes: v.optional(v.string()),
    verifiedBy: v.optional(v.string()),
    verifiedAt: v.optional(v.number())
  })
    .index("by_session", ["sessionId"])
    .index("by_distributor", ["distributorId"])
    .index("by_product", ["productId"])
});
