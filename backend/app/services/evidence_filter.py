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

## 证据类型说明

evidence_type 字段只能使用以下标准化类型之一：
- 物证：实物证据，如刀、手机、衣物、血迹、凶器等
- 书证：书面文件证据，如合同、欠条、借条、书信等
- 电子数据：电子形式的证据，如聊天记录、通话记录、短信、微信记录、录音、视频等
- 鉴定意见：专业鉴定机构出具的鉴定报告（如法医鉴定、DNA鉴定等）—— 归入 non_visualizable
- 勘验笔录：现场勘查记录文书 —— 归入 non_visualizable
- 现场结构：现场的空间结构，如门窗位置、家具布局等
- 空间关系：物品的位置关系描述
- 人身检查：对被害人/嫌疑人身体检查的结果描述（如伤情、伤痕等）

## 提取规则

### 只能放入 extractable_evidence（可提取）：
- 已被法院确认的物证（刀、手机、血迹、衣物、凶器等）
- 已被法院确认的书证（合同、欠条、借条、书信等纸质文件）
- 已被法院确认的电子数据（聊天记录、通话记录、短信、微信记录等）
- 已被勘查记录确认的现场结构（门窗位置、家具布局）
- 已被确认的空间关系（物品位置）
- 已被确认的人身检查结果（伤情描述，用于生成伤情特写）

### 只能放入 uncertain_evidence（不确定）：
- 证人证词中描述的物品（未经物证确认）
- 文中使用"据称"、"可能"、"疑似"等措辞的内容

### 只能放入 non_visualizable_content（禁止生成场景图）：
- 鉴定意见类证据（法医鉴定报告、DNA鉴定、伤情鉴定等文书）
- 勘验笔录类证据（现场勘查记录文书）
- 任何心理活动（"感到恐惧"、"想到了"）
- 任何主观推测（"可能存在"、"疑似"）
- 法官评价和量刑分析
- 动机分析
- 对话和证词内容（作为文本而非物品）
- 任何无法直接看到的抽象事物

## 重要：物证状态提取
对于物证，**必须**从描述中提取其状态特征到 state 字段中。state 字段是英文短键 + bool/字符串值的 JSON 对象，例如：

### 血迹/血液类
- 刀上有血迹 → {"血迹": true, "凶器": true}
- 刀身有干涸血迹 → {"干涸血迹": true, "血迹": true, "凶器": true}
- 地上有喷溅血迹 → {"喷溅血迹": true, "血迹": true}
- 地面有血泊 → {"血迹": true, "血泊": true}
- 墙面有擦拭状血迹 → {"擦拭状血迹": true, "血迹": true}
- 地面有滴落血迹 → {"滴落状血迹": true, "血迹": true}
- 衣物上沾有血迹 → {"血迹": true}

### 唾液/生物痕迹
- 拖鞋上有唾液 → {"唾液": true, "唾液印记": true, "生物痕迹": true}
- 杯口有唾液斑 → {"唾液": true, "唾液斑": true}
- 现场发现 DNA → {"DNA": true, "生物痕迹": true}

### 现场混乱程度
- 房间凌乱 → {"凌乱": true}
- 现场混乱，桌椅翻倒 → {"混乱": true, "翻倒": true}
- 地面散落物品 → {"散落": true, "凌乱": true}
- 有打斗痕迹 → {"打斗痕迹": true, "混乱": true}

### 物理状态
- 衣物有撕裂 → {"撕裂": true}
- 手机屏幕破碎 → {"破碎": true}
- 玻璃碎片散落 → {"破碎": true, "碎片": true, "散落": true}
- 门窗有划痕 → {"划痕": true}

### 指纹/痕迹
- 刀柄有指纹 → {"指纹": true}
- 现场有毛发 → {"毛发": true}
- 衣物纤维 → {"纤维": true}

### 伤情（用于 AI 伤情特写）
- 左前臂有淤青 → state 中加 {"淤青": true}，description 保留
- 颈部有抓痕 → {"抓痕": true}
- 头皮挫伤 → {"挫伤": true, "钝器伤": true}

### ⭐ 场景级环境状态（必须独立提取到 state）

**重要**：当原文描述的是场景级别的环境状态（如"地面有血迹"、"房间凌乱"），即使没有具体依附于某个物证，也必须在 state 字段中体现。具体做法：
- 若原文出现"地上/地面/房间有血迹" → 在该物证（地面相关物证或最近相关物证）的 state 中加 {"血迹": true}，确保场景级血迹被识别
- 若原文出现"房间凌乱/混乱/打斗" → 在至少一个物证的 state 中加 {"凌乱": true} 或 {"混乱": true}
- 若原文出现"地面有唾沫" → 加 {"唾液": true, "唾液印记": true}

**关键原则**：state 字段是独立的键值对对象，不要把状态信息塞进 description。description 保留原始物证名词，state 描述该物证的状态特征。**任何出现在 description 中的状态词（血迹/唾液/破碎/凌乱/翻倒 等）都必须同步到 state 字段中。**

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


def _get_client(api_key: str | None = None, model_type: str = "deepseek"):
    """获取配置好的 LLM Instructor 客户端。

    使用 Mode.JSON（而非默认的 Mode.TOOLS），因为 DeepSeek 的
    tool_calls 参数 JSON 在中文字符场景下偶发格式错误。

    Args:
        api_key: API Key。若为 None，使用 settings 中的配置。
        model_type: 模型类型，支持 "deepseek", "openai", "agnes"。
    """
    import logging
    logger = logging.getLogger(__name__)

    if model_type == "deepseek":
        resolved_key = api_key or settings.DEEPSEEK_API_KEY or ""
        base_url = "https://api.deepseek.com"
        model_name = "deepseek-chat"
    elif model_type == "openai":
        resolved_key = api_key or settings.OPENAI_API_KEY or ""
        base_url = settings.OPENAI_API_BASE or "https://api.aigocode.com/v1"
        model_name = settings.OPENAI_API_MODEL or "gpt-image-2"
    elif model_type == "agnes":
        resolved_key = api_key or settings.AGNES_API_KEY or ""
        base_url = "https://apihub.agnes-ai.com/v1"
        model_name = "agnes-7b"
    else:
        raise ValueError(f"不支持的模型类型: {model_type}")

    if not resolved_key:
        raise ValueError(f"{model_type.upper()}_API_KEY not configured")

    logger.info(f"[_get_client] 使用模型: {model_type} | base_url: {base_url}")

    return instructor.from_openai(
        OpenAI(
            api_key=resolved_key,
            base_url=base_url,
        ),
        mode=instructor.Mode.JSON,
    )


async def extract_evidence(case_text: str, api_key: str | None = None, model_type: str = "deepseek") -> EvidenceFilterResult:
    """从案件文本中提取结构化证据。

    使用 LLM API + Instructor 进行严格的结构化输出。
    返回三类证据：可直接生成图片的、需教师确认的、禁止生成内容的描述。

    Args:
        case_text: 判决书或案件材料全文。
        api_key: API Key（可选，覆盖环境变量）。
        model_type: 模型类型，支持 "deepseek", "openai", "agnes"。

    Returns:
        EvidenceFilterResult: 包含三类证据的结构化结果。

    Raises:
        ValueError: LLM 调用失败或输出无法解析。
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[extract_evidence] 开始提取 | 模型: {model_type} | API Key 提供: {'是' if api_key else '否'} | 文本长度: {len(case_text)}")

    # 截断过长文本，保留输出空间
    if len(case_text) > MAX_TEXT_LENGTH:
        case_text = case_text[:MAX_TEXT_LENGTH] + "\n\n[文本过长，已截断]\n"

    client = _get_client(api_key=api_key, model_type=model_type)

    # 根据模型类型选择合适的模型名称
    if model_type == "deepseek":
        model_name = "deepseek-chat"
    elif model_type == "openai":
        model_name = "gpt-4o"
    elif model_type == "agnes":
        model_name = "agnes-7b"
    else:
        model_name = "deepseek-chat"

    response = client.chat.completions.create(
        model=model_name,
        response_model=EvidenceFilterResult,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"请从以下案件材料中提取可视化证据：\n\n{case_text}"},
        ],
        max_retries=3,
        temperature=0.0,
    )

    logger.info(f"[extract_evidence] 提取完成 | 可提取: {len(response.extractable_evidence)} | 不确定: {len(response.uncertain_evidence)} | 禁止生成: {len(response.non_visualizable_content)}")

    return response


async def filter_single_item(description: str, api_key: str | None = None) -> bool:
    """判断单个描述是否属于可视化证据。

    用于教师界面的单条证据审核。调用 DeepSeek 判断该描述
    是否属于 extractable（可提取/可视化）类别。

    Args:
        description: 证据描述的文本。
        api_key: DeepSeek API Key（可选，覆盖环境变量）。

    Returns:
        bool: True 表示该描述属于可视化证据（可提取），False 表示不可提取。
    """
    client = _get_client(api_key=api_key)

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
