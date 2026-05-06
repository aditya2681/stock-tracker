import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const active = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();
  }
});

export const updateBalances = mutation({
  args: {
    sessionId: v.id("sessions"),
    openingBalance: v.optional(v.number()),
    closingBalance: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const patch: Record<string, number | undefined> = {};
    if (typeof args.openingBalance === "number") patch.openingBalance = args.openingBalance;
    if (typeof args.closingBalance === "number") patch.closingBalance = args.closingBalance;
    await ctx.db.patch(args.sessionId, patch);
    return { ok: true };
  }
});
