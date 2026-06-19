import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const forProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const purchases = await ctx.db
      .query("purchasePriceHistory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const enquiries = await ctx.db
      .query("enquiryPriceHistory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    return { purchases, enquiries };
  }
});

export const logEnquiry = mutation({
  args: {
    productId: v.id("products"),
    distributorId: v.id("distributors"),
    quotedRatePerUnit: v.number(),
    weightPerUnitKg: v.optional(v.number()),
    enquiryDate: v.string(),
    source: v.union(
      v.literal("phone"),
      v.literal("visit"),
      v.literal("whatsapp"),
      v.literal("other")
    ),
    notes: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions"))
  },
  handler: async (ctx, args) => {
    const createdId = await ctx.db.insert("enquiryPriceHistory", {
      ...args,
      quotedRatePerKg: args.weightPerUnitKg ? args.quotedRatePerUnit / args.weightPerUnitKg : undefined
    });
    return createdId;
  }
});

export const updateEnquiry = mutation({
  args: {
    entryId: v.id("enquiryPriceHistory"),
    productId: v.id("products"),
    distributorId: v.id("distributors"),
    quotedRatePerUnit: v.number(),
    weightPerUnitKg: v.optional(v.number()),
    enquiryDate: v.string(),
    source: v.union(
      v.literal("phone"),
      v.literal("visit"),
      v.literal("whatsapp"),
      v.literal("other")
    ),
    notes: v.optional(v.string()),
    sessionId: v.optional(v.id("sessions"))
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.entryId, {
      productId: args.productId,
      distributorId: args.distributorId,
      quotedRatePerUnit: args.quotedRatePerUnit,
      quotedRatePerKg: args.weightPerUnitKg ? args.quotedRatePerUnit / args.weightPerUnitKg : undefined,
      weightPerUnitKg: args.weightPerUnitKg,
      enquiryDate: args.enquiryDate,
      source: args.source,
      notes: args.notes,
      sessionId: args.sessionId
    });
    return { ok: true };
  }
});

export const logManyEnquiries = mutation({
  args: {
    distributorId: v.id("distributors"),
    enquiries: v.array(
      v.object({
        productId: v.id("products"),
        quotedRatePerUnit: v.number(),
        weightPerUnitKg: v.optional(v.number()),
        enquiryDate: v.string(),
        source: v.union(
          v.literal("phone"),
          v.literal("visit"),
          v.literal("whatsapp"),
          v.literal("other")
        ),
        notes: v.optional(v.string()),
        sessionId: v.optional(v.id("sessions"))
      })
    )
  },
  handler: async (ctx, args) => {
    const createdIds = [];
    for (const enquiry of args.enquiries) {
      const createdId = await ctx.db.insert("enquiryPriceHistory", {
        ...enquiry,
        distributorId: args.distributorId,
        quotedRatePerKg: enquiry.weightPerUnitKg ? enquiry.quotedRatePerUnit / enquiry.weightPerUnitKg : undefined
      });
      createdIds.push(createdId);
    }

    return createdIds;
  }
});
