"""Escrita no CRM — reutiliza OdontoCRM do skill odonto_crm."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

CRM_SKILL = Path("/root/.hermes-docker/profiles/odonto-gpt/skills/odonto_crm")
if CRM_SKILL.is_dir():
    sys.path.insert(0, str(CRM_SKILL))

from lib.core import OdontoCRM, CRMAccessError  # type: ignore

_DB = os.environ.get("ODONTO_CRM_DB", "/root/.hermes-docker/odonto_gpt/data/crm.db")
_crm: Optional[OdontoCRM] = None


def get_crm() -> OdontoCRM:
    global _crm
    if _crm is None:
        _crm = OdontoCRM(_DB)
    return _crm


def crm_error_to_http(exc: Exception) -> str:
    if isinstance(exc, CRMAccessError):
        return str(exc)
    return str(exc) or "Erro no CRM"