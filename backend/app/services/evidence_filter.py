"""Evidence Filtering Engine — 从判决书中提取可教学化的结构化证据。

使用 Instructor + DeepSeek API 实现严格的结构化输出。系统不是 AI 自由创作，
而是受代码控制的证据重建系统：严禁捏造证据，严禁推测现场，只提取明确、客观、
已确认的内容。
"""

import os
from pydantic import BaseModel
import instructor
from openai import OpenAI

from app.core.config import settings


# ==============================================================================
# Pydantic 输出模型
# ==============================================================================

class EvidenceItem(BaseModel):
    evidence_type: str   # 物证 / 书证 / 现场结构 / 空间关系
    description: str     # 简洁的中文描述，如"带血水果刀"
    location: str | None = None  # 空间位置，如 "under_bed_left", "on_desk"
    state: dict | None = None    # 状态，如 {"bloody": True} 或 {"broken": True}
    source_quote: str    # 原文中的依据片段（用于审计，不超过50字）


class EvidenceFilterResult(BaseModel):
    extractable_evidence: list[EvidenceItem]          # 可直接生成图片的证据
    uncertain_evidence: list[EvidenceItem]            # 需要教师人工确认的证据
    non_visualizable_content: list[str]               # 禁止生成的内容描述列表


# ==============================================================================
# System Prompt（写死在代码中，不允许外部修改）
# ==============================================================================

SYSTEM_PROMPT = """你是一个严格的法律证据分析系统，服务于法学院教学场景。

你的唯一任务是从判决书或案件材料中提取可视化证据。

## 提取规则

### 只能放入 extractable_evidence（可提取）：
- 已被法院确认的物证（刀、手机、血迹等）
- 已被法院确认的书证（合同、聊天记录截图等）
- 已被勘查记录确认的现场结构（门窗位置、家具布局）
- 已被确认的空间关系（物品位置）

### 只能放入 uncertain_evidence（不确定）：
- 证人证词中描述的物品（未经物证确认）
- 文中使用"据称"、"可能"、"疑似"等措辞的内容

### 只能放入 non_visualizable_content（禁止生成）：
- 任何心理活动（"感到恐惧"、"想到了"）
- 任何主观推测（"可能存在"、"疑似"）
- 法官评价和量刑分析
- 动机分析
- 对话和证词内容
- 任何无法直接看到的事物

## 严格禁止
- 不得补全原文中未提及的细节
- 不得推断人物位置或行为
- 不得将证词直接视为客观事实
- description 字段必须是客观名词短语，不得包含动词行为描述

输出必须是严格的 JSON，不得包含任何额外解释。"""


# ==============================================================================
# 核心函数
# ==============================================================================

# 文本最大长度（DeepSeek 上下文窗口限制，留出输出空间）
MAX_TEXT_LENGTH = 24000


def _get_client():
    """获取配置好的 DeepSeek Instructor 客户端。

    使用 Mode.JSON（而非默认的 Mode.TOOLS），因为 DeepSeek 的
    tool_calls 参数 JSON 在中文字符场景下偶发格式错误。
    """
    api_key = settings.DEEPSEEK_API_KEY or ""
    return instructor.from_openai(
        OpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com",
        ),
        mode=instructor.Mode.JSON,
    )


async def extract_evidence(case_text: str) -> EvidenceFilterResult:
    """从案件文本中提取结构化证据。

    使用 DeepSeek API + Instructor 进行严格的结构化输出。
    返回三类证据：可直接生成图片的、需教师确认的、禁止生成内容的描述。

    Args:
        case_text: 判决书或案件材料全文。

    Returns:
        EvidenceFilterResult: 包含三类证据的结构化结果。

    Raises:
        ValueError: LLM 调用失败或输出无法解析。
    """
    # 截断过长文本，保留输出空间
    if len(case_text) > MAX_TEXT_LENGTH:
        case_text = case_text[:MAX_TEXT_LENGTH] + "\n\n[文本过长，已截断]\n"

    client = _get_client()

    response = client.chat.completions.create(
        model="deepseek-chat",
        response_model=EvidenceFilterResult,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"请从以下案件材料中提取可视化证据：\n\n{case_text}"},
        ],
        max_retries=3,
        temperature=0.0,
    )

    return response


async def filter_single_item(description: str) -> bool:
    """判断单个描述是否属于可视化证据。

    用于教师界面的单条证据审核。调用 DeepSeek 判断该描述
    是否属于 extractable（可提取/可视化）类别。

    Args:
        description: 证据描述的文本。

    Returns:
        bool: True 表示该描述属于可视化证据（可提取），False 表示不可提取。
    """
    client = _get_client()

    class _SingleItemVerdict(BaseModel):
        is_visualizable: bool

    response = client.chat.completions.create(
        model="deepseek-chat",
        response_model=_SingleItemVerdict,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"请判断以下描述是否属于可视化证据（可提取类别）。\n"
                    f"描述：{description}\n"
                    f"如果是物证、书证、现场结构或空间关系等可以直接看到或呈现的内容，"
                    f"返回 true；如果是心理活动、主观推测、法官评价、对话内容等无法"
                    f"直接看到的内容，返回 false。"
                ),
            },
        ],
        max_retries=2,
        temperature=0.0,
    )

    return response.is_visualizable


# ==============================================================================
# 测试用例
# ==============================================================================

if __name__ == "__main__":
    import asyncio

    TEST_TEXT = (
        "被害人李某在卧室床下发现一把带血的水果刀（已提取，编号物证1），"
        "旁边有一部破碎屏幕的手机（物证2）。李某当时感到非常害怕。"
    )

    async def main():
        print("=" * 60)
        print("Evidence Filtering Engine — 测试用例")
        print("=" * 60)
        print(f"\n输入文本:\n{TEST_TEXT}\n")

        result = await extract_evidence(TEST_TEXT)

        print(f"可提取证据: {len(result.extractable_evidence)} 条")
        for item in result.extractable_evidence:
            print(f"  [{item.evidence_type}] {item.description}")
            if item.location:
                print(f"    位置: {item.location}")
            if item.state:
                print(f"    状态: {item.state}")
            print(f"    原文依据: {item.source_quote}")
            print()

        print(f"不确定证据: {len(result.uncertain_evidence)} 条")
        for item in result.uncertain_evidence:
            print(f"  [{item.evidence_type}] {item.description}")
            print(f"    原文依据: {item.source_quote}")
            print()

        print(f"禁止生成内容: {len(result.non_visualizable_content)} 条")
        for item in result.non_visualizable_content:
            print(f"  - {item}")
        print()

        # 测试单条判断
        print("--- filter_single_item 测试 ---")
        test_visual = "带血的水果刀"
        test_not_visual = "李某感到非常害怕"
        r1 = await filter_single_item(test_visual)
        r2 = await filter_single_item(test_not_visual)
        print(f'  "{test_visual}" => {r1} (期望: True)')
        print(f'  "{test_not_visual}" => {r2} (期望: False)')
        print()

    asyncio.run(main())
