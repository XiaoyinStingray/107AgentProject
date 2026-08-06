import pytest
from pydantic import ValidationError

from api.pipelines import EdgeCreateRequest


@pytest.mark.parametrize("max_iterations", [0, 11])
def test_loop_iteration_request_rejects_out_of_range_values(max_iterations):
    with pytest.raises(ValidationError):
        EdgeCreateRequest(
            id="loop-edge",
            from_node="review",
            to_node="draft",
            edge_type="loop",
            max_iterations=max_iterations,
        )


@pytest.mark.parametrize("max_iterations", [1, 10])
def test_loop_iteration_request_accepts_boundary_values(max_iterations):
    request = EdgeCreateRequest(
        id="loop-edge",
        from_node="review",
        to_node="draft",
        edge_type="loop",
        max_iterations=max_iterations,
    )

    assert request.max_iterations == max_iterations
