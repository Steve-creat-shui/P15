"""Document Render Schemas — 书证模板渲染请求/响应模型。"""
from pydantic import BaseModel
from typing import Literal


class ChatMessage(BaseModel):
    sender: str    # "A" 或 "B"
    sender_name: str = ""            # 发送者显示名称（为空时回退到"对方"/"本人"）
    text: str
    time: str      # 如 "14:30"


class DocumentRenderRequest(BaseModel):
    template_type: Literal["grid_paper", "a4_document", "chat_screenshot"]
    title: str = ""
    text_content: str = ""           # 用于 grid_paper 和 a4_document
    document_date: str = ""          # 用于 a4_document
    seal_text: str = ""              # 用于 a4_document 印章文字（第一行）
    seal_sub_text: str = ""          # 用于 a4_document 印章副文字（第二行）
    messages: list[ChatMessage] = [] # 用于 chat_screenshot


class TemplateInfo(BaseModel):
    type: str
    label: str
    description: str
    required_fields: list[str]
