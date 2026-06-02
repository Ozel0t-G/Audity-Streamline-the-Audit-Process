import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { pool } from "../db/client.js";
import { seedRolesAndPermissions } from "../rbac/seed.js";
import {
  createRefreshToken,
  hashRefreshToken,
  refreshExpiry,
  signAccessToken
} from "./tokens.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
};

type UserRow = AuthUser & {
  password_hash: string;
  status: string;
};

export async function getUserCount(): Promise<number> {
  const result = await pool.query<{ count: string }>("select count(*) from users");
  return Number(result.rows[0].count);
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `select u.id, u.email, u.name, u.password_hash, u.status, r.name as role,
      coalesce(array_agg(p.name) filter (where p.name is not null), '{}') as permissions
     from users u
     join roles r on r.id = u.role_id
     left join role_permissions rp on rp.role_id = r.id
     left join permissions p on p.id = rp.permission_id
     where lower(u.email) = lower($1)
     group by u.id, r.name`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const result = await pool.query<AuthUser>(
    `select u.id, u.email, u.name, r.name as role,
      coalesce(array_agg(p.name) filter (where p.name is not null), '{}') as permissions
     from users u
     join roles r on r.id = u.role_id
     left join role_permissions rp on rp.role_id = r.id
     left join permissions p on p.id = rp.permission_id
     where u.id = $1 and u.status = 'active'
     group by u.id, r.name`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createInstanceAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthUser> {
  await seedRolesAndPermissions();
  const role = await pool.query<{ id: string }>(
    "select id from roles where name = 'Instance Admin'"
  );
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id
  });
  const id = randomUUID();
  await pool.query(
    `insert into users (id, email, name, password_hash, role_id)
     values ($1, lower($2), $3, $4, $5)`,
    [id, input.email, input.name, passwordHash, role.rows[0].id]
  );
  const user = await getUserById(id);
  if (!user) {
    throw new Error("Created admin user could not be loaded");
  }
  return user;
}

export async function createSession(user: AuthUser): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const refreshToken = createRefreshToken();
  const sessionId = randomUUID();
  await pool.query(
    `insert into sessions (id, user_id, refresh_token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [sessionId, user.id, hashRefreshToken(refreshToken), refreshExpiry()]
  );
  return {
    accessToken: signAccessToken({
      sub: user.id,
      sid: sessionId,
      email: user.email,
      role: user.role,
      permissions: user.permissions
    }),
    refreshToken
  };
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  const row = await getUserByEmail(email);
  if (!row || row.status !== "active") {
    return null;
  }
  const valid = await argon2.verify(row.password_hash, password);
  if (!valid) {
    return null;
  }
  const user: AuthUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions: row.permissions
  };
  const tokens = await createSession(user);
  return { user, ...tokens };
}

export async function refreshSession(
  refreshToken: string
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  const result = await pool.query<{ id: string; user_id: string }>(
    `select id, user_id from sessions
     where refresh_token_hash = $1
       and revoked_at is null
       and expires_at > now()`,
    [hashRefreshToken(refreshToken)]
  );
  const session = result.rows[0];
  if (!session) {
    return null;
  }
  await pool.query("update sessions set revoked_at = now() where id = $1", [
    session.id
  ]);
  const user = await getUserById(session.user_id);
  if (!user) {
    return null;
  }
  const tokens = await createSession(user);
  return { user, ...tokens };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await pool.query(
    "update sessions set revoked_at = now() where refresh_token_hash = $1",
    [hashRefreshToken(refreshToken)]
  );
}

export async function revokeSession(sessionId: string): Promise<void> {
  await pool.query("update sessions set revoked_at = now() where id = $1", [sessionId]);
}

export async function isSessionActive(sessionId: string): Promise<boolean> {
  const result = await pool.query<{ active: boolean }>(
    `select exists(
      select 1 from sessions
      where id = $1 and revoked_at is null and expires_at > now()
    ) as active`,
    [sessionId]
  );
  return result.rows[0]?.active === true;
}
