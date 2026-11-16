import pytest
from app.services.pricing import pricing_service


def test_gpt4o_cost_calculation():
    # gpt-4o: $2.50 / 1M in, $10.00 / 1M out
    # 1000 in = $0.0025, 500 out = $0.0050 => $0.0075
    cost = pricing_service.calculate_cost("gpt-4o", 1000, 500)
    assert pytest.approx(cost, 0.000001) == 0.0075


def test_gpt4o_mini_cost_calculation():
    # gpt-4o-mini: $0.15 / 1M in, $0.60 / 1M out
    # 10,000 in = $0.0015, 20,000 out = $0.0120 => $0.0135
    cost = pricing_service.calculate_cost("gpt-4o-mini", 10000, 20000)
    assert pytest.approx(cost, 0.000001) == 0.0135


def test_cached_tokens_discount():
    # 2000 total in, 1000 cached (discount rate $1.25/1M vs $2.50/1M)
    # regular: 1000 * 2.50/1M = 0.0025
    # cached: 1000 * 1.25/1M = 0.00125
    # out: 0 => 0.00375
    cost = pricing_service.calculate_cost("gpt-4o", 2000, 0, cached_tokens=1000)
    assert pytest.approx(cost, 0.000001) == 0.00375


def test_unknown_model_fallback():
    cost = pricing_service.calculate_cost("custom-finetuned-llama", 1000, 1000)
    assert cost > 0.0
