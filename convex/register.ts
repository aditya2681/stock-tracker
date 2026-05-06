import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const bySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("purchaseRequirements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  }
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("purchaseRequirements").collect();
  }
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("purchaseRequirements")),
    sessionId: v.id("sessions"),
    productId: v.id("products"),
    qtyRequired: v.number(),
    preferredDistributorId: v.optional(v.id("distributors")),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (args.id) {
      const { id, ...patch } = args;
      await ctx.db.patch(id, patch);
      return args.id;
    }
    return await ctx.db.insert("purchaseRequirements", args);
  }
});

export const remove = mutation({
  args: { id: v.id("purchaseRequirements") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { ok: true };
  }
});
