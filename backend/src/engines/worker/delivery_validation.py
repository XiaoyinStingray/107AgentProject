"""Worker 最终交付的确定性校验。

LLM 负责语义判断；这里负责程序能够确定计算的硬约束，避免执行模型和
验收模型产生同源错误。校验器只在证据足够明确时报告失败，以降低误报。
"""

from __future__ import annotations

import ast
import operator
import re


_ARITHMETIC_EQUATION_RE = re.compile(
    r"(?P<lhs>-?\d+(?:\.\d+)?(?:\s*[+＋\-−*×/÷]\s*-?\d+(?:\.\d+)?){1,})"
    r"\s*[=＝]\s*(?:\*\*|__)?\s*(?P<rhs>-?\d+(?:\.\d+)?)"
)

_TOTAL_MINUTES_PATTERNS = (
    re.compile(r"(?:总时长|总计|合计|共)[^\d\n]{0,20}(\d+(?:\.\d+)?)\s*分钟"),
    re.compile(r"(\d+(?:\.\d+)?)\s*分钟(?:的)?(?:学习|复习|工作|行动)?计划"),
)

_ALLOCATION_LINE_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)、])\s+(.+)$")
_MINUTES_RE = re.compile(r"(\d+(?:\.\d+)?)\s*分钟")
_SUMMARY_WORDS = ("总时长", "总计", "合计", "共", "核对")

_BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}


def _format_number(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def _evaluate_arithmetic(expression: str) -> float | None:
    normalized = (
        expression.replace("＋", "+")
        .replace("−", "-")
        .replace("×", "*")
        .replace("÷", "/")
    )
    try:
        root = ast.parse(normalized, mode="eval")
    except (SyntaxError, ValueError):
        return None

    def evaluate(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = evaluate(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPERATORS:
            return _BINARY_OPERATORS[type(node.op)](
                evaluate(node.left), evaluate(node.right)
            )
        raise ValueError("unsupported expression")

    try:
        return evaluate(root)
    except (ValueError, ZeroDivisionError, OverflowError):
        return None


def _extract_expected_total_minutes(task: str) -> float | None:
    for pattern in _TOTAL_MINUTES_PATTERNS:
        match = pattern.search(task)
        if match:
            return float(match.group(1))
    return None


def _extract_leaf_minute_allocations(deliverables: str) -> list[float]:
    allocations: list[float] = []
    for line in deliverables.splitlines():
        match = _ALLOCATION_LINE_RE.match(line)
        if not match:
            continue
        body = match.group(1)
        if any(word in body for word in _SUMMARY_WORDS):
            continue
        values = [float(value) for value in _MINUTES_RE.findall(body)]
        allocations.extend(values)
    return allocations


def validate_delivery(task: str, deliverables: str) -> list[dict[str, str]]:
    """返回确定可证的交付问题；空列表表示未发现硬错误。"""
    issues: list[dict[str, str]] = []
    seen_equations: set[str] = set()

    for match in _ARITHMETIC_EQUATION_RE.finditer(deliverables):
        equation = match.group(0)
        if equation in seen_equations:
            continue
        seen_equations.add(equation)
        actual = _evaluate_arithmetic(match.group("lhs"))
        claimed = float(match.group("rhs"))
        if actual is None or abs(actual - claimed) < 1e-9:
            continue
        actual_text = _format_number(actual)
        claimed_text = _format_number(claimed)
        issues.append({
            "constraint": "交付物中的算式必须计算正确",
            "evidence": (
                f"算式“{equation}”声称结果为 {claimed_text}，程序计算结果为 {actual_text}。"
            ),
            "repair": f"重新分配或更正数字，并确保该算式结果为 {actual_text}。",
        })

    expected_minutes = _extract_expected_total_minutes(task)
    allocations = _extract_leaf_minute_allocations(deliverables)
    if expected_minutes is not None and len(allocations) >= 2:
        actual_minutes = sum(allocations)
        if abs(actual_minutes - expected_minutes) >= 1e-9:
            actual_text = _format_number(actual_minutes)
            expected_text = _format_number(expected_minutes)
            allocation_text = " + ".join(_format_number(value) for value in allocations)
            issues.append({
                "constraint": f"任务要求总时长严格为 {expected_text} 分钟",
                "evidence": (
                    f"逐项时间为 {allocation_text}，程序合计 {actual_text} 分钟，"
                    f"不等于要求的 {expected_text} 分钟。"
                ),
                "repair": (
                    f"保留任务要求的必要环节，调整各项时间，使逐项合计严格等于 "
                    f"{expected_text} 分钟。"
                ),
            })

    return issues
