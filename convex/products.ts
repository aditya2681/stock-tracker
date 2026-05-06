import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").order("asc").collect();
  }
});

export const updateStock = mutation({
  args: {
    productId: v.id("products"),
    newQty: v.number(),
    reason: v.union(
      v.literal("manual_count"),
      v.literal("sale"),
      v.literal("damage"),
      v.literal("received")
    ),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");
    await ctx.db.patch(args.productId, { currentStockQty: args.newQty });
    await ctx.db.insert("stockLog", {
      productId: args.productId,
      previousQty: product.currentStockQty,
      newQty: args.newQty,
      reason: args.reason,
      notes: args.notes,
      updatedAt: Date.now()
    });
    return { ok: true };
  }
});
