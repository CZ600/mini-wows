import pytest
import os

TEST_DB = os.path.join(os.path.dirname(__file__), "test_admin.db")


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
async def admin_token(client):
    resp = await client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    return resp.json()["token"]


@pytest.fixture
async def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
async def user_token(client):
    resp = await client.post("/api/auth/register", json={
        "username": "normaluser",
        "password": "test1234",
    })
    return resp.json()["token"]


@pytest.fixture
async def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ── Database: announcements table ──

@pytest.mark.asyncio
async def test_announcements_table_exists(db_path):
    import database
    # init_db should create announcements table
    await database.init_db()

    async with database.aiosqlite.connect(TEST_DB) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'"
        )
        row = await cursor.fetchone()
        assert row is not None


@pytest.mark.asyncio
async def test_create_announcement(db_path):
    import database
    await database.init_db()

    ann_id = await database.create_announcement("Test announcement")
    assert ann_id > 0

    anns = await database.get_announcements()
    assert len(anns) == 1
    assert anns[0]["content"] == "Test announcement"


# ── GET /api/rooms (any authenticated user) ──

@pytest.mark.asyncio
async def test_get_rooms_requires_auth(client):
    resp = await client.get("/api/rooms")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_rooms_empty(client, user_headers):
    resp = await client.get("/api/rooms", headers=user_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ── GET /api/admin/stats ──

@pytest.mark.asyncio
async def test_admin_stats_requires_admin(client, user_headers):
    resp = await client.get("/api/admin/stats", headers=user_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_stats_returns_data(client, admin_headers):
    resp = await client.get("/api/admin/stats", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "totalUsers" in data
    assert "onlineCount" in data
    assert "activeRooms" in data
    assert "todayGames" in data


# ── GET /api/admin/rooms ──

@pytest.mark.asyncio
async def test_admin_rooms_requires_admin(client, user_headers):
    resp = await client.get("/api/admin/rooms", headers=user_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_rooms_empty(client, admin_headers):
    resp = await client.get("/api/admin/rooms", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ── POST /api/admin/broadcast ──

@pytest.mark.asyncio
async def test_admin_broadcast_requires_admin(client, user_headers):
    resp = await client.post("/api/admin/broadcast", json={"content": "Hello"}, headers=user_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_broadcast_creates_announcement(client, admin_headers):
    resp = await client.post("/api/admin/broadcast", json={"content": "Server restart"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # Verify announcement was stored
    resp = await client.get("/api/admin/announcements", headers=admin_headers)
    assert resp.status_code == 200
    anns = resp.json()
    assert len(anns) == 1
    assert anns[0]["content"] == "Server restart"


# ── GET /api/admin/server-status ──

@pytest.mark.asyncio
async def test_admin_server_status_requires_admin(client, user_headers):
    resp = await client.get("/api/admin/server-status", headers=user_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_server_status_returns_data(client, admin_headers):
    resp = await client.get("/api/admin/server-status", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "activeConnections" in data
    assert "activeRooms" in data
    assert "uptime" in data
