import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Header, HTTPException, status

from .config import load_env_file


load_env_file()

TOKEN_SECRET = os.getenv("TOKEN_SECRET", "change-me-in-production")
ADMIN_ACCESS_CODE = os.getenv("ADMIN_ACCESS_CODE", "change-this-admin-code")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "43200"))


def create_token(payload: dict) -> str:
    data = payload | {"exp": int(time.time()) + TOKEN_TTL_SECONDS}
    raw = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(TOKEN_SECRET.encode(), raw, hashlib.sha256).digest()
    return f"{base64.urlsafe_b64encode(raw).decode()}.{base64.urlsafe_b64encode(sig).decode()}"


def decode_token(token: str) -> dict:
    try:
        raw_b64, sig_b64 = token.split(".", 1)
        raw = base64.urlsafe_b64decode(raw_b64.encode())
        sig = base64.urlsafe_b64decode(sig_b64.encode())
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

    expected = hmac.new(TOKEN_SECRET.encode(), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    payload = json.loads(raw.decode())
    if payload.get("exp", 0) < time.time():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.")
    return payload


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    return authorization.split(" ", 1)[1].strip()


def require_admin(authorization: str | None = Header(default=None)) -> dict:
    payload = decode_token(_extract_token(authorization))
    if payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return payload


def require_user(authorization: str | None = Header(default=None)) -> dict:
    return decode_token(_extract_token(authorization))
