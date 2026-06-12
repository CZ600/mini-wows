const BASE = '';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function authJsonHeaders() {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}

export function saveToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

// ── Auth ──

export async function register(username, password) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || '注册失败');
  }
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || '登录失败');
  }
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${BASE}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function changePassword(newPassword) {
  const res = await fetch(`${BASE}/api/auth/password`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || '修改失败');
  }
  return res.json();
}

// ── Admin ──

export async function getAdminUsers() {
  const res = await fetch(`${BASE}/api/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error('无权限');
  return res.json();
}

export async function adminUpdateUser(userId, updates) {
  const res = await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('更新失败');
  return res.json();
}

export async function adminDeleteUser(userId) {
  const res = await fetch(`${BASE}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('删除失败');
  return res.json();
}

// Alias for compatibility
export const updateAdminUser = adminUpdateUser;
export const deleteAdminUser = adminDeleteUser;

export async function getRooms() {
  const res = await fetch(`${BASE}/api/rooms`, { headers: authHeaders() });
  if (!res.ok) throw new Error('获取房间列表失败');
  return res.json();
}

export async function getAdminStats() {
  const res = await fetch(`${BASE}/api/admin/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('无权限');
  return res.json();
}

export async function getAdminRooms() {
  const res = await fetch(`${BASE}/api/admin/rooms`, { headers: authHeaders() });
  if (!res.ok) throw new Error('无权限');
  return res.json();
}

export async function closeAdminRoom(roomId) {
  const res = await fetch(`${BASE}/api/admin/rooms/${roomId}/close`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('关闭房间失败');
  return res.json();
}

export async function kickAdminPlayer(roomId, playerId) {
  const res = await fetch(`${BASE}/api/admin/rooms/${roomId}/kick/${playerId}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('踢出玩家失败');
  return res.json();
}

export async function adminBroadcast(content) {
  const res = await fetch(`${BASE}/api/admin/broadcast`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('发送公告失败');
  return res.json();
}

export async function getAdminAnnouncements() {
  const res = await fetch(`${BASE}/api/admin/announcements`, { headers: authHeaders() });
  if (!res.ok) throw new Error('无权限');
  return res.json();
}

export async function getAdminServerStatus() {
  const res = await fetch(`${BASE}/api/admin/server-status`, { headers: authHeaders() });
  if (!res.ok) throw new Error('无权限');
  return res.json();
}

// ── Game ──

export async function createPlayer(name) {
  const res = await fetch(`${BASE}/api/players`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function createGame(playerId) {
  const res = await fetch(`${BASE}/api/games?player_id=${playerId}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

export async function finishGame(gameId, score, level, enemies, result) {
  await fetch(`${BASE}/api/games/${gameId}`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify({ score, level, enemies, result }),
  });
}

export async function getLeaderboard() {
  const res = await fetch(`${BASE}/api/leaderboard`);
  return res.json();
}

export async function getPlayerProgress(playerId) {
  const res = await fetch(`${BASE}/api/players/${playerId}/progress`, { headers: authHeaders() });
  if (!res.ok) return { level: 1 };
  return res.json();
}

export async function savePlayerProgress(playerId, level) {
  await fetch(`${BASE}/api/players/${playerId}/progress`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify({ level }),
  });
}

export async function resetPlayerProgress(playerId) {
  await fetch(`${BASE}/api/players/${playerId}/reset-progress`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function getPlayerClass(playerId) {
  const res = await fetch(`${BASE}/api/players/${playerId}/class`, { headers: authHeaders() });
  if (!res.ok) return { shipClass: null };
  return res.json();
}

export async function setPlayerClass(playerId, shipClass) {
  const res = await fetch(`${BASE}/api/players/${playerId}/class`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify({ shipClass }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || '设置职业失败');
  }
  return res.json();
}
