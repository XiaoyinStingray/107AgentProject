"""Arena 共享工具——DSML 标签清洗等。"""

import re


def clean_dsml_content(content: str) -> str:
    """从 TextMessage 内容中提取纯文本，去除 DSML 工具调用标记。

    DSML 格式示例：
    <| | DSML | | parameter name="content" string="true">实际文本</| | DSML | | parameter>
    如果内容包含 DSML 标记，提取所有 parameter name="content" 中的文本；
    否则原样返回。
    """
    if "DSML" not in content:
        return content

    # 尝试多种可能的 DSML 闭合标签格式
    # 格式1: </| | DSML | | parameter>
    # 格式2: </||DSML||parameter>
    patterns = [
        r'parameter\s+name="content"\s+string="true">(.*?)</\|\s*\|\s*DSML\s*\|\s*\|\s*parameter>',
        r'parameter\s+name="content"\s+string="true">(.*?)</\|\|\s*DSML\s*\|\|\s*parameter>',
        r'parameter\s+name="content"\s+string="true">(.*?)</[^>]*DSML[^>]*parameter>',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, content, re.DOTALL)
        if matches:
            cleaned = " ".join(m.strip() for m in matches if m.strip())
            if cleaned:
                return cleaned

    # 如果有 DSML 标记但无法提取，尝试去除所有 DSML 标签
    dsml_tags = [
        r'<\|\s*\|\s*DSML\s*\|\s*\|[^>]*>',
        r'<\|\|\s*DSML\s*\|\|[^>]*>',
        r'</\|\s*\|\s*DSML\s*\|\s*\|[^>]*>',
        r'</\|\|\s*DSML\s*\|\|[^>]*>',
        r'<[^>]*DSML[^>]*>',
    ]
    cleaned = content
    for tag_pattern in dsml_tags:
        cleaned = re.sub(tag_pattern, '', cleaned)
    return cleaned.strip() if cleaned.strip() else content
