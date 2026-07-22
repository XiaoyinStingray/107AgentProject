"""Helpers shared by World API lifecycle endpoints."""

from engines.world.scenarios import get_scenario_by_name
from models.world import Scenario


def resolve_world_scenario(requested: Scenario) -> Scenario:
    """Merge a named built-in scenario with explicitly supplied overrides."""
    scenario_name = requested.name or "新生报到"
    template = get_scenario_by_name(scenario_name)
    if template is None:
        return requested

    overrides = {
        field: getattr(requested, field)
        for field in requested.model_fields_set
        if field != "environment_params"
    }
    environment = dict(template.environment_params)
    if "environment_params" in requested.model_fields_set:
        environment.update(requested.environment_params)
    overrides["environment_params"] = environment
    return template.model_copy(deep=True, update=overrides)
