import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const byDistributor = query({
  args: {
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryVerifications")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("distributorId"), args.distributorId))
      .collect();
  }
});

export const mark = mutation({
  args: {
    verificationId: v.id("deliveryVerifications"),
    receivedQty: v.number(),
    status: v.union(v.literal("pending"), v.literal("match"), v.literal("shortage")),
    notes: v.optional(v.string()),
    verifiedBy: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.verificationId, {
      receivedQty: args.receivedQty,
      status: args.status,
      notes: args.notes,
      verifiedBy: args.verifiedBy,
      verifiedAt: Date.now()
    });
    return { ok: true };
  }
});

export const markForSession = mutation({
  args: {
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    productId: v.id("products"),
    receivedQty: v.number(),
    status: v.union(v.literal("pending"), v.literal("match"), v.literal("shortage")),
    notes: v.optional(v.string()),
    verifiedBy: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const verification = await ctx.db
      .query("deliveryVerifications")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) =>
        q.and(
          q.eq(q.field("distributorId"), args.distributorId),
          q.eq(q.field("productId"), args.productId)
        )
      )
      .first();
    if (!verification) throw new Error("Verification item not found");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const previousReceivedQty = verification.receivedQty ?? 0;
    const delta = args.receivedQty - previousReceivedQty;

    await ctx.db.patch(verification._id, {
      receivedQty: args.receivedQty,
      status: args.status,
      notes: args.notes,
      verifiedBy: args.verifiedBy,
      verifiedAt: Date.now()
    });
    await ctx.db.patch(args.productId, {
      currentStockQty: product.currentStockQty + delta
    });
    await ctx.db.insert("stockLog", {
      productId: args.productId,
      previousQty: product.currentStockQty,
      newQty: product.currentStockQty + delta,
      reason: "received",
      notes: `Delivery ${args.status}`,
      updatedAt: Date.now()
    });
    return { ok: true };
  }
});
