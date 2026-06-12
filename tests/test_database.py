import pytest
import asyncio
import os
import aiosqlite

# 用独立的测试数据库
TEST_DB = os.path.join(os.path.dirname(__file__), "test_game.db")


@pytest.fixture(autouse=True)
def clean_db():
    """每个测试前删除旧测试库"""
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
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.mark.asyncio
async def test_init_db_adds_ship_class_column(db_path):
    import database
    await database.init_db()

    async with aiosqlite.connect(TEST_DB) as db:
        cursor = await db.execute("PRAGMA table_info(players)")
        columns = {row[1] for row in await cursor.fetchall()}
    assert "ship_class" in columns


@pytest.mark.asyncio
async def test_get_player_ship_class_default_none(db_path):
    import database
    await database.init_db()

    player_id = await database.get_or_create_player("testplayer")
    result = await database.get_player_ship_class(player_id)
    assert result is None


@pytest.mark.asyncio
async def test_update_player_ship_class(db_path):
    import database
    await database.init_db()

    player_id = await database.get_or_create_player("testplayer")
    await database.update_player_ship_class(player_id, "destroyer")
    result = await database.get_player_ship_class(player_id)
    assert result == "destroyer"


@pytest.mark.asyncio
async def test_update_player_ship_class_cruiser(db_path):
    import database
    await database.init_db()

    player_id = await database.get_or_create_player("testplayer")
    await database.update_player_ship_class(player_id, "cruiser")
    result = await database.get_player_ship_class(player_id)
    assert result == "cruiser"


@pytest.mark.asyncio
async def test_update_player_ship_class_battleship(db_path):
    import database
    await database.init_db()

    player_id = await database.get_or_create_player("testplayer")
    await database.update_player_ship_class(player_id, "battleship")
    result = await database.get_player_ship_class(player_id)
    assert result == "battleship"


@pytest.mark.asyncio
async def test_reset_player_level_clears_ship_class(db_path):
    import database
    await database.init_db()

    player_id = await database.get_or_create_player("testplayer")
    await database.update_player_level(player_id, 5)
    await database.update_player_ship_class(player_id, "destroyer")
    await database.reset_player_level(player_id)

    level = await database.get_player_level(player_id)
    assert level == 1
    ship_class = await database.get_player_ship_class(player_id)
    assert ship_class is None


@pytest.mark.asyncio
async def test_get_player_ship_class_nonexistent(db_path):
    import database
    await database.init_db()

    result = await database.get_player_ship_class(99999)
    assert result is None
