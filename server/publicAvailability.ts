import type { NextFunction, Request, Response } from "express";

export const BETAKO_UNAVAILABLE_RESPONSE = {
  ok: false,
  message: "BETAKO is temporarily unavailable",
} as const;

export function isBetakoPublicEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.BETAKO_PUBLIC_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

export function requireBetakoPublicEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!isBetakoPublicEnabled()) {
    res.status(503).json(BETAKO_UNAVAILABLE_RESPONSE);
    return;
  }

  next();
}

function isPublicPredictionTrpcPath(pathname: string): boolean {
  const paths = pathname.replace(/^\/+/, "").split(",");
  return paths.some((path) =>
    path.startsWith("predict.") ||
    path === "recommended.getRecommended"
  );
}

export function blockPublicPredictionTrpcWhenDisabled(req: Request, res: Response, next: NextFunction): void {
  if (isBetakoPublicEnabled()) {
    next();
    return;
  }

  const pathname = decodeURIComponent(req.path);
  if (isPublicPredictionTrpcPath(pathname)) {
    res.status(503).json(BETAKO_UNAVAILABLE_RESPONSE);
    return;
  }

  next();
}
