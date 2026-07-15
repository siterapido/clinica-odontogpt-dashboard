import os
import hashlib
import secrets
from fastapi import Header, HTTPException
from datetime import datetime, timedelta

PASSWORD = os.getenv("ODONTOGPT_DASH_PASSWORD", "odontogpt2026")
PASSWORD_HASH = hashlib.sha256(PASSWORD.encode()).hexdigest()
DASH_PASSWORD = PASSWORD

# Token store (memory-only — reinicia com o processo)
_tokens: dict[str, datetime] = {}

SESSION_TTL = timedelta(hours=12)
CLEANUP_INTERVAL = timedelta(minutes=30)
_last_cleanup = datetime.min


def _cleanup():
    """Remove tokens expirados."""
    global _last_cleanup
    now = datetime.now()
    if now - _last_cleanup < CLEANUP_INTERVAL:
        return
    expired = [t for t, exp in _tokens.items() if exp < now]
    for t in expired:
        del _tokens[t]
    _last_cleanup = now


def verify_password(password: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == PASSWORD_HASH


def create_token() -> str:
    _cleanup()
    token = secrets.token_urlsafe(32)
    _tokens[token] = datetime.now() + SESSION_TTL
    return token


def create_session() -> str:
    return create_token()


def validate_token(token: str) -> bool:
    _cleanup()
    if not token:
        return False
    if token not in _tokens:
        return False
    if _tokens[token] < datetime.now():
        del _tokens[token]
        return False
    return True


def require_auth(authorization: str = Header(...)):
    token = ""
    if authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not validate_token(token):
        raise HTTPException(status_code=401, detail="Não autorizado")


def logout(token: str):
    _tokens.pop(token, None)
