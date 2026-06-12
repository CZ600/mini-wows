import pytest
import os

TEST_DB = os.path.join(os.path.dirname(__file__), "test_api.db")


@pytest.fixture(autouse=True)
def clean_db():
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
    yield
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)


@pytest.fixture
def db_path(monkeypatch):
    monkeypatch.setattr("database.DB_PATH", TEST_DB)
    return TEST_DB


@pytest.fixture
async def client(db_path):
    from httpx import AsyncClient, ASGITransport
    import database
    await database.init_db()

    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth_token(client):
    resp = await client.post("/api/auth/register", json={
        "username": "testuser",
        "password": "test1234",
    })
    return resp.json()["token"]


@pytest.fixture
async def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
async def player_id(client, auth_headers):
    resp = await client.post("/api/players", json={"name": "testship"}, headers=auth_headers)
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_get_class_default_none(client, auth_headers, player_id):
    resp = await client.get(f"/api/players/{player_id}/class", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["shipClass"] is None


@pytest.mark.asyncio
async def test_put_class_destroyer(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/class", json={"shipClass": "destroyer"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["shipClass"] == "destroyer"


@pytest.mark.asyncio
async def test_put_class_cruiser(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/class", json={"shipClass": "cruiser"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["shipClass"] == "cruiser"


@pytest.mark.asyncio
async def test_put_class_battleship(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/class", json={"shipClass": "battleship"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["shipClass"] == "battleship"


@pytest.mark.asyncio
async def test_put_class_invalid_rejected(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/class", json={"shipClass": "invalid"}, headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_progress_includes_ship_class(client, auth_headers, player_id):
    await client.put(f"/api/players/{player_id}/class", json={"shipClass": "destroyer"}, headers=auth_headers)
    resp = await client.get(f"/api/players/{player_id}/progress", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "shipClass" in data
    assert data["shipClass"] == "destroyer"


@pytest.mark.asyncio
async def test_reset_clears_ship_class(client, auth_headers, player_id):
    await client.put(f"/api/players/{player_id}/class", json={"shipClass": "cruiser"}, headers=auth_headers)
    resp = await client.post(f"/api/players/{player_id}/reset-progress", headers=auth_headers)
    assert resp.status_code == 200

    resp = await client.get(f"/api/players/{player_id}/class", headers=auth_headers)
    assert resp.json()["shipClass"] is None


# ── 初始等级选择相关测试 ──

@pytest.mark.asyncio
async def test_save_progress_valid_level_range(client, auth_headers, player_id):
    for lv in [1, 5, 10]:
        resp = await client.put(f"/api/players/{player_id}/progress", json={"level": lv}, headers=auth_headers)
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_save_progress_level_too_low(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/progress", json={"level": 0}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_save_progress_level_too_high(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/progress", json={"level": 11}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_initial_level_with_class(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/progress", json={"level": 4}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.put(f"/api/players/{player_id}/class", json={"shipClass": "destroyer"}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.get(f"/api/players/{player_id}/progress", headers=auth_headers)
    data = resp.json()
    assert data["level"] == 4
    assert data["shipClass"] == "destroyer"


@pytest.mark.asyncio
async def test_initial_level_without_class_allowed(client, auth_headers, player_id):
    resp = await client.put(f"/api/players/{player_id}/progress", json={"level": 3}, headers=auth_headers)
    assert resp.status_code == 200
    resp = await client.get(f"/api/players/{player_id}/progress", headers=auth_headers)
    data = resp.json()
    assert data["level"] == 3
    assert data["shipClass"] is None
