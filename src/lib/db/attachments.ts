// Attachment service: signed-URL uploads with per-file progress, retry, cancel,
// automatic thumbnail + medium preview generation (image only, browser-side),
// OCR job placeholder creation, and signed-URL cache.
import { supabase } from "@/integrations/supabase/client";
import { emitDocEvent } from "./events";
import { enqueueNotification } from "./notifications";

const BUCKET = "attachments";
const SIGN_CACHE = new Map<string, { url: string; exp: number }>();
const SIGN_TTL = 60 * 55; // 55 minutes

export type UploadHandle = {
  id: string; // temp client id
  file: File;
  progress: number; // 0..1
  status: "queued" | "uploading" | "processing" | "done" | "failed" | "cancelled";
  error?: string;
  attachmentId?: string;
  abort: () => void;
  retry: () => Promise<void>;
};

export type UploadOpts = {
  orgId: string;
  entityType: string; // "document" | "inbox" | ...
  entityId: string;
  onProgress?: (h: UploadHandle) => void;
};

/** Sign a storage path (cached ~55m). Never returns a public URL. */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const cached = SIGN_CACHE.get(storagePath);
  if (cached && cached.exp > now + 60) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return null;
  SIGN_CACHE.set(storagePath, { url: data.signedUrl, exp: now + SIGN_TTL });
  return data.signedUrl;
}

export function clearSignedUrlCache(path?: string) {
  if (path) SIGN_CACHE.delete(path);
  else SIGN_CACHE.clear();
}

async function sha256(file: File) {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function readImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}

async function generateResizedBlob(img: HTMLImageElement, maxDim: number, mime = "image/webp", quality = 0.8) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), mime, quality));
}

function storagePathFor(orgId: string, entityId: string, filename: string) {
  const clean = filename.replace(/[^\w.-]+/g, "_");
  return `${orgId}/${entityId}/${Date.now()}_${clean}`;
}

/**
 * Uploads via signed upload URL + XHR for progress. Returns a handle;
 * caller subscribes via onProgress and can cancel/retry.
 */
export function uploadAttachment(file: File, opts: UploadOpts): UploadHandle {
  const handle: UploadHandle = {
    id: crypto.randomUUID(),
    file,
    progress: 0,
    status: "queued",
    abort: () => {},
    retry: async () => run(),
  };
  const emit = () => opts.onProgress?.(handle);

  const run = async () => {
    handle.status = "uploading";
    handle.progress = 0;
    handle.error = undefined;
    emit();

    try {
      const path = storagePathFor(opts.orgId, opts.entityId, file.name);
      // 1) get a signed upload URL so we can drive XHR (real progress)
      const { data: signed, error: signErr } = await (supabase.storage.from(BUCKET) as any)
        .createSignedUploadUrl(path);
      if (signErr || !signed) throw signErr ?? new Error("no signed url");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        handle.abort = () => {
          xhr.abort();
          handle.status = "cancelled";
          emit();
        };
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            handle.progress = ev.loaded / ev.total;
            emit();
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload http ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("network error"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.open("PUT", signed.signedUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.send(file);
      });

      handle.status = "processing";
      handle.progress = 1;
      emit();

      const checksum = await sha256(file);
      const isImage = file.type.startsWith("image/");
      let width: number | null = null;
      let height: number | null = null;
      let thumbPath: string | null = null;
      let mediumPath: string | null = null;

      if (isImage) {
        const img = await readImage(file);
        if (img) {
          width = img.width;
          height = img.height;
          // fire-and-forget image processing so uploads don't block UI
          void (async () => {
            try {
              const [thumb, medium] = await Promise.all([
                generateResizedBlob(img, 256),
                generateResizedBlob(img, 1024),
              ]);
              if (thumb) {
                const tPath = `${path}.thumb.webp`;
                await supabase.storage.from(BUCKET).upload(tPath, thumb, { upsert: true, contentType: "image/webp" });
                thumbPath = tPath;
              }
              if (medium) {
                const mPath = `${path}.medium.webp`;
                await supabase.storage.from(BUCKET).upload(mPath, medium, { upsert: true, contentType: "image/webp" });
                mediumPath = mPath;
              }
              if (handle.attachmentId) {
                await (supabase.from("attachments") as any)
                  .update({ thumb_path: thumbPath, medium_path: mediumPath })
                  .eq("id", handle.attachmentId);
              }
            } catch (e) {
              console.warn("[attachments] preview generation failed", e);
            }
          })();
        }
      }

      const { data: uid } = await supabase.auth.getUser();
      const insertRow = {
        org_id: opts.orgId,
        entity_type: opts.entityType,
        entity_id: opts.entityId,
        bucket: BUCKET,
        storage_path: path,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        checksum,
        width,
        height,
        version: 1,
        is_current: true,
        thumb_path: thumbPath,
        medium_path: mediumPath,
        uploaded_by: uid.user?.id,
        ocr_status: "pending",
        meta: {},
      };
      const { data: att, error: iErr } = await (supabase.from("attachments") as any)
        .insert(insertRow)
        .select("*")
        .single();
      if (iErr) throw iErr;
      handle.attachmentId = att.id;

      // OCR job placeholder — real worker attaches later.
      await (supabase.from("ocr_jobs") as any).insert({
        org_id: opts.orgId,
        attachment_id: att.id,
        status: "pending",
      });

      await emitDocEvent({
        type: "attachment.uploaded",
        orgId: opts.orgId,
        entityType: "attachment",
        entityId: att.id,
        payload: att,
      });
      await enqueueNotification({
        orgId: opts.orgId,
        event_type: "attachment.uploaded",
        entity_type: opts.entityType,
        entity_id: opts.entityId,
        document_id: opts.entityType === "document" ? opts.entityId : null,
        title: `مرفق: ${file.name}`,
      });

      handle.status = "done";
      emit();
    } catch (err: any) {
      if ((handle.status as string) === "cancelled") return;
      handle.status = "failed";
      handle.error = err?.message ?? String(err);
      emit();
      await emitDocEvent({
        type: "attachment.failed",
        orgId: opts.orgId,
        entityType: "attachment",
        entityId: handle.id,
        payload: { name: file.name, error: handle.error },
      });
    }
  };

  handle.retry = run;
  void run();
  return handle;
}

/** List attachments for an entity, cheap (no signed URLs). */
export async function listAttachments(orgId: string, entityType: string, entityId: string) {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("is_current", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteAttachment(id: string, orgId: string) {
  const { data: att } = await supabase.from("attachments").select("storage_path,thumb_path,medium_path").eq("id", id).eq("org_id", orgId).single();
  if (att) {
    const paths = [att.storage_path, att.thumb_path, att.medium_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }
  const { error } = await supabase.from("attachments").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
