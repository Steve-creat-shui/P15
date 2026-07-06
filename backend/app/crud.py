import json
import uuid
from typing import Any

from sqlmodel import Session, func, select

from app.core.security import get_password_hash, verify_password
from app.models import (
    Case,
    Evidence,
    GeneratedImage,
    Item,
    ItemCreate,
    Scene,
    SceneState,
    User,
    UserCreate,
    UserUpdate,
    get_datetime_utc,
)
from app.schemas.evidence import CaseCreate, CaseUpdate, EvidenceUpdate, SceneCreate, SceneUpdate


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


# Dummy hash to use for timing attack prevention when user is not found
# This is an Argon2 hash of a random password, used to ensure constant-time comparison
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        # Prevent timing attacks by running password verification even when user doesn't exist
        # This ensures the response time is similar whether or not the email exists
        verify_password(password, DUMMY_HASH)
        return None
    verified, updated_password_hash = verify_password(password, db_user.hashed_password)
    if not verified:
        return None
    if updated_password_hash:
        db_user.hashed_password = updated_password_hash
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
    return db_user


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


# ==============================================================================
# JEVS CRUD Functions
# ==============================================================================


def create_case(*, session: Session, case_in: CaseCreate) -> Case:
    """Create a new case from judgment text."""
    # Strip NUL bytes — PostgreSQL text fields reject them.
    # Happens when users upload PDF/DOCX read as text via FileReader.
    if "\x00" in case_in.raw_text:
        case_in.raw_text = case_in.raw_text.replace("\x00", "")
    db_case = Case.model_validate(case_in)
    session.add(db_case)
    session.commit()
    session.refresh(db_case)
    return db_case


def get_cases(*, session: Session, skip: int = 0, limit: int = 100) -> list[Case]:
    """Get paginated list of cases, newest first. All authenticated users see all cases."""
    statement = (
        select(Case)
        .order_by(Case.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(session.exec(statement).all())


def get_case(*, session: Session, case_id: int) -> Case | None:
    """Get a single case by primary key."""
    return session.get(Case, case_id)


def update_case(*, session: Session, db_case: Case, case_update: CaseUpdate) -> Case:
    """Update case fields (title, raw_text, status)."""
    update_dict = case_update.model_dump(exclude_unset=True)
    db_case.sqlmodel_update(update_dict)
    session.add(db_case)
    session.commit()
    session.refresh(db_case)
    return db_case


def delete_case(*, session: Session, db_case: Case) -> None:
    """Delete a case. Evidence, scenes, and images are cascade-deleted by the DB."""
    session.delete(db_case)
    session.commit()


def delete_generated_image(*, session: Session, image_id: int) -> bool:
    """Delete a generated image record and its file on disk. Returns True if deleted."""
    from pathlib import Path
    db_img = session.get(GeneratedImage, image_id)
    if not db_img:
        return False
    # Delete file from disk
    if db_img.image_path:
        static_dir = Path(__file__).resolve().parent.parent.parent / "static"
        file_path = static_dir / "images" / db_img.image_path
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError:
            pass  # File already gone or permission issue
    session.delete(db_img)
    session.commit()
    return True


def create_evidences_batch(
    *, session: Session, case_id: int, evidences: list[dict]
) -> list[Evidence]:
    """Bulk-insert evidence items extracted by the LLM. Each dict has keys:
    evidence_type, category, description, location (optional), state_dict (optional).
    """
    db_evidences = []
    for ev in evidences:
        state_dict = ev.get("state_dict")
        state_json = json.dumps(state_dict, ensure_ascii=False) if state_dict else None
        db_ev = Evidence(
            case_id=case_id,
            category=ev["category"],
            evidence_type=ev["evidence_type"],
            description=ev["description"],
            location=ev.get("location"),
            state_json=state_json,
            is_approved=False,
            is_excluded=False,
        )
        session.add(db_ev)
        db_evidences.append(db_ev)
    session.commit()
    for ev in db_evidences:
        session.refresh(ev)
    return db_evidences


def get_evidences_by_case(*, session: Session, case_id: int) -> list[Evidence]:
    """Get all evidence items for a given case."""
    statement = select(Evidence).where(Evidence.case_id == case_id)
    return list(session.exec(statement).all())


def get_evidence(*, session: Session, evidence_id: int) -> Evidence | None:
    """Get a single evidence item by primary key."""
    return session.get(Evidence, evidence_id)


def update_evidence(
    *, session: Session, db_evidence: Evidence, evidence_update: EvidenceUpdate
) -> Evidence:
    """Update an evidence item (teacher review: approve, exclude, edit)."""
    update_dict = evidence_update.model_dump(exclude_unset=True)
    db_evidence.sqlmodel_update(update_dict)
    session.add(db_evidence)
    session.commit()
    session.refresh(db_evidence)
    return db_evidence


def create_scene_state(
    *, session: Session, case_id: int, scene_name: str, state_json: str
) -> SceneState:
    """Save a deduced scene state snapshot."""
    db_scene = SceneState(
        case_id=case_id,
        scene_name=scene_name,
        state_json=state_json,
    )
    session.add(db_scene)
    session.commit()
    session.refresh(db_scene)
    return db_scene


def get_scene_by_case(*, session: Session, case_id: int) -> SceneState | None:
    """Get the most recent scene state for a case."""
    statement = (
        select(SceneState)
        .where(SceneState.case_id == case_id)
        .order_by(SceneState.created_at.desc())
        .limit(1)
    )
    return session.exec(statement).first()


# ==============================================================================
# Scene CRUD
# ==============================================================================


def create_scene(*, session: Session, case_id: int, data: SceneCreate) -> Scene:
    """Create a scene for a case."""
    db_scene = Scene(
        case_id=case_id,
        name=data.name,
        room_type=data.room_type,
        sort_order=data.sort_order,
        created_at=get_datetime_utc(),
        updated_at=get_datetime_utc(),
    )
    session.add(db_scene)
    session.commit()
    session.refresh(db_scene)
    return db_scene


def get_scenes_by_case(*, session: Session, case_id: int) -> list[Scene]:
    """返回按 sort_order 排序的场景列表。"""
    return list(
        session.exec(
            select(Scene)
            .where(Scene.case_id == case_id)
            .order_by(Scene.sort_order)
        ).all()
    )


def get_scene(*, session: Session, scene_id: int) -> Scene | None:
    """Get a single scene by primary key."""
    return session.get(Scene, scene_id)


def update_scene(*, session: Session, scene_id: int, data: SceneUpdate) -> Scene | None:
    """Update scene name, room_type, or sort_order."""
    db_scene = session.get(Scene, scene_id)
    if not db_scene:
        return None
    update_dict = data.model_dump(exclude_unset=True)
    db_scene.sqlmodel_update(update_dict)
    db_scene.updated_at = get_datetime_utc()
    session.add(db_scene)
    session.commit()
    session.refresh(db_scene)
    return db_scene


def delete_scene(*, session: Session, scene_id: int) -> bool:
    """Delete a scene. Evidence items lose their assignment (ON DELETE SET NULL)."""
    db_scene = session.get(Scene, scene_id)
    if not db_scene:
        return False
    session.delete(db_scene)
    session.commit()
    return True


def reorder_scenes(*, session: Session, case_id: int, scene_ids_ordered: list[int]) -> list[Scene]:
    """按传入的顺序重新设置 sort_order。"""
    for i, sid in enumerate(scene_ids_ordered):
        scene = session.get(Scene, sid)
        if scene and scene.case_id == case_id:
            scene.sort_order = i
            scene.updated_at = get_datetime_utc()
    session.commit()
    return get_scenes_by_case(session=session, case_id=case_id)


def get_evidences_by_scene(*, session: Session, scene_id: int) -> list[Evidence]:
    """Get all evidence items assigned to a given scene."""
    return list(
        session.exec(
            select(Evidence).where(Evidence.scene_id == scene_id)
        ).all()
    )


def get_scene_evidence_count(*, session: Session, scene_id: int) -> int:
    """Get the number of evidence items assigned to a scene."""
    return session.exec(
        select(func.count(Evidence.id)).where(Evidence.scene_id == scene_id)
    ).one()
