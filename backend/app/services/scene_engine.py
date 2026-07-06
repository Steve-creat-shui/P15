"""Scene State Engine — 将提取的证据列表转为结构化的场景状态 JSON。

系统必须"先建立案件世界，再生成图片"。所有空间关系映射表写死在代码中，
不做 LLM 调用，确保确定性和可审计性。

输入：EvidenceItem 列表（来自 evidence_filter.py）
输出：SceneState JSON，可直接用于图像生成 prompt 构建
"""

from datetime import datetime, timezone
from pydantic import BaseModel

from app.services.evidence_filter import EvidenceItem


# ==============================================================================
# 空间关系映射表（写死在代码中）
# ==============================================================================

LOCATION_MAP: dict[str, dict[str, str]] = {
    # 床相关
    "under_bed": {"area": "lower_center", "zone": "bed_area"},
    "under_bed_left": {"area": "lower_left", "zone": "bed_area"},
    "under_bed_right": {"area": "lower_right", "zone": "bed_area"},
    "on_bed": {"area": "center", "zone": "bed_area"},
    # 桌子相关
    "on_desk": {"area": "upper_right", "zone": "desk_area"},
    "under_desk": {"area": "lower_right", "zone": "desk_area"},
    # 窗户相关
    "near_window": {"area": "upper_center", "zone": "window_area"},
    "on_windowsill": {"area": "top_center", "zone": "window_area"},
    # 门相关
    "near_door": {"area": "left_center", "zone": "door_area"},
    "behind_door": {"area": "far_left", "zone": "door_area"},
    # 地面
    "on_floor": {"area": "center", "zone": "floor_area"},
    "floor_left": {"area": "left_center", "zone": "floor_area"},
    "floor_right": {"area": "right_center", "zone": "floor_area"},
    # 柜子/抽屉
    "in_drawer": {"area": "right_center", "zone": "storage_area"},
    "on_shelf": {"area": "upper_right", "zone": "storage_area"},
    # 沙发/茶几区
    "on_sofa": {"area": "center_left", "zone": "sofa_area"},
    "under_sofa": {"area": "lower_left", "zone": "sofa_area"},
    "on_coffee_table": {"area": "center", "zone": "sofa_area"},
    "under_coffee_table": {"area": "lower_center", "zone": "sofa_area"},
    # 接待台/前台区
    "on_reception_desk": {"area": "upper_center", "zone": "reception_area"},
    "behind_reception_desk": {"area": "upper_left", "zone": "reception_area"},
    "near_reception": {"area": "center_left", "zone": "reception_area"},
    # 衣物相关
    "on_clothing": {"area": "center", "zone": "clothing_area"},
    "under_clothing": {"area": "lower_center", "zone": "clothing_area"},
    "in_wardrobe": {"area": "right_center", "zone": "storage_area"},
    "on_hanger": {"area": "upper_right", "zone": "clothing_area"},
    # 血迹/痕迹（不是物品，是位置描述）
    "blood_on_floor": {"area": "center", "zone": "floor_area"},
    "blood_on_wall": {"area": "center_right", "zone": "wall_area"},
    "blood_near_door": {"area": "left_center", "zone": "door_area"},
    # 厨房区
    "on_kitchen_counter": {"area": "upper_right", "zone": "kitchen_area"},
    "in_kitchen_sink": {"area": "upper_center", "zone": "kitchen_area"},
    "on_stove": {"area": "upper_left", "zone": "kitchen_area"},
    # 浴室区
    "in_bathroom": {"area": "right_center", "zone": "bathroom_area"},
    "near_toilet": {"area": "lower_right", "zone": "bathroom_area"},
    "in_bathtub": {"area": "center_right", "zone": "bathroom_area"},
    # 通用地面/墙面
    "against_wall": {"area": "top_center", "zone": "wall_area"},
    "corner_left": {"area": "far_left", "zone": "floor_area"},
    "corner_right": {"area": "far_right", "zone": "floor_area"},
}

DEFAULT_POSITION: dict[str, str] = {"area": "center", "zone": "floor_area"}


# ==============================================================================
# 房间类型推断
# ==============================================================================

ROOM_KEYWORDS: dict[str, str] = {
    "卧室": "bedroom",
    "卧房": "bedroom",
    "主卧": "bedroom",
    "客厅": "living_room",
    "起居室": "living_room",
    "厨房": "kitchen",
    "书房": "office",
    "办公室": "office",
    "卫生间": "bathroom",
    "浴室": "bathroom",
    "洗手间": "bathroom",
    "走廊": "hallway",
    "楼道": "hallway",
    "阳台": "balcony",
    "包房": "ktv_room",
    "KTV": "ktv_room",
    "仓库": "warehouse",
    "车库": "garage",
    "地下室": "basement",
    "室外": "outdoor",
    "接待室": "reception_room",
    "会客室": "reception_room",
    "接待区": "reception_room",
    "前台": "reception_room",
    "会议室": "conference_room",
}


# ==============================================================================
# 输出 Pydantic 模型
# ==============================================================================

class SceneObject(BaseModel):
    id: str                         # 如 "knife_1", "phone_2"
    object_type: str                # 物品类型（与 evidence_type 对应）
    description: str                # 中文描述
    location_key: str               # 对应 LOCATION_MAP 的键
    render_position: dict           # 由 LOCATION_MAP 解析出的渲染位置
    state: dict                     # {"bloody": True, "broken": False} 等
    evidence_category: str          # extractable / uncertain


class SceneState(BaseModel):
    scene_id: str
    scene_name: str                 # 如 "卧室"
    base_room_type: str             # bedroom / living_room / office / outdoor
    objects: list[SceneObject]
    created_at: str


# ==============================================================================
# 英文翻译映射（用于图像生成 prompt）
# ==============================================================================

_ROOM_TYPE_EN: dict[str, str] = {
    "bedroom": "A typical bedroom with a bed, nightstands, and wardrobe",
    "living_room": "A typical living room with sofa, coffee table, and TV stand",
    "kitchen": "a kitchen with countertops, appliances, and sink",
    "office": "an office with desks and office equipment",
    "bathroom": "a bathroom with tiles, toilet, and sink",
    "corridor": "A narrow corridor with doors on both sides",
    "hallway": "an interior hallway or corridor",
    "balcony": "an outdoor balcony space",
    "ktv_room": "A KTV private room with sofa, coffee table, and TV screen",
    "warehouse": "a storage warehouse with shelving",
    "garage": "an enclosed garage space",
    "basement": "A basement with concrete walls and dim lighting",
    "outdoor": "An outdoor scene with natural lighting",
    "stairwell": "A stairwell with steps and railings",
    "reception_room": "a reception room / lobby area with a front desk, chairs, and professional setting",
    "conference_room": "a conference room with a meeting table and chairs",
}

_OBJ_TYPE_EN: dict[str, str] = {
    "物证": "physical evidence item",
    "书证": "documentary evidence",
    "现场结构": "structural element",
    "空间关系": "spatial marker",
}

_STATE_ADJ_EN: dict[str, str] = {
    "bloody": "bloodstained",
    "broken": "broken",
    "dirty": "soiled",
    "wet": "wet",
    "burnt": "charred",
    "rusty": "rusted",
    "torn": "torn",
    "shattered": "shattered",
    "cracked": "cracked",
    "stained": "stained",
    "folded": "folded",
    "open": "open",
    "closed": "closed",
    "locked": "locked",
    "empty": "empty",
    "full": "full",
}

# ⭐ 中文状态键 → 英文描述（LLM 返回的中文键不固定，做关键词匹配）
# 优先级：长的关键词放在前面，避免被短的截胡
_CN_STATE_PATTERNS: list[tuple[str, str]] = [
    # 血迹/血液相关（高优先级，描述更醒目）
    ("喷溅血迹", "with prominent bright red blood spatter on the surface, fresh blood splashes clearly visible"),
    ("擦拭状血迹", "with smeared bloodstain patterns, wipe marks from blood clearly visible"),
    ("滴落状血迹", "with dripped bloodstain pattern, round blood drops clearly visible"),
    ("血迹分布", "with blood stain distribution pattern, multiple blood stains visible"),
    ("干涸血迹", "with dark dried bloodstains, oxidized blood residue visible"),
    ("氧化血迹", "with dark brown oxidized blood stains"),
    ("接触性出血", "with contact bleeding marks, transfer bloodstains visible"),
    ("鲜血", "with vivid fresh bright red blood stains, fresh blood wet and glistening"),
    ("血迹", "with prominent vivid red blood stains, fresh blood stains clearly visible on the surface"),
    ("血痕", "with prominent vivid red blood stains, fresh blood stains clearly visible on the surface"),
    ("带血", "covered with prominent vivid red blood stains, fresh blood clearly visible"),
    ("血", "with visible blood stains"),
    # 唾液/生物痕迹
    ("唾液印记", "with prominent dark saliva stain marks on the surface, saliva residue clearly visible as dark wet patches"),
    ("唾液斑", "with prominent dark saliva stain marks on the surface, saliva residue clearly visible as dark wet patches"),
    ("唾液", "with visible dark saliva stains and moist saliva residue"),
    ("精斑", "with visible biological stain marks"),
    ("精液", "with visible biological stain marks"),
    # 现场混乱（凌乱、散落等）
    ("凌乱", "in a chaotic, messy state, items scattered and overturned, signs of struggle visible"),
    ("混乱", "in a chaotic, messy state, items scattered and overturned, signs of struggle visible"),
    ("翻倒", "overturned, knocked over, tipped on its side"),
    ("打斗痕迹", "with clear signs of violent struggle, items displaced and knocked over"),
    ("挣扎痕迹", "with clear signs of struggle and resistance"),
    # 指纹掌纹
    ("指纹", "with visible fingerprints on the surface"),
    ("掌纹", "with visible palm prints on the surface"),
    # 毛发/纤维
    ("毛发", "with visible hair fibers"),
    ("纤维", "with visible fabric fibers"),
    # 泥土灰尘
    ("泥土", "with soil residue and dirt marks visible"),
    ("灰尘", "with dust and dirt marks visible"),
    # 毒物药物
    ("毒物", "with toxic substance residue visible"),
    ("药物", "with drug residue visible"),
    # 物理状态
    ("破碎", "broken or shattered into pieces"),
    ("碎片", "shattered into fragments"),
    ("散落", "scattered on the ground"),
    ("划痕", "with visible cut marks or scratches on the surface"),
    ("撕裂", "torn, ripped fabric visible"),
    ("烧灼", "charred, burnt marks visible"),
    ("污渍", "stained, dirty marks visible"),
    ("湿润", "wet, moist surface visible"),
    ("锈蚀", "rusted, rust stains visible"),
    ("裂纹", "cracked, crack lines visible"),
    ("折叠", "folded"),
    ("开启", "in open state"),
    ("关闭", "closed"),
    ("上锁", "locked"),
    ("空的", "empty"),
    ("装满", "full"),
    # 凶器
    ("凶器", "weapon, murder weapon"),
    # 生物痕迹
    ("生物痕迹", "with biological trace evidence visible"),
    ("DNA", "with potential DNA evidence"),
    # 伤情相关
    ("钝器伤", "with blunt force injury marks"),
    ("锐器伤", "with sharp force injury marks, cut marks"),
    ("牙齿印", "with teeth marks, bite marks visible"),
    ("抓痕", "with scratch marks visible"),
    ("淤青", "with bruise marks, contusion visible"),
    ("挫伤", "with contusion, bruising visible"),
    ("擦挫伤", "with abrasion and contusion marks"),
    ("表皮剥脱", "with skin abrasion marks"),
    ("皮下出血", "with subcutaneous bleeding visible"),
    ("创口", "with open wound visible"),
    ("裂伤", "with laceration wound visible"),
    ("砍创", "with chop wound visible"),
    ("刺创", "with stab wound visible"),
    ("骨折", "with bone fracture"),
    ("红肿", "with swelling, red and swollen"),
    ("肿胀", "with swelling visible"),
    ("皮下淤血", "with subcutaneous hematoma visible"),
]


def _translate_state(state: dict | None) -> str:
    """将状态 dict 转为英文描述字符串。支持英文键和中文键两种格式。

    字符串类型的值（如 fingerprints: "张默"）会被保留为 key:value 对，
    确保细节信息（指纹归属、血迹来源等）不丢失。
    """
    if not state:
        return ""
    parts = []
    for k, v in state.items():
        if isinstance(v, bool) and v is True:
            # 先查英文映射
            adj = _STATE_ADJ_EN.get(k)
            if not adj:
                # 中文键：用关键词匹配
                adj = _match_cn_state(k)
            parts.append(adj)
        elif isinstance(v, str):
            # ⭐ 修复：字符串值始终保留，不按 key 长度丢弃
            # 先尝试中文关键词匹配
            cn_match = _match_cn_state(k)
            if cn_match != k:
                # 关键词命中：输出英文描述 + 详细信息
                parts.append(f"{cn_match} ({v})")
            else:
                # 未命中：保留原始 key:value，给 AI 上下文
                parts.append(f"{k}: {v}")
        elif isinstance(v, bool) and v is False:
            pass  # 跳过 false 的 boolean 状态
        else:
            parts.append(f"{k}: {v}")
    return ", ".join(parts)


def _match_cn_state(key: str) -> str:
    """用中文关键词匹配英文状态描述。"""
    for cn_kw, en_desc in _CN_STATE_PATTERNS:
        if cn_kw in key:
            return en_desc
    return key


# ==============================================================================
# 场景级别环境信号聚合（确保地面血迹/混乱等不只依附于单个物证）
# ==============================================================================

# (触发关键词集合, 场景级别描述)
# 集合内的关键词在所有物证 state/description 中出现任一即触发
_SCENE_LEVEL_SIGNALS: list[tuple[set[str], str]] = [
    # 混乱/打斗（场景级别）
    (
        {"凌乱", "混乱", "翻倒", "打斗痕迹", "挣扎痕迹", "chaotic", "messy", "overturned", "struggle"},
        "The WHOLE ROOM is in CHAOTIC, MESSY DISARRAY — furniture and items are displaced, "
        "scattered, knocked over, and overturned. Clear SIGNS OF VIOLENT STRUGGLE are visible "
        "throughout the scene. The overall environment looks disheveled and disturbed.",
    ),
    # 地面血迹（场景级别，区别于物证上的血迹）
    (
        {"血迹", "喷溅血迹", "干涸血迹", "滴落状血迹", "擦拭状血迹", "血痕", "鲜血", "带血", "血", "bloody", "blood"},
        "PROMINENT VIVID RED BLOOD STAINS are clearly visible on the FLOOR throughout the scene — "
        "fresh glistening blood pools, blood spatter patterns, dripped blood drops, and wiped "
        "bloodstain marks on the floor. The blood appears fresh, BRIGHT RED, and HIGHLY VISIBLE — "
        "not subtle or hidden. The floor shows clear evidence of bloodshed.",
    ),
    # 唾液（场景级别）
    (
        {"唾液", "唾液印记", "唾液斑", "saliva"},
        "DARK WET SALIVA STAIN MARKS are visible on the floor and surfaces — "
        "saliva residue appears as distinct dark wet patches, highly visible and unmistakable.",
    ),
    # 破碎/碎片（场景级别）
    (
        {"破碎", "碎片", "散落", "broken", "shattered", "scattered"},
        "Broken fragments and scattered debris are visible on the floor, "
        "items appear smashed and scattered around the scene.",
    ),
    # 指纹（场景级别）
    (
        {"指纹", "掌纹", "fingerprints", "palm"},
        "Visible fingerprints and palm prints on the surfaces of items and nearby walls.",
    ),
    # 生物痕迹（场景级别）
    (
        {"生物痕迹", "DNA", "毛发", "纤维", "biological", "dna", "hair", "fiber"},
        "Biological trace evidence (hair fibers, fabric fibers, potential DNA) is visible "
        "in the scene, scattered on the floor and around evidence items.",
    ),
]


def _aggregate_scene_conditions(objects: list["SceneObject"]) -> list[str]:
    """聚合所有物证的 state/description 字段，生成场景级别的环境描述列表。

    作用：
    - 物证 state 描述的是"这个物证的状态"（如"刀上有血迹"）
    - 场景级别描述的是"整个场景的环境"（如"地面有明显血迹"、"房间混乱"）
    - 即便原文只把"血迹"附着在某个物证上，本函数也将其提升为场景级别特征
      （地面血迹本质上是场景属性，不应只依附于单一物证）

    Returns:
        list[str]: 场景级别环境描述列表（去重，按 _SCENE_LEVEL_SIGNALS 顺序）
    """
    import logging
    logger = logging.getLogger(__name__)

    # 收集所有可触发的文本
    all_text: list[str] = []
    for obj in objects:
        if obj.state:
            for k, v in obj.state.items():
                all_text.append(str(k))
                if isinstance(v, str):
                    all_text.append(v)
        if obj.description:
            all_text.append(obj.description)

    combined = "\n".join(all_text)

    conditions: list[str] = []
    matched_signals: set[int] = set()
    for idx, (triggers, desc) in enumerate(_SCENE_LEVEL_SIGNALS):
        for trigger in triggers:
            if trigger in combined:
                conditions.append(desc)
                matched_signals.add(idx)
                logger.info(
                    f"[scene_engine] 场景级信号触发 [{trigger}] -> 描述加入 prompt"
                )
                break

    return conditions


# ==============================================================================
# 场景构建时排除的证据类型（不出现在场景图中）
# ==============================================================================

# 这些类型的证据即使被确认，也不会出现在场景图中
SCENE_EXCLUDED_TYPES = {
    "鉴定意见",
    "勘验笔录",
    "书证",      # 书证是纸质文件，不需要放在场景图中
    "电子数据",  # 电子数据是虚拟的，不需要放在场景图中
    "人身检查",  # 人身检查结果用于伤情特写，不出现在场景图中
}


def _is_excluded_from_scene(evidence_type: str) -> bool:
    """判断证据类型是否应该从场景图中排除。

    Args:
        evidence_type: 证据类型字符串

    Returns:
        bool: True 表示应该排除
    """
    if not evidence_type:
        return False
    # 精确匹配
    if evidence_type in SCENE_EXCLUDED_TYPES:
        return True
    # 关键词匹配
    excluded_keywords = ["鉴定", "勘验", "笔录", "报告", "意见书", "鉴定书"]
    for kw in excluded_keywords:
        if kw in evidence_type:
            return True
    return False


# ==============================================================================
# 核心函数
# ==============================================================================

def get_render_position(location_key: str) -> dict:
    """将空间关系键名转为渲染坐标信息。

    如果 location_key 不在 LOCATION_MAP 中，返回默认位置 floor_center。

    Args:
        location_key: 如 "under_bed_left", "on_desk"

    Returns:
        dict: {"area": "...", "zone": "..."}
    """
    if not location_key:
        return dict(DEFAULT_POSITION)
    return dict(LOCATION_MAP.get(location_key, DEFAULT_POSITION))


def _area_to_natural_language(area: str, zone: str) -> str:
    """
    将 area/zone 字符串转为 prompt 中自然语言位置描述（英文）。
    用于 scene_objects_to_rich_prompt() 生成人类可读的位置描述。
    """
    AREA_PHRASES = {
        "lower_left": "on the lower-left area of the floor",
        "lower_right": "on the lower-right area of the floor",
        "lower_center": "on the floor near the center-bottom",
        "upper_left": "on the upper-left area",
        "upper_right": "on the upper-right area",
        "upper_center": "on the upper-center area",
        "center": "in the center of the scene",
        "center_left": "on the left-center area",
        "center_right": "on the right-center area",
        "left_center": "along the left side",
        "right_center": "along the right side",
        "top_center": "near the top center (wall area)",
        "far_left": "in the far left corner",
        "far_right": "in the far right corner",
    }

    ZONE_PHRASES = {
        "bed_area": "near the bed",
        "desk_area": "near the desk",
        "sofa_area": "near the sofa or coffee table",
        "reception_area": "near the reception desk",
        "kitchen_area": "in the kitchen area",
        "bathroom_area": "in the bathroom area",
        "floor_area": "on the floor",
        "wall_area": "against the wall",
        "storage_area": "near the storage or wardrobe",
        "clothing_area": "on or near clothing",
        "door_area": "near the door",
        "window_area": "near the window",
    }

    # 优先用 zone 描述（更语义化），fallback 到 area
    return ZONE_PHRASES.get(zone, AREA_PHRASES.get(area, "somewhere in the scene"))


def _infer_room_type(scene_name: str) -> str:
    """根据场景名称中的关键词推断 base_room_type。"""
    for kw, room_type in ROOM_KEYWORDS.items():
        if kw in scene_name:
            return room_type
    return "bedroom"  # 默认


def _generate_object_id(obj_type: str, description: str, index: int) -> str:
    """生成物品唯一 ID，如 knife_1, phone_2。"""
    # 从描述中提取英文关键词
    type_hint = description[:4] if len(description) <= 8 else description[:3]
    sanitized = "".join(c for c in type_hint if c.isalnum() or c in "_")
    if not sanitized:
        sanitized = obj_type.replace(" ", "_")
    return f"{sanitized}_{index}"


def build_scene_from_evidence(
    evidence_list: list[EvidenceItem],
    scene_name: str = "案发现场",
) -> SceneState:
    """将证据列表转为 Scene State。

    只处理 extractable_evidence，不处理 uncertain 和 non_visualizable。
    自动过滤掉不应出现在场景图中的证据类型（鉴定意见、勘验笔录、书证、电子数据等）。
    自动推断 base_room_type（根据场景名称关键词）。

    Args:
        evidence_list: 来自 EvidenceFilterResult.extractable_evidence
        scene_name: 场景名称

    Returns:
        SceneState: 包含所有可渲染物品的结构化场景状态
    """
    import logging
    logger = logging.getLogger(__name__)

    objects: list[SceneObject] = []
    excluded_count = 0

    for idx, ev in enumerate(evidence_list, 1):
        # 过滤掉不应出现在场景图中的证据类型
        if _is_excluded_from_scene(ev.evidence_type):
            excluded_count += 1
            logger.info(
                f"[build_scene_from_evidence] 排除非场景证据: "
                f"[{ev.evidence_type}] {ev.description[:50]}"
            )
            continue

        loc_key = ev.location or "on_floor"
        render_pos = get_render_position(loc_key)

        obj = SceneObject(
            id=_generate_object_id(ev.evidence_type, ev.description, idx),
            object_type=ev.evidence_type,
            description=ev.description,
            location_key=loc_key,
            render_position=render_pos,
            state=ev.state or {},
            evidence_category="extractable",
        )
        objects.append(obj)

    if excluded_count > 0:
        logger.info(
            f"[build_scene_from_evidence] 共排除 {excluded_count} 项非场景证据"
        )

    base_room = _infer_room_type(scene_name)

    return SceneState(
        scene_id=f"scene_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        scene_name=scene_name,
        base_room_type=base_room,
        objects=objects,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def scene_to_image_prompt(scene: SceneState, case_style: str | None = None) -> str:
    """将 SceneState 转为空白场景生成的英文 Prompt。

    用于空白场景生成（不含物证）。

    Args:
        scene: 已构建的场景状态
        case_style: 可选的 case 级别环境/装修风格描述

    Returns:
        str: 英文 prompt 字符串
    """
    room_desc = _ROOM_TYPE_EN.get(scene.base_room_type, "A generic indoor scene")
    case_prefix = f" The scene is located in: {case_style}." if case_style else ""
    return (
        f"crime scene investigation photo, {room_desc}.{case_prefix}"
        f"empty room with no people, no furniture or minimal furniture, "
        f"forensic style, overhead view, "
        f"professional lighting, 4k, photorealistic"
    )


def object_to_inpaint_prompt(obj: SceneObject) -> str:
    """将单个物品转为 inpainting 的英文 Prompt。

    Args:
        obj: 单个场景物品

    Returns:
        str: 英文 inpainting prompt 字符串
    """
    type_en = _OBJ_TYPE_EN.get(obj.object_type, "evidence item")
    state_str = _translate_state(obj.state)

    parts = ["forensic evidence photo", type_en]
    parts.append(f"a {obj.description}" if obj.description else "(unknown object)")

    if state_str:
        parts.append(state_str)

    parts.append("realistic, forensic investigation style, neutral background")
    return ", ".join(parts)


def evidence_list_to_prompts(
    evidence_list: list[EvidenceItem],
    scene_name: str = "案发现场",
) -> dict:
    """一站式函数：将证据列表直接转为场景 + 全部物品 prompt。

    返回结构：
    {
        "scene_state": SceneState JSON,
        "scene_prompt": str,        # 空白场景 prompt
        "object_prompts": list[dict] # 每个物品的 prompt + id
    }

    Args:
        evidence_list: 来自 EvidenceFilterResult.extractable_evidence
        scene_name: 场景名称

    Returns:
        dict: 包含 scene_state, scene_prompt, object_prompts
    """
    scene = build_scene_from_evidence(evidence_list, scene_name)
    scene_prompt = scene_to_image_prompt(scene)

    object_prompts = []
    for obj in scene.objects:
        object_prompts.append({
            "id": obj.id,
            "prompt": object_to_inpaint_prompt(obj),
            "description": obj.description,
            "render_position": obj.render_position,
        })

    return {
        "scene_state": scene.model_dump(),
        "scene_prompt": scene_prompt,
        "object_prompts": object_prompts,
    }


# ==============================================================================
# Rich Prompt Builder（一场景一图）
# ==============================================================================

# ⭐ DALL·E 3 的安全 prompt 上限
_MAX_PROMPT_CHARS = 3800
_PROMPT_WARNING_THRESHOLD = 8  # 超过此数量的物品时，前端提示教师拆分场景


def scene_objects_to_rich_prompt(
    scene: SceneState,
    case_style: str | None = None,
) -> tuple[str, list[str]]:
    """
    将场景状态转为图像生成的 Rich Prompt（英文）。

    返回：
    - prompt: str — 最终用于 API 调用的 prompt
    - omitted_items: list[str] — 因超出长度上限而被省略的物品描述列表

    核心原则：
    - 代码控制 AI，不允许 AI 自由发挥
    - 所有物品位置来自 SceneState，不推断
    - prompt 不超过 _MAX_PROMPT_CHARS 字符
    - ⭐ 不丢弃任何物品：超出上限时使用紧凑格式而非省略
    """
    import logging
    logger = logging.getLogger(__name__)

    room_desc = _ROOM_TYPE_EN.get(scene.base_room_type, "a crime scene room")

    # 注入 case 级别风格描述
    case_style_prefix = ""
    if case_style:
        case_style_prefix = (
            f" The scene is located in: {case_style}."
        )

    # ⭐ 场景级环境条件（地面血迹/混乱/唾液等）— 不依附于单个物证
    scene_conditions = _aggregate_scene_conditions(scene.objects)
    env_section = ""
    if scene_conditions:
        env_section = (
            "\nSCENE ENVIRONMENT (CRITICAL — applies to the WHOLE scene, not just individual items):\n"
            + "\n".join(f"- {cond}" for cond in scene_conditions)
            + "\n"
        )

    # 固定前缀（不可压缩部分）
    prefix = (
        f"Forensic crime scene investigation photo, {room_desc}."
        f"{case_style_prefix}"
        f" Crime scene tape visible. Professional forensic photography, "
        f"overhead or wide-angle view, realistic, 4k, no people, no text."
        f"{env_section}"
        f" The following evidence items are present:\n"
    )

    # 固定后缀（增强约束，强调细节可见性和混乱程度）
    suffix = (
        "\nCRITICAL RENDERING RULES:\n"
        "- EVERY item listed above MUST be clearly visible in the image.\n"
        "- ALL state details (blood, saliva, fingerprints, stains, tears, breaks) "
        "MUST be HIGHLY VISIBLE and clearly rendered on the items — vivid red "
        "bloodstains must look bright red and prominent, not subtle.\n"
        "- Saliva stains must be visible as dark wet patches.\n"
        "- If any item has a 'chaotic' or 'messy' or 'overturned' state, the "
        "overall scene should reflect signs of struggle, with items displaced, "
        "scattered, and the environment in disarray.\n"
        "- Place each item exactly as described with the described state and position.\n"
        "- The SCENE ENVIRONMENT section above is NON-NEGOTIABLE — blood pools, "
        "saliva stains, and chaotic state must be clearly visible at the scene level, "
        "especially on the FLOOR (not only on individual items).\n"
        "- Forensic evidence style, high detail, realistic lighting, sharp focus "
        "on all evidence items."
    )

    fixed_length = len(prefix) + len(suffix)
    available_chars = _MAX_PROMPT_CHARS - fixed_length

    # 逐条构建物品描述
    item_lines = []
    omitted_items = []
    current_length = 0

    for i, obj in enumerate(scene.objects):
        # 构建单条物品描述 — 使用 _translate_state() 支持中英文状态键
        state_desc = _translate_state(obj.state)
        if state_desc:
            state_desc = f", {state_desc}"

        position_desc = _area_to_natural_language(
            obj.render_position.get("area", "center"),
            obj.render_position.get("zone", "floor_area"),
        )

        # 完整格式
        full_line = f"{i+1}. {obj.object_type} ({obj.description}){state_desc} — {position_desc}\n"
        # 紧凑格式（空间不足时使用）
        compact_line = f"{i+1}. {obj.description} — {position_desc}\n"

        if current_length + len(full_line) <= available_chars:
            item_lines.append(full_line)
            current_length += len(full_line)
        elif current_length + len(compact_line) <= available_chars:
            # 空间不足以用完整格式，使用紧凑格式
            item_lines.append(compact_line)
            current_length += len(compact_line)
            logger.info(
                f"[scene_engine] 物品 '{obj.description}' 使用紧凑格式 "
                f"(场景: {scene.scene_name}, 节省 {len(full_line) - len(compact_line)} 字符)"
            )
        else:
            # 连紧凑格式也放不下 — 记录为省略（极少发生）
            omitted_items.append(obj.description)
            logger.warning(
                f"[scene_engine] Prompt 长度超限，物品被省略: {obj.description} "
                f"(场景: {scene.scene_name}, 当前长度: {fixed_length + current_length})"
            )

    # 如果有被省略的物品，加注
    omit_note = ""
    if omitted_items:
        omit_note = (
            f"\n[WARNING: {len(omitted_items)} additional items could not fit "
            f"in the prompt. Consider splitting this scene.]"
        )

    final_prompt = prefix + "".join(item_lines) + suffix + omit_note

    # 最终安全检查（极少触发，只有 prompt 在紧凑格式后仍超出才截断）
    if len(final_prompt) > _MAX_PROMPT_CHARS:
        final_prompt = final_prompt[:_MAX_PROMPT_CHARS]
        logger.error(f"[scene_engine] Prompt 超出硬上限，已强制截断")

    return final_prompt, omitted_items

    return final_prompt, omitted_items


def get_scene_prompt_warning(scene: SceneState) -> dict:
    """
    检查场景物品数量，返回给前端的提示信息。
    用于在生成前告知教师是否需要拆分场景。
    """
    count = len(scene.objects)
    if count > _PROMPT_WARNING_THRESHOLD:
        return {
            "should_warn": True,
            "message": (
                f"当前场景有 {count} 项物证，超过建议上限（{_PROMPT_WARNING_THRESHOLD}）。"
                f"建议将场景拆分为多个，以确保所有物品都能在图中呈现。"
            ),
            "item_count": count,
            "threshold": _PROMPT_WARNING_THRESHOLD,
        }
    return {"should_warn": False, "item_count": count}


# ==============================================================================
# 场景自动建议
# ==============================================================================


def suggest_scenes_from_text(raw_text: str) -> list[dict]:
    """
    扫描案件文本，根据 ROOM_KEYWORDS 建议场景列表。
    返回去重、按出现顺序排列的建议。
    无匹配时返回一个默认「案发现场」建议。

    返回格式：
    [
        {"name": "卧室", "room_type": "bedroom", "reason": "文本中出现了关键词「卧室」"},
        {"name": "客厅", "room_type": "living_room", "reason": "文本中出现了关键词「客厅」"},
    ]
    """
    suggestions = []
    seen_room_types = set()

    for keyword, room_type in ROOM_KEYWORDS.items():
        if keyword in raw_text and room_type not in seen_room_types:
            suggestions.append({
                "name": keyword,
                "room_type": room_type,
                "reason": f"文本中出现了关键词「{keyword}」",
            })
            seen_room_types.add(room_type)

    # 按在文本中首次出现的位置排序
    suggestions.sort(key=lambda s: raw_text.find(s["name"]))

    # 无匹配时给默认建议
    if not suggestions:
        suggestions = [{
            "name": "案发现场",
            "room_type": "unknown",
            "reason": "文本中未检测到具体场景关键词，建议使用默认场景名称",
        }]

    return suggestions


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    import json

    # 模拟 evidence_filter 输出
    test_evidences = [
        EvidenceItem(
            evidence_type="物证",
            description="带血水果刀",
            location="under_bed_left",
            state={"bloody": True},
            source_quote="床下发现一把带血的水果刀（已提取，编号物证1）",
        ),
        EvidenceItem(
            evidence_type="物证",
            description="破碎屏幕的手机",
            location="under_bed_right",
            state={"broken": True},
            source_quote="旁边有一部破碎屏幕的手机（物证2）",
        ),
    ]

    print("=" * 60)
    print("Scene State Engine — 测试用例")
    print("=" * 60)
    print(f"\n输入证据: {len(test_evidences)} 条\n")

    # 单步测试
    for ev in test_evidences:
        pos = get_render_position(ev.location or "on_floor")
        print(f"  {ev.description}")
        print(f"    location_key: {ev.location}")
        print(f"    render_position: {pos}")
        print()

    # 构建场景
    scene = build_scene_from_evidence(test_evidences, scene_name="卧室")
    print(f"Scene ID: {scene.scene_id}")
    print(f"Scene Name: {scene.scene_name}")
    print(f"Room Type: {scene.base_room_type}")
    print(f"Objects: {len(scene.objects)}")
    print()

    # 完整 JSON 输出
    print("=" * 60)
    print("完整 SceneState JSON:")
    print("=" * 60)
    print(scene.model_dump_json(indent=2, ensure_ascii=False))
    print()

    # 图像 prompt
    print("=" * 60)
    print("空白场景 Prompt:")
    print(scene_to_image_prompt(scene))
    print()

    print("=" * 60)
    print("物品 Inpaint Prompts:")
    for obj in scene.objects:
        prompt = object_to_inpaint_prompt(obj)
        print(f"  [{obj.id}] {prompt}")

    print()
    print("=" * 60)
    print("一站式输出 (evidence_list_to_prompts):")
    result = evidence_list_to_prompts(test_evidences, scene_name="卧室")
    print(json.dumps(result, indent=2, ensure_ascii=False))
