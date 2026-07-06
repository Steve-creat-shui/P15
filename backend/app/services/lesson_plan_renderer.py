"""Lesson Plan Renderer — 教案文档自动生成服务。

将案件信息、证据链、场景快照和生成图片汇总为一份
结构化的教学教案，支持 Markdown 格式导出。
"""

import json
from datetime import datetime, timezone
from typing import Any

from app.models import Case, Evidence, GeneratedImage, Scene, SceneState


# ==============================================================================
# 中文字段映射
# ==============================================================================

CHAOS_LEVEL_ZH = {
    "clean": "干净现场（物品整齐）",
    "medium": "一般现场（部分物品散落）",
    "chaotic": "混乱现场（打斗痕迹，翻倒家具）",
}

STATUS_ZH = {
    "pending": "待提取",
    "extracted": "已提取证据",
    "reviewed": "已审核",
    "generated": "已生成图片",
}

CATEGORY_ZH = {
    "extractable": "可提取",
    "uncertain": "需确认",
    "non_visualizable": "不可可视化",
}

EVIDENCE_TYPE_ZH = {
    "物证": "物证",
    "书证": "书证",
    "现场结构": "现场结构",
    "空间关系": "空间关系",
    "人身检查": "人身检查",
}

RELATION_TYPE_ZH = {
    "inside": "在...内部",
    "on_top": "在...上面",
    "next_to": "紧邻",
    "under": "在...下面",
    "spilled_from": "从...溢出",
    "broken_into": "碎裂自",
    "stained_with": "被...染色",
    "attached_to": "附着在",
}

IMAGE_TYPE_ZH = {
    "scene_overview": "场景全图",
    "evidence_closeup": "物证特写",
    "document_render": "书证渲染",
}


def _build_header(case: Case) -> str:
    """生成教案头部：标题 + 基础信息"""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    lines = [
        "---",
        f"title: \"{case.title}\"",
        f"generated_at: \"{now}\"",
        f"status: \"{STATUS_ZH.get(case.status, case.status)}\"",
        f"chaos_level: \"{CHAOS_LEVEL_ZH.get(case.chaos_level, case.chaos_level)}\"",
        "---",
        "",
        f"# 教案：{case.title}",
        "",
        f"| 项目 | 内容 |",
        "|------|------|",
        f"| 案件状态 | {STATUS_ZH.get(case.status, case.status)} |",
        f"| 现场混乱程度 | {CHAOS_LEVEL_ZH.get(case.chaos_level, case.chaos_level)} |",
        f"| 生成时间 | {now} |",
        "",
    ]
    if case.style_description:
        lines.append(f"> **装修/环境风格**：{case.style_description}")
        lines.append("")
    return "\n".join(lines)


def _build_evidence_table(evidences: list[Evidence]) -> str:
    """生成证据链表格"""
    approved = [e for e in evidences if e.is_approved and not e.is_excluded]
    excluded = [e for e in evidences if e.is_excluded]
    pending = [e for e in evidences if not e.is_approved and not e.is_excluded]

    sections = []

    # 统计摘要
    sections.append("## 证据概况\n")
    sections.append(
        f"- 证据总数：**{len(evidences)}** 条\n"
        f"  - ✅ 已采纳：**{len(approved)}** 条\n"
        f"  - ❌ 已排除：**{len(excluded)}** 条\n"
        f"  - ⏳ 待审核：**{len(pending)}** 条\n"
    )

    if not approved:
        sections.append("> ⚠️ 尚无已审核通过的证据。请先完成教师审核流程。\n")
        return "\n".join(sections)

    # 已采纳证据表格
    sections.append("## 已采纳证据（用于场景生成）\n")
    sections.append(
        "| # | 类别 | 类型 | 描述 | 位置 | 状态 | 关联证据 |\n"
        "|---|------|------|------|------|------|----------|\n"
    )
    for i, ev in enumerate(approved, 1):
        location = ev.location or "—"
        state_str = _format_state(ev.state_json)
        relation = _format_relation(ev)
        sections.append(
            f"| {i} | {_category_label(ev.category)} | "
            f"{EVIDENCE_TYPE_ZH.get(ev.evidence_type, ev.evidence_type)} | "
            f"{ev.description} | {location} | {state_str} | {relation} |\n"
        )
    sections.append("")

    # 已排除/待审核（简短列出）
    if excluded:
        sections.append("### 已排除的证据\n")
        for ev in excluded:
            sections.append(f"- ~~{ev.description}~~\n")
        sections.append("")

    if pending:
        sections.append("### 待审核的证据\n")
        for ev in pending:
            sections.append(f"- *{ev.description}*（{EVIDENCE_TYPE_ZH.get(ev.evidence_type, ev.evidence_type)}）\n")
        sections.append("")

    return "\n".join(sections)


def _build_scene_section(
    scenes: list[Scene],
    scene_state: SceneState | None,
    images: list[GeneratedImage],
) -> str:
    """生成场景分析部分"""
    lines = ["## 场景还原", ""]

    if not scenes:
        lines.append("> 尚未创建场景。\n")
        return "\n".join(lines)

    lines.append(f"共 **{len(scenes)}** 个场景：\n")

    for scene in scenes:
        lines.append(f"### {scene.name}（{scene.room_type}）\n")

        # 该场景的图片
        scene_images = [
            img for img in images
            if img.scene_id == scene.id and img.image_type == "scene_overview"
        ]
        if scene_images:
            for img in scene_images:
                rel_path = img.image_path
                lines.append(f"![{scene.name}场景图]({rel_path})")
                lines.append("")
                lines.append(f"- 生成方式：{img.provider}")
                if img.prompt_used:
                    lines.append(f"- 提示词：`{img.prompt_used[:200]}`")
                if img.style:
                    lines.append(f"- 风格：{img.style}")
                lines.append("")

        # 该场景的特写图
        closeups = [
            img for img in images
            if img.scene_id == scene.id and img.image_type == "evidence_closeup"
        ]
        if closeups:
            lines.append(f"#### 物证特写（{len(closeups)} 张）\n")
            for img in closeups:
                rel_path = img.image_path
                lines.append(f"![物证特写]({rel_path})")
                lines.append("")
                if img.closeup_strategy:
                    lines.append(f"- 生成策略：{img.closeup_strategy}")
                if img.reference_preview_path:
                    lines.append(f"- 裁剪参考：`{img.reference_preview_path}`")
                lines.append("")

    # 场景状态快照（JSON 格式展示）
    if scene_state and scene_state.state_json:
        try:
            state_dict = json.loads(scene_state.state_json)
            lines.append("### 场景状态快照\n")
            lines.append("```json")
            lines.append(json.dumps(state_dict, ensure_ascii=False, indent=2))
            lines.append("```\n")
        except (json.JSONDecodeError, TypeError):
            pass

    return "\n".join(lines)


def _build_teaching_notes(case: Case, evidences: list[Evidence]) -> str:
    """生成教学要点建议"""
    lines = ["## 教学建议", ""]

    approved = [e for e in evidences if e.is_approved and not e.is_excluded]

    # 证据链分析
    physical = [e for e in approved if e.evidence_type == "物证"]
    documents = [e for e in approved if e.evidence_type == "书证"]
    structures = [e for e in approved if e.evidence_type == "现场结构"]
    medical = [e for e in approved if e.evidence_type == "人身检查"]

    if physical:
        lines.append(f"**物证教学要点**（{len(physical)} 件）：")
        for ev in physical:
            lines.append(f"- {ev.description} — 引导学生思考该物证的证明意义及取证规范性")
        lines.append("")

    if documents:
        lines.append(f"**书证教学要点**（{len(documents)} 件）：")
        for ev in documents:
            lines.append(f"- {ev.description} — 关注书证的真实性、关联性、合法性审查")
        lines.append("")

    if structures:
        lines.append(f"**现场结构教学要点**（{len(structures)} 处）：")
        for ev in structures:
            lines.append(f"- {ev.description} — 分析该结构对案件事实认定的影响")
        lines.append("")

    if medical:
        lines.append(f"**人身检查/法医证据**（{len(medical)} 处）：")
        for ev in medical:
            lines.append(f"- {ev.description} — 讲解法医检验的证明力与审查要点")
        lines.append("")

    # 基于案情的教学问题设计（通用）
    lines.append("**课堂讨论问题建议：**\n")
    questions = [
        "1. 本案的核心证据链是什么？各项证据之间如何相互印证？",
        "2. 现场的空间关系对案件事实认定有什么影响？",
        "3. 如果某一关键物证被排除，案件事实认定会发生什么变化？",
        "4. 本案中是否存在证据链断裂或矛盾之处？",
    ]
    if case.style_description:
        questions.append(
            "5. 现场环境（装修风格、物品布局）对案件分析有何参考价值？"
        )
    for q in questions:
        lines.append(q)
    lines.append("")

    return "\n".join(lines)


def _build_raw_text_excerpt(case: Case, max_length: int = 1000) -> str:
    """生成判决书原文摘录（用于教案附录）"""
    if not case.raw_text:
        return ""

    lines = [
        "## 附录：判决书原文\n",
        "> 以下为判决书原文节选：\n",
        "",
    ]
    text = case.raw_text[:max_length]
    if len(case.raw_text) > max_length:
        text += "\n\n*（原文过长，仅展示前 {max_length} 字。完整文本请在系统中查看）*"
    lines.append(text)
    lines.append("")
    return "\n".join(lines)


# ==============================================================================
# 辅助函数
# ==============================================================================


def _category_label(category: str) -> str:
    return CATEGORY_ZH.get(category, category)


def _format_state(state_json: str | None) -> str:
    """将 state_json 转为可读的中文状态描述"""
    if not state_json:
        return "—"
    try:
        state = json.loads(state_json)
        if not state:
            return "—"
        parts = []
        for k, v in state.items():
            if k == "custom":
                parts.append(f"({v})")
            elif isinstance(v, bool) and v:
                parts.append(k)
        return "、".join(parts) if parts else "—"
    except (json.JSONDecodeError, TypeError):
        return "—"


def _format_relation(evidence: Evidence) -> str:
    """格式化证据关联关系"""
    if not evidence.related_evidence_id or not evidence.relation_type:
        return "—"
    rel_zh = RELATION_TYPE_ZH.get(evidence.relation_type, evidence.relation_type)
    return f"{rel_zh} #证据{evidence.related_evidence_id}"


# ==============================================================================
# 主入口
# ==============================================================================


async def render_lesson_plan(
    case: Case,
    evidences: list[Evidence],
    scenes: list[Scene],
    scene_state: SceneState | None,
    images: list[GeneratedImage],
    fmt: str = "markdown",
) -> str:
    """生成完整教案文档。

    将案件信息、证据链分析、场景还原、教学建议、
    判决书原文汇总为一份结构化教案。

    Args:
        case: 案件对象
        evidences: 该案件下所有证据列表
        scenes: 该案件下所有场景列表
        scene_state: 最新的场景状态（可选）
        images: 已生成的图片列表
        fmt: 导出格式，当前仅支持 "markdown"

    Returns:
        教案文档内容字符串。
    """
    sections = []

    # 1. 头部信息
    sections.append(_build_header(case))

    # 2. 证据链
    sections.append(_build_evidence_table(evidences))

    # 3. 场景还原（含图片）
    sections.append(_build_scene_section(scenes, scene_state, images))

    # 4. 教学建议
    sections.append(_build_teaching_notes(case, evidences))

    # 5. 判决书原文摘录
    sections.append(_build_raw_text_excerpt(case))

    content = "\n".join(sections)

    if fmt == "markdown":
        return content
    else:
        # 默认返回 markdown
        return content
