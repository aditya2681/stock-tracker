import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const bySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.query("bills").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).collect();
  }
});

export const create = mutation({
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
        weightPerUnitKg: v.number(),
        weightType: v.union(v.literal("kg"), v.literal("box"), v.literal("litre"))
      })
    )
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

    for (const item of args.items) {
      const ratePerUnit = item.totalPrice / item.unitsBought;
      const ratePerKg = ratePerUnit / item.weightPerUnitKg;
      await ctx.db.insert("billItems", {
        billId,
        productId: item.productId,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice,
        ratePerUnit,
        weightPerUnitKg: item.weightPerUnitKg,
        ratePerKg,
        weightType: item.weightType
      });
      await ctx.db.insert("purchasePriceHistory", {
        productId: item.productId,
        distributorId: args.distributorId,
        billId,
        sessionId: args.sessionId,
        ratePerUnit,
        ratePerKg,
        purchaseDate: args.billDate,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice
      });
    }

    return billId;
  }
});
