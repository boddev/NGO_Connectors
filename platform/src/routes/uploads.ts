import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { getStore, UPLOADS } from "../services/cosmosService";
import { Upload, validateCreateUpload } from "../models/upload";
import {
  processUpload,
  getUploadStatus,
  deleteUploadData,
  markIngesting,
} from "../services/uploadService";
import { UploadFormat } from "../types";

const router = Router({ mergeParams: true });

// POST /api/tenants/:id/connectors/:cid/upload — Accept file upload
router.post("/upload", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.id;
    const connectorId = req.params.cid;
    const { fileName, format, data } = req.body;

    if (!fileName || typeof fileName !== "string") {
      res.status(400).json({ error: "fileName is required and must be a string" });
      return;
    }

    const validFormats: UploadFormat[] = ["csv", "json", "jsonl"];
    if (!format || !validFormats.includes(format as UploadFormat)) {
      res.status(400).json({
        error: `format must be one of: ${validFormats.join(", ")}`,
      });
      return;
    }

    if (!data || typeof data !== "string") {
      res.status(400).json({
        error: "data is required — provide file content as a string (or base64)",
      });
      return;
    }

    // Decode base64 if it looks like it (no newlines + valid base64 chars)
    let content = data;
    const isBase64 = /^[A-Za-z0-9+/\r\n]+=*$/.test(data.replace(/\s/g, ""));
    if (isBase64 && data.length > 100) {
      try {
        content = Buffer.from(data, "base64").toString("utf-8");
      } catch {
        // Not base64, use raw
      }
    }

    const result = await processUpload(
      tenantId,
      connectorId,
      fileName,
      format as UploadFormat,
      content
    );

    const statusCode = result.upload.status === "quarantined" ? 422 : 201;
    res.status(statusCode).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id/connectors/:cid/uploads — List uploads
router.get(
  "/uploads",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const connectorId = req.params.cid;
      const store = getStore();
      const all = await store.getAll<Upload>(UPLOADS, tenantId);
      const uploads = all.filter((u) => u.connectorId === connectorId);
      res.json({ items: uploads, total: uploads.length });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/tenants/:id/connectors/:cid/uploads/:uid — Delete upload + purge stored data
router.delete(
  "/uploads/:uid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await deleteUploadData(
        req.params.id,
        req.params.cid,
        req.params.uid
      );
      if (!deleted) {
        res.status(404).json({ error: "Upload not found" });
        return;
      }
      res.json({ message: "Upload deleted" });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/uploads/:uid/ingest — Trigger ingestion of a staged upload
router.post(
  "/uploads/:uid/ingest",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const upload = await store.getById<Upload>(
        UPLOADS,
        req.params.uid,
        req.params.id
      );
      if (!upload) {
        res.status(404).json({ error: "Upload not found" });
        return;
      }
      if (upload.status !== "staged") {
        res.status(409).json({
          error: `Upload status is '${upload.status}' — only 'staged' uploads can be ingested`,
        });
        return;
      }

      const updated = await markIngesting(req.params.uid, req.params.id);
      res.json({ message: "Ingestion started", upload: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
