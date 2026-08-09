"""基于现有 Agent 生成最小、自洽 Remix 草稿。"""

import asyncio
import json
import re
from typing import Any

from autogen_core.models import SystemMessage, UserMessage
from loguru import logger

from config import settings
from models.remix import RemixChange, RemixDraft, RemixSpec


_REMIX_SYSTEM_PROMPT = """\
你是角色设定编辑器。请根据原角色和用户要求生成一份修改后的完整角色 JSON。

规则：
1. 只修改用户明确要求的内容，以及维持角色自洽所必需的最少关联字段。
2. preserve_fields 中的字段必须保持原样，不得改写。
3. trait_targets 是必须达到的精确目标值。
4. 不要随机改名、添加无关经历或扩大修改范围。
5. summary 只简述修改结果，不要输出思维过程。

只返回以下 JSON，不要使用 Markdown：
{
  "persona": {
    "name": "姓名",
    "mbti": "MBTI",
    "big_five": {
      "openness": 0.0,
      "conscientiousness": 0.0,
      "extraversion": 0.0,
      "agreeableness": 0.0,
      "neuroticism": 0.0
    },
    "values": ["价值观"],
    "decision_style": {
      "info_processing": "intuitive|analytical|balanced",
      "risk_preference": "averse|moderate|seeking",
      "social_tendency": "competitive|cooperative|independent",
      "stress_response": "avoidant|reactive|adaptive|resilient"
    },
    "narrative": "修改后的完整人格画像"
  },
  "background": {
    "hometown": "家乡",
    "family": "家庭",
    "education": "教育",
    "key_events": ["关键事件"]
  },
  "goals": [
    {
      "id": "g1",
      "description": "目标",
      "priority": 1,
      "deadline": "YYYY-MM-DD",
      "status": "active"
    }
  ],
  "summary": "本次最小修改的简短说明"
}

关于目标 deadline：必须根据角色背景和人生阶段设定合理的截止时间（ISO 日期格式 YYYY-MM-DD），不要使用过去的日期，终身目标可设为 null。"""

_RETRY_NOTE = "\n上次输出无法通过 JSON/Pydantic 校验，请严格返回完整纯 JSON。"


class RemixGenerationError(RuntimeError):
    """LLM 无法生成有效 Remix 草稿。"""


class RemixNoChangesError(ValueError):
    """Remix 草稿与源 Agent 没有实际差异。"""


class PersonaRemixer:
    """LLM 生成候选草稿，代码层再执行硬约束。"""

    def __init__(self, model_client: Any):
        self._client = model_client

    async def preview(
        self,
        source: RemixDraft,
        spec: RemixSpec,
    ) -> tuple[RemixDraft, list[RemixChange], str]:
        """生成并校验 Remix 预览，不进行持久化。"""
        last_error = ""
        last_no_changes: RemixNoChangesError | None = None
        for attempt in range(2):
            try:
                raw = await self._call_llm(source, spec, retry=attempt > 0)
                candidate, summary = _parse_remix_response(raw)
                final, changes = self.finalize(source, candidate, spec)
                return final, changes, summary
            except RemixNoChangesError as error:
                last_no_changes = error
                last_error = str(error)
                logger.warning(
                    "PersonaRemixer attempt {}/2 produced no changes",
                    attempt + 1,
                )
            except (RemixGenerationError, ValueError) as error:
                last_error = str(error)
                logger.warning(
                    "PersonaRemixer attempt {}/2 failed: {}",
                    attempt + 1,
                    last_error,
                )
        if last_no_changes is not None:
            raise last_no_changes
        raise RemixGenerationError(f"两次尝试后仍无法生成有效 Remix：{last_error}")

    def finalize(
        self,
        source: RemixDraft,
        candidate: RemixDraft,
        spec: RemixSpec,
    ) -> tuple[RemixDraft, list[RemixChange]]:
        """重新验证草稿，并强制执行保护字段与滑块目标。"""
        final = candidate.model_copy(deep=True)
        source_copy = source.model_copy(deep=True)

        for field in spec.preserve_fields:
            if field == "background":
                final.background = source_copy.background
            elif field == "goals":
                final.goals = source_copy.goals
            else:
                setattr(
                    final.persona,
                    field,
                    getattr(source_copy.persona, field),
                )

        for field, value in spec.trait_targets.values_to_apply().items():
            setattr(final.persona.big_five, field, value)

        # 重新经过 Pydantic，防止 create 阶段回传的数据绕过校验。
        final = RemixDraft.model_validate(final.model_dump())
        changes = _collect_changes(source, final)
        if not changes:
            raise RemixNoChangesError("Remix 没有产生实际变化")
        return final, changes

    async def _call_llm(
        self,
        source: RemixDraft,
        spec: RemixSpec,
        *,
        retry: bool,
    ) -> str:
        payload = {
            "source_agent": source.model_dump(mode="json"),
            "instruction": spec.instruction,
            "trait_targets": spec.trait_targets.values_to_apply(),
            "preserve_fields": spec.preserve_fields,
        }
        user_content = json.dumps(payload, ensure_ascii=False)
        if retry:
            user_content += _RETRY_NOTE

        messages = [
            SystemMessage(content=_REMIX_SYSTEM_PROMPT),
            UserMessage(content=user_content, source="persona_remixer"),
        ]
        try:
            response = await asyncio.wait_for(
                self._client.create(messages=messages),
                timeout=settings.agent_timeout_seconds,
            )
        except TimeoutError as error:
            raise RemixGenerationError("LLM 调用超时") from error
        except Exception as error:
            raise RemixGenerationError(
                f"LLM 调用失败：{type(error).__name__}"
            ) from error

        if not isinstance(response.content, str):
            raise RemixGenerationError("LLM 未返回文本内容")
        return response.content


def _parse_remix_response(raw: str) -> tuple[RemixDraft, str]:
    json_text = _extract_json(raw)
    if not json_text:
        raise RemixGenerationError("返回中没有 JSON")
    try:
        payload = json.loads(json_text)
        draft = RemixDraft.model_validate(
            {
                "persona": payload["persona"],
                "background": payload["background"],
                "goals": payload.get("goals", []),
            }
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise RemixGenerationError(f"返回格式无效：{error}") from error

    summary = str(payload.get("summary", "")).strip()[:300]
    return draft, summary


def _extract_json(text: str) -> str | None:
    """提取包含嵌套对象的完整 JSON。"""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    return text[start:end + 1]


def _collect_changes(source: RemixDraft, final: RemixDraft) -> list[RemixChange]:
    changes: list[RemixChange] = []
    _diff_values(source.model_dump(mode="json"), final.model_dump(mode="json"), "", changes)
    return changes


def _diff_values(
    before: Any,
    after: Any,
    path: str,
    changes: list[RemixChange],
) -> None:
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(before.keys() | after.keys()):
            child_path = f"{path}.{key}" if path else key
            _diff_values(before.get(key), after.get(key), child_path, changes)
        return
    if before == after:
        return
    changes.append(
        RemixChange(
            field=path,
            before=_display_value(before),
            after=_display_value(after),
        )
    )


def _display_value(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if value is None:
        return "null"
    return str(value)
