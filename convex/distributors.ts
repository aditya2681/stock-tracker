import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("distributors").order("asc").collect();
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    shortCode: v.string(),
    phone: v.optional(v.string()),
    area: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("distributors", {
      ...args,
      isActive: true
    });
  }
});
