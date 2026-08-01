"""
配方系统（Step 100）— 预设结构化的 Agent 研究方法论。

每个配方是一个严格的 phase 序列——Agent 不能跳过步骤。
引擎在执行配方时，将当前 phase 的 instruction 注入决策 prompt，
phase 完成后自动推进到下一个。

预设 5 个配方:
  - 深度调研: 多角度搜索 → 交叉验证 → 魔鬼代言人 → 报告
  - 代码审查: clone → 读代码 → 运行测试 → 写 review
  - 数据分析: 读数据 → pip install → 清洗 → 分析 → 图表
  - 竞品对比: 多关键词搜索 → 提取特征 → 对比表 → 结论
  - 漏洞检查: clone → 安全扫描 → 依赖审计 → 报告
"""

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class RecipePhase:
    """配方的一个阶段。"""
    id: str
    title: str
    instruction: str
    required_tools: list[str]
    output: str  # 本阶段产出文件路径


@dataclass
class Recipe:
    """一个完整的配方定义。"""
    name: str
    description: str
    icon: str  # emoji
    phases: list[RecipePhase]

    def phase_count(self) -> int:
        return len(self.phases)

    def phase_instruction(self, phase_index: int) -> str | None:
        """获取指定阶段的 instruction。"""
        if 0 <= phase_index < len(self.phases):
            return self.phases[phase_index].instruction
        return None

    def all_done(self, phase_index: int) -> bool:
        """检查所有阶段是否完成。"""
        return phase_index >= len(self.phases)


# =============================================================================
# 预设配方库
# =============================================================================

RECIPE_DEEP_RESEARCH = Recipe(
    name="深度调研",
    description="多角度搜索 → 交叉验证 → 魔鬼代言人 → 最终报告 + 自评",
    icon="🔬",
    phases=[
        RecipePhase(
            id="multi_angle_search",
            title="多角度搜索",
            instruction=(
                "用至少 3 个不同角度的关键词搜索同一主题。"
                "保存所有原始搜索结果到 sources/raw/ 目录。"
                "每个角度一个 .md 文件。"
            ),
            required_tools=["web_search", "write_file"],
            output="sources/raw/*.md",
        ),
        RecipePhase(
            id="cross_verify",
            title="交叉验证",
            instruction=(
                "从上一步搜索结果中提取 5 条关键声明。"
                "对每条声明做二次验证搜索，标注可信度（高/中/低/矛盾）。"
                "将验证结果写入 sources/verification.json。"
            ),
            required_tools=["web_search", "write_file"],
            output="sources/verification.json",
        ),
        RecipePhase(
            id="devils_advocate",
            title="魔鬼代言人",
            instruction=(
                "你的报告初稿已完成。现在你必须反问自己 3 个问题:\n"
                "1. 这个结论最强的反方论点是什么？\n"
                "2. 什么数据能推翻我现在的判断？\n"
                "3. 我的报告最弱的部分在哪里？\n\n"
                "把答案写入 report_critique.md。"
            ),
            required_tools=["write_file"],
            output="report_critique.md",
        ),
        RecipePhase(
            id="final_report",
            title="最终报告",
            instruction=(
                "基于验证过的声明写最终报告。每条引用附来源 URL + 可信度标记。"
                "末尾附: 方法论、局限性、下一步建议。"
            ),
            required_tools=["write_file"],
            output="report.md",
        ),
    ],
)

RECIPE_CODE_REVIEW = Recipe(
    name="代码审查",
    description="读代码 → 分析架构 → 运行测试 → 写 review",
    icon="👁️",
    phases=[
        RecipePhase(
            id="explore",
            title="代码探索",
            instruction="列出项目文件结构。读主要源文件，理解架构设计。记录整体印象到 review_notes.md。",
            required_tools=["list_files", "read_file", "write_file"],
            output="review_notes.md",
        ),
        RecipePhase(
            id="analyze",
            title="深度分析",
            instruction="分析代码质量：命名规范、错误处理、安全漏洞、性能问题。对每个问题标注严重程度（高/中/低）和文件行号。",
            required_tools=["read_file", "write_file"],
            output="analysis.md",
        ),
        RecipePhase(
            id="run_tests",
            title="运行测试",
            instruction="运行项目测试（如果有）。记录测试结果。如果测试不完整，标记遗漏的测试场景。",
            required_tools=["run_python"],
            output="test_results.txt",
        ),
        RecipePhase(
            id="write_review",
            title="撰写 Review",
            instruction="汇总所有发现，写正式代码审查报告。包含：总体评价、安全问题、性能问题、改进建议。",
            required_tools=["write_file"],
            output="review.md",
        ),
    ],
)

RECIPE_DATA_ANALYSIS = Recipe(
    name="数据分析",
    description="读数据 → pip install → 清洗 → 分析 → 图表 → 报告",
    icon="📊",
    phases=[
        RecipePhase(
            id="explore_data",
            title="探索数据",
            instruction="读数据文件，了解数据格式、字段、规模。写数据摘要到 data_summary.md。",
            required_tools=["read_file", "write_file"],
            output="data_summary.md",
        ),
        RecipePhase(
            id="setup_env",
            title="环境准备",
            instruction="安装数据分析所需包：pandas, matplotlib, numpy。",
            required_tools=["install_package"],
            output="",
        ),
        RecipePhase(
            id="clean_analyze",
            title="清洗与分析",
            instruction="用 Python 清洗数据（处理缺失值、异常值、格式转换），然后进行分析。输出分析脚本和运行结果。",
            required_tools=["run_python", "write_file"],
            output="analysis.py",
        ),
        RecipePhase(
            id="visualize",
            title="可视化",
            instruction="生成图表（matplotlib）。保存为 PNG 到工作区。确保图表清晰、有标题、有图例。",
            required_tools=["run_python"],
            output="charts/",
        ),
        RecipePhase(
            id="report",
            title="分析报告",
            instruction="写最终分析报告。包含：数据概况、关键发现、图表解读、结论与建议。",
            required_tools=["write_file"],
            output="report.md",
        ),
    ],
)

RECIPE_COMPETITOR_ANALYSIS = Recipe(
    name="竞品对比",
    description="多关键词搜索 → 提取特征 → 对比表 → 结论",
    icon="⚔️",
    phases=[
        RecipePhase(
            id="search",
            title="多维度搜索",
            instruction=(
                "从 3 个不同角度搜索竞品信息: 功能对比、定价模式、用户评价。"
                "保存原始结果到 sources/ 目录。"
            ),
            required_tools=["web_search", "write_file"],
            output="sources/*.md",
        ),
        RecipePhase(
            id="extract_features",
            title="特征提取",
            instruction=("从搜索结果中提取每个竞品的核心特征。"
                         "至少覆盖: 核心功能、定价、技术栈、目标用户、优劣势。"
                         "写入 features.json。"),
            required_tools=["write_file"],
            output="features.json",
        ),
        RecipePhase(
            id="comparison_table",
            title="对比表",
            instruction="将特征整理为 Markdown 对比表。每个竞品一列，特征维度为行。写 comparison.md。",
            required_tools=["write_file"],
            output="comparison.md",
        ),
        RecipePhase(
            id="conclusion",
            title="结论与建议",
            instruction=("基于对比表写结论。包含：谁适合用什么、市场空白点、"
                         "趋势判断。末尾标注所有信息来源 URL。"),
            required_tools=["write_file"],
            output="conclusion.md",
        ),
    ],
)

RECIPE_SECURITY_AUDIT = Recipe(
    name="漏洞检查",
    description="读代码 → 安全扫描 → 依赖审计 → 报告",
    icon="🛡️",
    phases=[
        RecipePhase(
            id="explore",
            title="项目探索",
            instruction="列出项目结构，识别入口文件、配置文件、依赖声明。记录到 audit_notes.md。",
            required_tools=["list_files", "read_file", "write_file"],
            output="audit_notes.md",
        ),
        RecipePhase(
            id="static_check",
            title="静态安全扫描",
            instruction=(
                "逐文件检查安全模式: SQL注入、XSS、硬编码密钥、"
                "不安全的文件操作、权限缺失。每个发现标注文件+行号。写入 static_scan.md。"
            ),
            required_tools=["read_file", "write_file"],
            output="static_scan.md",
        ),
        RecipePhase(
            id="dependency_audit",
            title="依赖审计",
            instruction=("检查依赖项（requirements.txt / package.json 等）。"
                         "标注已知漏洞的包版本。写入 dependency_audit.md。"),
            required_tools=["read_file", "write_file"],
            output="dependency_audit.md",
        ),
        RecipePhase(
            id="report",
            title="安全报告",
            instruction="汇总所有发现为正式安全审计报告。按严重程度排序。包含修复建议和优先级。",
            required_tools=["write_file"],
            output="security_report.md",
        ),
    ],
)

# ── 配方注册表 ──

ALL_RECIPES: dict[str, Recipe] = {
    "deep_research": RECIPE_DEEP_RESEARCH,
    "code_review": RECIPE_CODE_REVIEW,
    "data_analysis": RECIPE_DATA_ANALYSIS,
    "competitor_analysis": RECIPE_COMPETITOR_ANALYSIS,
    "security_audit": RECIPE_SECURITY_AUDIT,
}


def get_recipe(recipe_id: str) -> Recipe | None:
    """按 ID 获取配方。"""
    return ALL_RECIPES.get(recipe_id)


def list_recipes() -> list[dict]:
    """列出所有可用配方（供前端 API 使用）。"""
    return [
        {
            "id": rid,
            "name": r.name,
            "description": r.description,
            "icon": r.icon,
            "phase_count": r.phase_count(),
            "phases": [{"title": p.title, "output": p.output} for p in r.phases],
        }
        for rid, r in ALL_RECIPES.items()
    ]
