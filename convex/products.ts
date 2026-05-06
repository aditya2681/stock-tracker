import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").order("asc").collect();
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    unitLabel: v.string(),
    weightPerUnitKg: v.number(),
    currentStockQty: v.number(),
    minStockAlert: v.number(),
    linkedDistributorIds: v.array(v.id("distributors"))
  },
  handler: async (ctx, args) => {
    const productId = await ctx.db.insert("products", {
      name: args.name,
      unitLabel: args.unitLabel,
      weightPerUnitKg: args.weightPerUnitKg,
      currentStockQty: args.currentStockQty,
      minStockAlert: args.minStockAlert,
      createdAt: Date.now()
    });
    for (const distributorId of args.linkedDistributorIds) {
      await ctx.db.insert("productDistributors", {
        productId,
        distributorId
      });
    }
    return productId;
  }
});

export const update = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    unitLabel: v.string(),
    weightPerUnitKg: v.number(),
    currentStockQty: v.number(),
    minStockAlert: v.number(),
    linkedDistributorIds: v.array(v.id("distributors"))
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, {
      name: args.name,
      unitLabel: args.unitLabel,
      weightPerUnitKg: args.weightPerUnitKg,
      currentStockQty: args.currentStockQty,
      minStockAlert: args.minStockAlert
    });

    const existingLinks = await ctx.db
      .query("productDistributors")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    for (const link of existingLinks) {
      await ctx.db.delete(link._id);
    }
    for (const distributorId of args.linkedDistributorIds) {
      await ctx.db.insert("productDistributors", {
        productId: args.productId,
        distributorId
      });
    }
    return { ok: true };
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
