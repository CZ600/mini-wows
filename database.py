import aiosqlite
import os
import bcrypt

DB_PATH = os.path.join(os.path.dirname(__file__), "game.db")


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                user_id INTEGER,
                level INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                score INTEGER DEFAULT 0,
                level_reached INTEGER DEFAULT 1,
                enemies_destroyed INTEGER DEFAULT 0,
                result TEXT,
                FOREIGN KEY (player_id) REFERENCES players(id)
            )
        """)
        await db.commit()

        try:
            await db.execute("ALTER TABLE players ADD COLUMN level INTEGER NOT NULL DEFAULT 1")
            await db.commit()
        except Exception:
            pass

        cursor = await db.execute("SELECT id FROM users WHERE username = 'admin'")
        if not await cursor.fetchone():
            password_hash = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode()
            await db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ('admin', password_hash, 'admin')
            )
            await db.commit()


# ── User functions ──

async def create_user(username: str, password: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id FROM users WHERE username = ?", (username,))
        if await cursor.fetchone():
            return None
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        cursor = await db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash)
        )
        await db.commit()
        return {"id": cursor.lastrowid, "username": username, "role": "user"}


async def authenticate_user(username: str, password: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?",
            (username,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        if not row['is_active']:
            return None
        if not bcrypt.checkpw(password.encode(), row['password_hash'].encode()):
            return None
        return {"id": row['id'], "username": row['username'], "role": row['role']}


async def get_user_by_id(user_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username, role, is_active, created_at FROM users WHERE id = ?",
            (user_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return dict(row)


async def get_all_users() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username, role, is_active, created_at FROM users ORDER BY id"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def update_user(user_id: int, role: str = None, is_active: bool = None) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        updates = []
        params = []
        if role is not None:
            updates.append("role = ?")
            params.append(role)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)
        if not updates:
            return False
        params.append(user_id)
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        await db.commit()
        return True


async def delete_user(user_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()
        return True


async def change_password(user_id: int, new_password: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
        await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        await db.commit()
        return True


# ── Player / Game functions ──

async def get_or_create_player(name: str, user_id: int = None) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id FROM players WHERE name = ?", (name,))
        row = await cursor.fetchone()
        if row:
            return row[0]
        cursor = await db.execute(
            "INSERT INTO players (name, user_id) VALUES (?, ?)", (name, user_id)
        )
        await db.commit()
        return cursor.lastrowid


async def create_game(player_id: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO games (player_id) VALUES (?)", (player_id,)
        )
        await db.commit()
        return cursor.lastrowid


async def finish_game(game_id: int, score: int, level: int, enemies: int, result: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE games SET end_time = CURRENT_TIMESTAMP, score = ?,
               level_reached = ?, enemies_destroyed = ?, result = ? WHERE id = ?""",
            (score, level, enemies, result, game_id),
        )
        await db.commit()


async def get_player_history(player_id: int) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT id, start_time, end_time, score, level_reached,
                      enemies_destroyed, result
               FROM games WHERE player_id = ? ORDER BY start_time DESC""",
            (player_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_leaderboard(limit: int = 10) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT p.name, g.score, g.level_reached, g.enemies_destroyed, g.start_time
               FROM games g JOIN players p ON g.player_id = p.id
               ORDER BY g.score DESC LIMIT ?""",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_player_level(player_id: int) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT level FROM players WHERE id = ?", (player_id,))
        row = await cursor.fetchone()
        return row[0] if row else 1


async def update_player_level(player_id: int, level: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE players SET level = ? WHERE id = ?", (level, player_id))
        await db.commit()


async def reset_player_level(player_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE players SET level = 1 WHERE id = ?", (player_id,))
        await db.commit()
