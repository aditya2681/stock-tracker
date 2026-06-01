import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/ops/parse",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runAction((api as any).opsAssistantNode.parseDraft, {
      text: String(body.text ?? ""),
      selectedSessionId: body.selectedSessionId,
      createdBy: body.createdBy
    });
    return Response.json(result);
  })
});

http.route({
  path: "/api/ops/transcribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runAction((api as any).opsAssistantNode.transcribeAudio, {
      audioBase64: String(body.audioBase64 ?? ""),
      mimeType: String(body.mimeType ?? "audio/webm")
    });
    return Response.json(result);
  })
});

export default http;
