import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const distributorImportRow = v.object({
  id: v.optional(v.id("distributors")),
  name: v.string(),
  shortCode: v.string(),
  phone: v.optional(v.string()),
  area: v.optional(v.string()),
  isActive: v.optional(v.boolean())
});

const productImportRow = v.object({
  id: v.optional(v.id("products")),
  name: v.string(),
  rackNumber: v.optional(v.string()),
  defaultUnitsPerBag: v.optional(v.number()),
  unitLabel: v.string(),
  weightPerUnitKg: v.number(),
  currentStockQty: v.number(),
  minStockAlert: v.number(),
  linkedDistributorShortCodes: v.array(v.string())
});

export const bulkImport = mutation({
  args: {
    distributors: v.array(distributorImportRow),
    products: v.array(productImportRow)
  },
  handler: async (ctx, args) => {
    const distributorIdByShortCode = new Map<string, Id<"distributors">>();

    for (const row of args.distributors) {
      const shortCode = row.shortCode.trim();
      if (!row.name.trim() || !shortCode) continue;

      let distributorId = row.id;
      if (!distributorId) {
        const existing = await ctx.db
          .query("distributors")
          .withIndex("by_shortCode", (q) => q.eq("shortCode", shortCode))
          .first();
        distributorId = existing?._id;
      }

      if (distributorId) {
        await ctx.db.patch(distributorId, {
          name: row.name.trim(),
          shortCode,
          phone: row.phone?.trim() || undefined,
          area: row.area?.trim() || undefined,
          isActive: row.isActive ?? true
        });
        distributorIdByShortCode.set(shortCode, distributorId);
      } else {
        const createdId = await ctx.db.insert("distributors", {
          name: row.name.trim(),
          shortCode,
          phone: row.phone?.trim() || undefined,
          area: row.area?.trim() || undefined,
          isActive: row.isActive ?? true
        });
        distributorIdByShortCode.set(shortCode, createdId);
      }
    }

    for (const row of args.products) {
      const productName = row.name.trim();
      if (!productName) continue;

      let productId = row.id;
      if (!productId) {
        const existing = await ctx.db
          .query("products")
          .withIndex("by_name", (q) => q.eq("name", productName))
          .first();
        productId = existing?._id;
      }

      if (productId) {
        await ctx.db.patch(productId, {
          name: productName,
          rackNumber: row.rackNumber?.trim() || undefined,
          defaultUnitsPerBag: row.defaultUnitsPerBag,
          unitLabel: row.unitLabel.trim() || "bag",
          weightPerUnitKg: row.weightPerUnitKg,
          currentStockQty: row.currentStockQty,
          minStockAlert: row.minStockAlert
        });
      } else {
        productId = await ctx.db.insert("products", {
          name: productName,
          rackNumber: row.rackNumber?.trim() || undefined,
          defaultUnitsPerBag: row.defaultUnitsPerBag,
          unitLabel: row.unitLabel.trim() || "bag",
          weightPerUnitKg: row.weightPerUnitKg,
          currentStockQty: row.currentStockQty,
          minStockAlert: row.minStockAlert,
          createdAt: Date.now()
        });
      }

      const existingLinks = await ctx.db
        .query("productDistributors")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect();
      for (const link of existingLinks) {
        await ctx.db.delete(link._id);
      }

      const desiredShortCodes = row.linkedDistributorShortCodes
        .map((code) => code.trim())
        .filter(Boolean);
      for (const shortCode of desiredShortCodes) {
        const distributorId = distributorIdByShortCode.get(shortCode);
        if (!distributorId) continue;
        await ctx.db.insert("productDistributors", {
          productId,
          distributorId
        });
      }
    }

    return {
      ok: true,
      distributorsProcessed: args.distributors.length,
      productsProcessed: args.products.length
    };
  }
});
