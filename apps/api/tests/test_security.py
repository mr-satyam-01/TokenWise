from app.core.security import (
    hash_password, verify_password, create_access_token, decode_access_token,
    generate_api_key, hash_api_key, verify_api_key
)


def test_password_hashing():
    pw = "superSecurePass123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("wrongPassword", hashed) is False


def test_jwt_token_flow():
    user_id = "test-user-123"
    token = create_access_token(user_id)
    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == user_id


def test_api_key_generation_and_verification():
    full_key, prefix, key_hash = generate_api_key()
    assert full_key.startswith("tw-live_")
    assert prefix in full_key
    assert hash_api_key(full_key) == key_hash
    assert verify_api_key(full_key, key_hash) is True
    assert verify_api_key("tw-live_fake_key", key_hash) is False
