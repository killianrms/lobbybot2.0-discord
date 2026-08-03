#!/usr/bin/env python3
"""Migration one-shot SQLite -> PostgreSQL pour lobbybot.

- Copie toutes les tables en préservant ids et timestamps (interprétés UTC,
  comme les écrivait CURRENT_TIMESTAMP de SQLite).
- Backfill owner_discord_id sur epic_accounts (défaut : DEFAULT_OWNER).
- Seed : table admins, owner_settings du propriétaire par défaut,
  comptes dashboard du frère et du neveu (mots de passe via env).
- Tout est fait dans UNE transaction : échec => rollback, la base PG reste vide.
- Idempotent par garde-fou : refuse de tourner si epic_accounts contient déjà
  des lignes côté PG.

Usage (sur vm-prod) :
  PGPASSWORD=... WEB_FRERE_PASSWORD=... WEB_NEVEU_PASSWORD=... \
    python3 migrate_sqlite_to_pg.py /home/killian/apps/data/lobbybot.db
"""

import json
import os
import sqlite3
import sys

import bcrypt
import psycopg2

DEFAULT_OWNER = "335755692134891520"
ADMINS = [
    ("335755692134891520", "killian"),
    ("296037979397423104", "frère"),
    ("535161786358300682", "neveu"),
]
NEW_WEB_ACCOUNTS = [
    # (email placeholder, env du mot de passe, discord_id)
    ("frere@lobbybot.local", "WEB_FRERE_PASSWORD", "296037979397423104"),
    ("neveu@lobbybot.local", "WEB_NEVEU_PASSWORD", "535161786358300682"),
]

TABLES = [
    "epic_accounts",
    "users",
    "premium",
    "loadout_presets",
    "dashboard_admins",
    "dashboard_config",
]


def main() -> None:
    db_file = sys.argv[1] if len(sys.argv) > 1 else "/home/killian/apps/data/lobbybot.db"
    lite = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
    lite.row_factory = sqlite3.Row

    pg = psycopg2.connect(
        host=os.environ.get("PGHOST", "127.0.0.1"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ["PGPASSWORD"],
        dbname=os.environ.get("PGDATABASE", "lobbybot"),
    )
    cur = pg.cursor()
    cur.execute("SET TIME ZONE 'UTC'")  # timestamps SQLite = UTC naïf

    cur.execute("SELECT COUNT(*) FROM epic_accounts")
    if cur.fetchone()[0]:
        sys.exit("REFUS : epic_accounts n'est pas vide côté PG (déjà migré ?)")

    def rows(table: str) -> list[sqlite3.Row]:
        return lite.execute(f"SELECT * FROM {table}").fetchall()

    for r in rows("epic_accounts"):
        cur.execute(
            """INSERT INTO epic_accounts
               (id, email, pseudo, password_enc, secret_id, device_id, account_id,
                is_active, created_at, last_used_at, owner_discord_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (r["id"], r["email"], r["pseudo"], r["password_enc"], r["secret_id"],
             r["device_id"], r["account_id"], r["is_active"], r["created_at"],
             r["last_used_at"], r["owner_discord_id"] or DEFAULT_OWNER),
        )

    for r in rows("users"):
        cur.execute(
            """INSERT INTO users
               (discord_id, epic_pseudo, device_id, account_id, secret, language, created_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (r["discord_id"], r["epic_pseudo"], r["device_id"], r["account_id"],
             r["secret"], r["language"], r["created_at"]),
        )

    for r in rows("premium"):
        cur.execute(
            "INSERT INTO premium (discord_id, source, granted_at, expires_at) VALUES (%s,%s,%s,%s)",
            (r["discord_id"], r["source"], r["granted_at"], r["expires_at"]),
        )

    for r in rows("loadout_presets"):
        cur.execute(
            """INSERT INTO loadout_presets
               (id, discord_id, name, outfit, backpack, pickaxe, emote, is_active)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (r["id"], r["discord_id"], r["name"], r["outfit"], r["backpack"],
             r["pickaxe"], r["emote"], r["is_active"]),
        )

    for r in rows("dashboard_admins"):
        # Le compte existant est celui de Killian : on le lie à son Discord ID.
        cur.execute(
            """INSERT INTO dashboard_admins
               (id, email, password_hash, failed_attempts, locked, created_at, discord_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (r["id"], r["email"], r["password_hash"], r["failed_attempts"],
             r["locked"], r["created_at"], DEFAULT_OWNER),
        )
        print(f"dashboard_admin existant lié à {DEFAULT_OWNER} : {r['email']}")

    for r in rows("dashboard_config"):
        cur.execute(
            "INSERT INTO dashboard_config (key, value) VALUES (%s,%s)",
            (r["key"], r["value"]),
        )

    # ── Seeds ────────────────────────────────────────────────────────
    for discord_id, label in ADMINS:
        cur.execute(
            "INSERT INTO admins (discord_id, label) VALUES (%s,%s)",
            (discord_id, label),
        )

    # owner_settings du propriétaire par défaut = le globalConfig actuel
    row = lite.execute(
        "SELECT value FROM dashboard_config WHERE key='globalConfig'"
    ).fetchone()
    gc = json.loads(row["value"]) if row else {}
    cur.execute(
        """INSERT INTO owner_settings (owner_discord_id, creator_code, status, join_msg, add_msg)
           VALUES (%s,%s,%s,%s,%s)""",
        (DEFAULT_OWNER, "AEROZ", gc.get("status"), gc.get("joinMsg"), gc.get("addMsg")),
    )

    # Recaler les séquences identity AVANT d'insérer les nouveaux comptes
    # (les copies ci-dessus ont posé des ids explicites, la séquence est restée à 1)
    for table in ("epic_accounts", "loadout_presets", "dashboard_admins"):
        cur.execute(
            f"SELECT setval(pg_get_serial_sequence('{table}','id'), "
            f"COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
        )

    for email, pw_env, discord_id in NEW_WEB_ACCOUNTS:
        pw = os.environ[pw_env].encode()
        h = bcrypt.hashpw(pw, bcrypt.gensalt(12)).decode()
        cur.execute(
            "INSERT INTO dashboard_admins (email, password_hash, discord_id) VALUES (%s,%s,%s)",
            (email, h, discord_id),
        )

    pg.commit()

    # ── Vérification comptages ───────────────────────────────────────
    print(f"\n{'table':<20} {'sqlite':>7} {'pg':>7}")
    ok = True
    for table in TABLES:
        n_lite = lite.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        n_pg = cur.fetchone()[0]
        # dashboard_admins : +2 comptes seedés côté PG
        expected = n_lite + (2 if table == "dashboard_admins" else 0)
        mark = "OK" if n_pg == expected else "ECART !"
        ok = ok and n_pg == expected
        print(f"{table:<20} {n_lite:>7} {n_pg:>7}  {mark}")
    cur.execute("SELECT COUNT(*) FROM epic_accounts WHERE owner_discord_id IS NULL")
    nulls = cur.fetchone()[0]
    print(f"\nowner_discord_id NULL restants : {nulls}")
    cur.execute("SELECT COUNT(*) FROM admins")
    print(f"admins seedés : {cur.fetchone()[0]}")
    print("\nMIGRATION OK" if ok and nulls == 0 else "\nMIGRATION EN ECART — vérifier !")
    sys.exit(0 if ok and nulls == 0 else 1)


if __name__ == "__main__":
    main()
