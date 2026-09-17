import express from "express";

const assistantRateLimit = new Map<string, { windowStartedAt: number; count: number }>();

export function createAssistantRateLimit(): express.RequestHandler {
  return (req, res, next) => {
    if (req.method !== "POST") return next();
    const now = Date.now();
    const address = String(req.ip || req.socket.remoteAddress || "unknown");
    if (assistantRateLimit.size > 10_000) {
      for (const [key, value] of assistantRateLimit) if (now - value.windowStartedAt >= 60_000) assistantRateLimit.delete(key);
    }
    const current = assistantRateLimit.get(address);
    const windowStartedAt = current && now - current.windowStartedAt < 60_000 ? current.windowStartedAt : now;
    const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
    assistantRateLimit.set(address, { windowStartedAt, count });
    if (count > 30) return res.status(429).json({ success: false, error: "Invoice Operations AI is temporarily rate limited. Try again shortly.", code: "RATE_LIMITED" });
    return next();
  };
}
