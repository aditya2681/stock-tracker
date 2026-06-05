"use node";

import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";

const operationSchema = z.object({
  operations: z.array(
    z.object({
      kind: z.enum([
        "create_product",
        "update_product",
        "create_distributor",
        "update_distributor",
        "link_product_distributor",
        "plan_purchase",
        "update_stock",
        "log_enquiry",
        "create_session",
        "update_session",
        "record_purchase",
        "verify_delivery",
        "unsupported"
      ]),
      summary: z.string(),
      productName: z.string().optional(),
      distributorName: z.string().optional(),
      sessionName: z.string().optional(),
      name: z.string().optional(),
      unitLabel: z.string().optional(),
      weightPerUnitKg: z.number().optional(),
      currentStockQty: z.number().optional(),
      minStockAlert: z.number().optional(),
      shortCode: z.string().optional(),
      phone: z.string().optional(),
      area: z.string().optional(),
      qtyRequired: z.number().optional(),
      newQty: z.number().optional(),
      reason: z.string().optional(),
      quotedRatePerUnit: z.number().optional(),
      enquiryDate: z.string().optional(),
      source: z.string().optional(),
      notes: z.string().optional(),
      openingBalance: z.number().optional(),
      closingBalance: z.number().optional(),
      date: z.string().optional(),
      billDate: z.string().optional(),
      billNumber: z.string().optional(),
      receivedQty: z.number().optional(),
      status: z.string().optional(),
      totalPrice: z.number().optional(),
      unitsBought: z.number().optional(),
      weightType: z.string().optional(),
      items: z
        .array(
          z.object({
            productName: z.string(),
            unitsBought: z.number().optional(),
            totalPrice: z.number().optional(),
            weightPerUnitKg: z.number().optional(),
            weightType: z.string().optional()
          })
        )
        .optional()
    })
  )
});

function extractTextContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return String((block as { text?: unknown }).text ?? "");
        return "";
      })
      .join("\n");
  }
  return "";
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("GLM response did not contain valid JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function scoreMatch(query: string, candidate: string) {
  const a = normalize(query);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  const aWords = new Set(a.split(" ").filter(Boolean));
  const bWords = new Set(b.split(" ").filter(Boolean));
  const overlap = [...aWords].filter((word) => bWords.has(word)).length;
  return overlap / Math.max(aWords.size, bWords.size, 1);
}

function topMatches<T extends { id: string; label: string }>(query: string | undefined, rows: T[], field: string) {
  if (!query) return [];
  return rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      field,
      score: scoreMatch(query, row.label)
    }))
    .filter((row) => row.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export const parseDraft = action({
  args: {
    text: v.string(),
    selectedSessionId: v.optional(v.id("sessions")),
    createdBy: v.optional(v.string())
  },
  handler: async (ctx, args): Promise<{ draftId: string }> => {
    const snapshot: any = await ctx.runQuery(api.app.snapshot, {});

    const products = snapshot.products.map((product: any) => ({
      id: product.id,
      label: product.name
    }));
    const distributors = snapshot.distributors.map((distributor: any) => ({
      id: distributor.id,
      label: `${distributor.name} ${distributor.shortCode}`
    }));
    const sessions = snapshot.sessions.map((session: any) => ({
      id: session.id,
      label: `${session.name} ${session.date}`
    }));

    const zaiApiKey = process.env.ZAI_API_KEY;
    if (!zaiApiKey) {
      throw new Error("Missing ZAI_API_KEY for GLM parsing.");
    }
    const zaiBaseUrl = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";

    const model = new ChatOpenAI({
      model: "glm-4.5",
      temperature: 0,
      apiKey: zaiApiKey,
      streamUsage: false,
      configuration: {
        baseURL: zaiBaseUrl
      }
    });

    const response = await model.invoke([
      {
        role: "system",
        content:
          "You extract structured inventory operations for a wholesale stock tracker. Return JSON only, with no markdown except an optional ```json fenced block. " +
          "The JSON must match exactly this top-level shape: {\"operations\":[...]} . " +
          "Supported operations are create_product, update_product, create_distributor, update_distributor, " +
          "link_product_distributor, plan_purchase, update_stock, log_enquiry, create_session, update_session, " +
          "record_purchase, verify_delivery, unsupported. " +
          "Do not invent database ids. Use names from the user text. " +
          "If the text is unclear, return unsupported with a short summary. " +
          "Use numbers for numeric fields. Keep omitted fields absent."
      },
      {
        role: "user",
        content:
          `Selected session id: ${args.selectedSessionId ?? "none"}\n` +
          `Known products: ${snapshot.products.map((product: any) => product.name).join(", ")}\n` +
          `Known distributors: ${snapshot.distributors.map((distributor: any) => distributor.name).join(", ")}\n` +
          `Known sessions: ${snapshot.sessions.map((session: any) => `${session.name} (${session.date})`).join(", ")}\n\n` +
          args.text
      }
    ]);

    const rawResult = extractJsonObject(extractTextContent(response.content));
    const result = operationSchema.parse(rawResult);

    const entries = result.operations.map((operation) => {
      const payload: Record<string, unknown> = {};
      const candidates: Array<Record<string, unknown>> = [];
      const warnings: string[] = [];
      let status: "resolved" | "ambiguous" | "unresolved" | "unsupported" = "resolved";
      let targetTable = "unsupported";

      const resolveProduct = () => {
        const matches = topMatches(operation.productName, products, "productId");
        candidates.push(...matches);
        if (!operation.productName) return;
        if (matches[0]?.score === 1) {
          payload.productId = matches[0].id;
          return;
        }
        if (matches.length > 1) {
          status = "ambiguous";
          warnings.push(`Choose the correct product for "${operation.productName}".`);
          return;
        }
        if (matches.length === 1) {
          payload.productId = matches[0].id;
          status = "ambiguous";
          warnings.push(`Please confirm the product match for "${operation.productName}".`);
          return;
        }
        status = "unresolved";
        warnings.push(`No product match found for "${operation.productName}".`);
      };

      const resolveDistributor = () => {
        const matches = topMatches(operation.distributorName, distributors, "distributorId");
        candidates.push(...matches);
        if (!operation.distributorName) return;
        if (matches[0]?.score === 1) {
          payload.distributorId = matches[0].id;
          return;
        }
        if (matches.length > 1) {
          status = "ambiguous";
          warnings.push(`Choose the correct distributor for "${operation.distributorName}".`);
          return;
        }
        if (matches.length === 1) {
          payload.distributorId = matches[0].id;
          status = "ambiguous";
          warnings.push(`Please confirm the distributor match for "${operation.distributorName}".`);
          return;
        }
        status = "unresolved";
        warnings.push(`No distributor match found for "${operation.distributorName}".`);
      };

      const resolveSession = () => {
        if (args.selectedSessionId) {
          payload.sessionId = args.selectedSessionId;
          return;
        }
        const matches = topMatches(operation.sessionName, sessions, "sessionId");
        candidates.push(...matches);
        if (!operation.sessionName) {
          status = "unresolved";
          warnings.push("Session is required for this operation.");
          return;
        }
        if (matches[0]?.score === 1) {
          payload.sessionId = matches[0].id;
          return;
        }
        if (matches.length > 1) {
          status = "ambiguous";
          warnings.push(`Choose the correct session for "${operation.sessionName}".`);
          return;
        }
        if (matches.length === 1) {
          payload.sessionId = matches[0].id;
          status = "ambiguous";
          warnings.push(`Please confirm the session match for "${operation.sessionName}".`);
          return;
        }
        status = "unresolved";
        warnings.push(`No session match found for "${operation.sessionName}".`);
      };

      switch (operation.kind) {
        case "create_product":
          targetTable = "products";
          payload.name = operation.name ?? operation.productName ?? "";
          payload.unitLabel = operation.unitLabel ?? "bag";
          payload.weightPerUnitKg = operation.weightPerUnitKg ?? 0;
          payload.currentStockQty = operation.currentStockQty ?? 0;
          payload.minStockAlert = operation.minStockAlert ?? 0;
          break;
        case "update_product":
          targetTable = "products";
          payload.name = operation.name ?? operation.productName ?? "";
          payload.unitLabel = operation.unitLabel ?? "bag";
          payload.weightPerUnitKg = operation.weightPerUnitKg ?? 0;
          payload.currentStockQty = operation.currentStockQty ?? 0;
          payload.minStockAlert = operation.minStockAlert ?? 0;
          resolveProduct();
          break;
        case "create_distributor":
          targetTable = "distributors";
          payload.name = operation.name ?? operation.distributorName ?? "";
          payload.shortCode = operation.shortCode ?? "";
          payload.phone = operation.phone;
          payload.area = operation.area;
          break;
        case "update_distributor":
          targetTable = "distributors";
          payload.name = operation.name ?? operation.distributorName ?? "";
          payload.shortCode = operation.shortCode ?? "";
          payload.phone = operation.phone;
          payload.area = operation.area;
          resolveDistributor();
          break;
        case "link_product_distributor":
          targetTable = "productDistributors";
          resolveProduct();
          resolveDistributor();
          break;
        case "plan_purchase":
          targetTable = "purchaseRequirements";
          resolveSession();
          resolveProduct();
          payload.qtyRequired = operation.qtyRequired ?? 0;
          payload.notes = operation.notes;
          break;
        case "update_stock":
          targetTable = "products";
          resolveProduct();
          payload.newQty = operation.newQty ?? operation.currentStockQty ?? 0;
          payload.reason = operation.reason ?? "manual_count";
          payload.notes = operation.notes;
          break;
        case "log_enquiry":
          targetTable = "enquiryPriceHistory";
          resolveProduct();
          resolveDistributor();
          payload.quotedRatePerUnit = operation.quotedRatePerUnit ?? 0;
          payload.weightPerUnitKg = operation.weightPerUnitKg;
          payload.enquiryDate = operation.enquiryDate ?? new Date().toISOString().slice(0, 10);
          payload.source = operation.source ?? "other";
          payload.notes = operation.notes;
          break;
        case "create_session":
          targetTable = "sessions";
          payload.name = operation.name ?? operation.sessionName ?? "Utility session";
          payload.date = operation.date ?? new Date().toISOString().slice(0, 10);
          payload.openingBalance = operation.openingBalance ?? 0;
          payload.notes = operation.notes;
          break;
        case "update_session":
          targetTable = "sessions";
          resolveSession();
          payload.name = operation.name ?? operation.sessionName;
          payload.date = operation.date;
          payload.openingBalance = operation.openingBalance;
          payload.closingBalance = operation.closingBalance;
          payload.notes = operation.notes;
          break;
        case "record_purchase":
          targetTable = "bills";
          resolveSession();
          resolveDistributor();
          payload.billDate = operation.billDate ?? new Date().toISOString().slice(0, 10);
          payload.billNumber = operation.billNumber;
          payload.items = (operation.items ?? []).map((item) => {
            const matches = topMatches(item.productName, products, "productId");
            candidates.push(...matches);
            if (!matches.length) {
              status = "unresolved";
              warnings.push(`No product match found for "${item.productName}".`);
              return {
                productId: undefined,
                productName: item.productName,
                unitsBought: item.unitsBought ?? 0,
                totalPrice: item.totalPrice ?? 0,
                weightPerUnitKg: item.weightPerUnitKg ?? 0,
                weightType: item.weightType ?? "kg"
              };
            }
            if (matches[0]?.score !== 1) {
              status = "ambiguous";
              warnings.push(`Please confirm the purchased item match for "${item.productName}".`);
            }
            return {
              productId: matches[0].id,
              productName: item.productName,
              unitsBought: item.unitsBought ?? 0,
              totalPrice: item.totalPrice ?? 0,
              weightPerUnitKg: item.weightPerUnitKg ?? 0,
              weightType: item.weightType ?? "kg"
            };
          });
          break;
        case "verify_delivery":
          targetTable = "deliveryVerifications";
          resolveSession();
          resolveDistributor();
          resolveProduct();
          payload.receivedQty = operation.receivedQty ?? operation.qtyRequired ?? 0;
          payload.status = operation.status ?? "match";
          payload.notes = operation.notes;
          break;
        default:
          targetTable = "unsupported";
          status = "unsupported";
          warnings.push("The utility could not map this instruction to a supported StockTrack operation.");
          break;
      }

      return {
        operationKind: operation.kind,
        targetTable,
        summary: operation.summary,
        status,
        payloadJson: JSON.stringify(payload),
        candidatesJson: JSON.stringify(candidates),
        warning: warnings.join(" ")
      };
    });

    const parseStatus =
      entries.length === 0
        ? "failed"
        : entries.some((entry) => entry.status !== "resolved")
          ? "needs_review"
          : "parsed";

    const draftId: string = String(await ctx.runMutation((internal as any).opsAssistant.storeDraft, {
      sourceText: args.text,
      selectedSessionId: args.selectedSessionId,
      parseStatus,
      warning:
        entries.length === 0
          ? "No supported operations were extracted. Try adding clearer business instructions."
          : undefined,
      modelName: "glm-4.5",
      createdBy: args.createdBy,
      entries
    }));

    return { draftId };
  }
});
