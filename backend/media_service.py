"""Uploads do assistente: imagens, PDF, áudio (extração/transcrição leve)."""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import Any

UPLOAD_ROOT = Path(
    os.environ.get("ODONTO_AGENT_UPLOAD_DIR", "/root/clinica-odontogpt-dashboard/data/agent_uploads")
)
MAX_BYTES = int(os.environ.get("ODONTO_AGENT_MAX_UPLOAD", str(12 * 1024 * 1024)))

ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_DOC = {"application/pdf", "text/plain"}
ALLOWED_AUDIO = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav"}


def ensure_upload_dir() -> Path:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOAD_ROOT


def _safe_name(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", (name or "file")[:120])
    return base or "file"


def save_upload(filename: str, raw: bytes, mime: str | None) -> dict[str, Any]:
    if len(raw) > MAX_BYTES:
        raise ValueError(f"Arquivo excede {MAX_BYTES // (1024*1024)}MB")
    ensure_upload_dir()
    mime = (mime or mimetypes.guess_type(filename)[0] or "application/octet-stream").split(";")[0]
    uid = uuid.uuid4().hex[:12]
    safe = _safe_name(filename)
    path = UPLOAD_ROOT / f"{uid}_{safe}"
    path.write_bytes(raw)
    return {
        "id": uid,
        "path": str(path),
        "filename": safe,
        "mime": mime,
        "size": len(raw),
    }


def extract_pdf_text(path: str, limit: int = 12000) -> str:
    try:
        import fitz  # pymupdf
    except ImportError:
        return "[PDF: pymupdf não instalado no servidor]"
    try:
        doc = fitz.open(path)
        parts: list[str] = []
        for page in doc:
            parts.append(page.get_text())
            if sum(len(p) for p in parts) > limit:
                break
        doc.close()
        text = "\n".join(parts).strip()
        return text[:limit] if text else "[PDF sem texto extraível]"
    except Exception as e:
        return f"[Erro ao ler PDF: {e}]"


def file_to_agent_parts(meta: dict[str, Any]) -> list[dict[str, Any]]:
    """Converte anexo salvo em partes para mensagem multimodal (OpenAI-style)."""
    mime = meta.get("mime") or ""
    path = meta.get("path") or ""
    fname = meta.get("filename") or "anexo"
    parts: list[dict[str, Any]] = []

    if mime in ALLOWED_IMAGE and os.path.isfile(path):
        raw = Path(path).read_bytes()
        b64 = base64.standard_b64encode(raw).decode("ascii")
        data_url = f"data:{mime};base64,{b64}"
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": data_url, "detail": "high"},
            }
        )
        parts.append(
            {
                "type": "text",
                "text": f"[Imagem anexada: {fname}] Descreva achados clínicos visíveis com cautela; cite limitações.",
            }
        )
        return parts

    if mime in ALLOWED_DOC or fname.lower().endswith(".pdf"):
        if fname.lower().endswith(".txt"):
            text = Path(path).read_text(encoding="utf-8", errors="replace")[:12000]
        else:
            text = extract_pdf_text(path)
        parts.append(
            {
                "type": "text",
                "text": f"[Documento {fname}]\n{text}",
            }
        )
        return parts

    if mime in ALLOWED_AUDIO or fname.lower().endswith((".webm", ".ogg", ".mp3", ".wav")):
        parts.append(
            {
                "type": "text",
                "text": (
                    f"[Áudio anexado: {fname}, {meta.get('size', 0)} bytes]. "
                    "O operador pode ter ditado no microfone; trate o texto da mensagem como transcrição "
                    "ou peça que reenvie em texto se o áudio não foi transcrito no navegador."
                ),
            }
        )
        return parts

    parts.append({"type": "text", "text": f"[Anexo {fname} ({mime}) não processado automaticamente]"})
    return parts


def resolve_upload(upload_id: str) -> dict[str, Any] | None:
    if not upload_id or not re.fullmatch(r"[a-f0-9]{12}", upload_id):
        return None
    ensure_upload_dir()
    for p in UPLOAD_ROOT.glob(f"{upload_id}_*"):
        if p.is_file():
            mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            return {
                "id": upload_id,
                "path": str(p),
                "filename": p.name.split("_", 1)[-1] if "_" in p.name else p.name,
                "mime": mime.split(";")[0],
                "size": p.stat().st_size,
            }
    return None


def meta_json(meta: dict[str, Any]) -> str:
    public = {k: meta[k] for k in ("id", "filename", "mime", "size") if k in meta}
    return json.dumps(public, ensure_ascii=False)