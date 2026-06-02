import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore[assignment]
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore[assignment]


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# ==============================================================================
# JEVS Models
# ==============================================================================

class Case(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=255)
    raw_text: str = Field(sa_type=Text)
    status: str = Field(default="pending", max_length=50) # pending/extracted/reviewed/generated
    style_description: str | None = Field(default=None, sa_type=Text)
    # 环境/装修风格描述，用于跨场景图像生成的一致性控制。
    # 如："一栋老式居民楼的公寓单元，浅橡木地板，白色墙面，灰色布艺沙发，简约装修风格"
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class Evidence(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", ondelete="CASCADE")
    category: str = Field(max_length=50) # extractable / uncertain / non_visualizable
    evidence_type: str = Field(max_length=100) # 物证/书证/现场结构/空间关系
    description: str
    location: str | None = Field(default=None, max_length=255)
    state_json: str | None = Field(default=None)
    is_approved: bool = Field(default=False)
    is_excluded: bool = Field(default=False)
    scene_id: int | None = Field(default=None, foreign_key="scene.id")
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class SceneState(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", ondelete="CASCADE")
    scene_name: str = Field(max_length=255) # 如 "卧室", "客厅"
    state_json: str
    scene_id: int | None = Field(default=None, foreign_key="scene.id")
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class Scene(SQLModel, table=True):
    """
    场景表。一个案件可以有多个场景（如卧室、客厅、接待室）。
    每个场景对应一张生成图片。
    """
    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", ondelete="CASCADE")
    name: str = Field(max_length=100)           # 如 "卧室", "接待室"
    room_type: str = Field(default="unknown")   # bedroom/reception_room 等
    sort_order: int = Field(default=0)          # 场景排序，用于生成顺序
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))


class GeneratedImage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", ondelete="CASCADE")
    scene_id: int | None = Field(default=None, foreign_key="scene.id", ondelete="SET NULL")
    image_type: str = Field(max_length=50) # scene_overview / evidence_closeup / document_render
    image_path: str = Field(max_length=512)
    prompt_used: str | None = Field(default=None)
    provider: str = Field(max_length=50) # dalle / flux / pillow / crop
    style: str = Field(default="realistic", max_length=50)
    closeup_strategy: str | None = Field(default=None)
    # 特写生成策略：crop（裁剪法）/ prompt_lock（Prompt锁定法）/ None（非特写图）
    reference_preview_path: str | None = Field(default=None)
    # 裁剪法的红框预览图路径（帮助教师确认裁剪位置）
    created_at: datetime = Field(default_factory=get_datetime_utc, sa_type=DateTime(timezone=True))

