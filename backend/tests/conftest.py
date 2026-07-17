# conftest.py — pytest fixtures 和全局配置

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
