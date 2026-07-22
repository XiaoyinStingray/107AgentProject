"""Resource-state helpers for WorldEngine context injection."""


def build_resource_context(
    environment_params: dict[str, object],
    current_tick: int,
) -> str:
    """Build the resource status visible to Agents in the current tick."""
    if "stress_level" not in environment_params:
        return ""
    seats = max(0, 100 - current_tick * 3)
    return f"📊 资源状态: 图书馆剩余座位 {seats} 个\n"
