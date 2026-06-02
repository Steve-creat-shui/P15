from typing import Any

from fastapi import APIRouter, HTTPException

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.schemas.evidence import EvidenceResponse, EvidenceUpdate

router = APIRouter(prefix="/evidences", tags=["evidences"])


@router.get("/case/{case_id}", response_model=list[EvidenceResponse])
def read_evidences_by_case(
    session: SessionDep, current_user: CurrentUser, case_id: int
) -> Any:
    """Get all evidence items for a case."""
    evidences = crud.get_evidences_by_case(session=session, case_id=case_id)
    return evidences


@router.get("/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(
    session: SessionDep, current_user: CurrentUser, evidence_id: int
) -> Any:
    """Get a single evidence item by ID."""
    evidence = crud.get_evidence(session=session, evidence_id=evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence


@router.patch("/{evidence_id}", response_model=EvidenceResponse)
def update_evidence(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    evidence_id: int,
    evidence_update: EvidenceUpdate,
) -> Any:
    """Update an evidence item (approve, exclude, or edit details).

    Teachers use this to review extracted evidence: flip is_approved to True
    for items to include in scene deduction, or is_excluded to True to ignore.
    """
    db_evidence = crud.get_evidence(session=session, evidence_id=evidence_id)
    if not db_evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return crud.update_evidence(
        session=session, db_evidence=db_evidence, evidence_update=evidence_update
    )
