import { Request, Response, NextFunction } from "express";
import { ApiError } from "../types";

export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = (err as ApiError).statusCode || 500;
  const message = err.message || "Internal Server Error";
  const details = (err as ApiError).details;

  console.error(`[ERROR] ${statusCode} — ${message}`, details || "");

  res.status(statusCode).json({
    error: {
      statusCode,
      message,
      ...(details ? { details } : {}),
    },
  });
}
