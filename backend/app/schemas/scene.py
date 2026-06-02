from typing import Literal
from pydantic import BaseModel

# ==============================================================================
# Scene State Pydantic Schemas (Instructor Target)
# ==============================================================================

class SceneObjectState(BaseModel):
    name: str
    type: Literal["character", "weapon", "furniture", "structural", "trace"]
    position_3d: list[float]  # [x, y, z] 相对空间三维坐标
    orientation_3d: list[float]  # [rx, ry, rz] 朝向/旋转角度
    properties: dict

class SceneStateSnapshot(BaseModel):
    scene_name: str
    objects: list[SceneObjectState]
    global_environment: dict
    deduction_rationale: str
