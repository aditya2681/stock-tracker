import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const finalizeWithGatePass = mutation({
  args: {
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        unitsBought: v.number(),
        totalPrice: v.number(),
        ratePerUnit: v.number(),
        weightPerUnitKg: v.number(),
        weightType: v.union(v.literal("kg"), v.literal("box"), v.literal("litre")),
        priceMode: v.union(v.literal("total"), v.literal("unit"))
      })
    ),
    bags: v.array(
      v.object({
        bagNumber: v.number(),
        totalWeightKg: v.number(),
        sealLabel: v.optional(v.string()),
        isBundled: v.boolean(),
        items: v.array(
          v.object({
            productId: v.id("products"),
            unitsInBag: v.number()
          })
        )
      })
    ),
    courierFeePerBag: v.optional(v.number()),
    courierFeeOverride: v.optional(v.number()),
    courierNote: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const totalAmount = args.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const billId = await ctx.db.insert("bills", {
      sessionId: args.sessionId,
      distributorId: args.distributorId,
      billNumber: args.billNumber,
      billDate: args.billDate,
      totalAmount
    });

    const billItemIdsByProduct = new Map<string, any>();
    for (const item of args.items) {
      const ratePerKg = item.weightPerUnitKg ? Number((item.ratePerUnit / item.weightPerUnitKg).toFixed(2)) : 0;
      const billItemId = await ctx.db.insert("billItems", {
        billId,
        productId: item.productId,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice,
        ratePerUnit: item.ratePerUnit,
        weightPerUnitKg: item.weightPerUnitKg,
        ratePerKg,
        weightType: item.weightType
      });
      billItemIdsByProduct.set(item.productId, billItemId);
      await ctx.db.insert("purchasePriceHistory", {
        productId: item.productId,
        distributorId: args.distributorId,
        billId,
        sessionId: args.sessionId,
        ratePerUnit: item.ratePerUnit,
        ratePerKg,
        purchaseDate: args.billDate,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice
      });

      const requirements = await ctx.db
        .query("purchaseRequirements")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) => q.eq(q.field("productId"), item.productId))
        .collect();
      for (const requirement of requirements) {
        const remainingQty = Math.max(requirement.qtyRequired - item.unitsBought, 0);
        if (remainingQty > 0) {
          await ctx.db.patch(requirement._id, { qtyRequired: remainingQty });
        } else {
          await ctx.db.delete(requirement._id);
        }
      }

      const existingVerification = await ctx.db
        .query("deliveryVerifications")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) =>
          q.and(
            q.eq(q.field("distributorId"), args.distributorId),
            q.eq(q.field("productId"), item.productId)
          )
        )
        .first();
      if (existingVerification) {
        await ctx.db.patch(existingVerification._id, {
          expectedQty: existingVerification.expectedQty + item.unitsBought,
          status: "pending"
        });
      } else {
        await ctx.db.insert("deliveryVerifications", {
          sessionId: args.sessionId,
          distributorId: args.distributorId,
          productId: item.productId,
          expectedQty: item.unitsBought,
          status: "pending"
        });
      }
    }

    const bagCount = args.bags.length;
    const courierFeeTotal = args.courierFeeOverride ?? (args.courierFeePerBag ?? 0) * bagCount;
    const gatePassId = await ctx.db.insert("gatePasses", {
      billId,
      distributorId: args.distributorId,
      sessionId: args.sessionId,
      courierFeePerBag: args.courierFeePerBag,
      courierFeeTotal,
      courierNote: args.courierNote,
      generatedAt: Date.now()
    });

    for (const bag of args.bags) {
      const bagId = await ctx.db.insert("gatePassBags", {
        gatePassId,
        bagNumber: bag.bagNumber,
        totalWeightKg: bag.totalWeightKg,
        sealLabel: bag.sealLabel,
        isBundled: bag.isBundled
      });
      for (const item of bag.items) {
        const billItemId = billItemIdsByProduct.get(item.productId);
        if (!billItemId) continue;
        await ctx.db.insert("gatePassBagItems", {
          bagId,
          billItemId,
          unitsInBag: item.unitsInBag
        });
      }
    }

    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        totalSpent: (session.totalSpent ?? 0) + totalAmount,
        courierTotal: (session.courierTotal ?? 0) + courierFeeTotal
      });
    }

    return gatePassId;
  }
});
