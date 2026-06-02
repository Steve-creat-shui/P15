"""Document Render Schemas — 书证模板渲染请求/响应模型。"""
from pydantic import BaseModel
from typing import Literal


class ChatMessage(BaseModel):
    sender: str    # "A" 或 "B"
    text: str
    time: str      # 如 "14:30"


class DocumentRenderRequest(BaseModel):
    evidence_id: int
    template_type: Literal["grid_paper", "a4_document", "chat_screenshot"]
    title: str = ""
    text_content: str = ""           # 用于 grid_paper 和 a4_document
    document_date: str = ""          # 用于 a4_document
    messages: list[ChatMessage] = [] # 用于 chat_screenshot


class TemplateInfo(BaseModel):
    type: str
    label: str
    description: str
    required_fields: list[str]
