from datetime import datetime
from pydantic import BaseModel

# ==============================================================================
# Evidence Pydantic Schemas
# ==============================================================================

class EvidenceBase(BaseModel):
    category: str
    evidence_type: str
    description: str
    location: str | None = None
    state_json: str | None = None
    is_approved: bool = False
    is_excluded: bool = False

class EvidenceCreate(EvidenceBase):
    case_id: int

class EvidenceUpdate(BaseModel):
    category: str | None = None
    evidence_type: str | None = None
    description: str | None = None
    location: str | None = None
    state_json: str | None = None
    is_approved: bool | None = None
    is_excluded: bool | None = None
    scene_id: int | None = None

class EvidenceResponse(EvidenceBase):
    id: int
    case_id: int
    scene_id: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# Case Pydantic Schemas (Helper schemas for evidence relations)
# ==============================================================================

class CaseBase(BaseModel):
    title: str
    raw_text: str
    status: str = "pending"
    style_description: str | None = None

class CaseCreate(CaseBase):
    pass

class CaseUpdate(BaseModel):
    title: str | None = None
    raw_text: str | None = None
    status: str | None = None
    style_description: str | None = None

class CaseResponse(CaseBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# Scene Pydantic Schemas
# ==============================================================================

class SceneCreate(BaseModel):
    name: str
    room_type: str = "unknown"
    sort_order: int = 0

class SceneUpdate(BaseModel):
    name: str | None = None
    room_type: str | None = None
    sort_order: int | None = None

class SceneResponse(BaseModel):
    id: int
    case_id: int
    name: str
    room_type: str
    sort_order: int
    evidence_count: int = 0   # 该场景下的证据数量（join 查询填充）
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# LLM Structural Extraction Schemas (Instructor Target)
# ==============================================================================

from typing import Literal

class ExtractedEvidenceItem(BaseModel):
    evidence_type: Literal["物证", "书证", "现场结构", "空间关系"]
    category: Literal["extractable", "uncertain", "non_visualizable"]
    description: str
    location: str | None = None
    state_dict: dict | None = None

class EvidenceExtractionResult(BaseModel):
    case_title: str
    evidences: list[ExtractedEvidenceItem]

