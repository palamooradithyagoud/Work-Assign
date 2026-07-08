import os
import json
import uuid
import datetime
import random
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import re

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:ADITHYAGOUD%40789@db.jxnacpjbrnbihgmcydwr.supabase.co:5432/postgres"
)

# Auto-adapt direct IPv6 Supabase hosts to IPv4 Pooler when running on Vercel
if os.environ.get('VERCEL') and DATABASE_URL:
    match = re.search(r"db\.([a-z0-9]+)\.supabase\.co", DATABASE_URL)
    if match:
        project_ref = match.group(1)
        pooler_prefix = "aws-1" if project_ref == "jxnacpjbrnbihgmcydwr" else "aws-0"
        pooler_region = "ap-south-1" if project_ref == "jxnacpjbrnbihgmcydwr" else "ap-southeast-1"
        DATABASE_URL = DATABASE_URL.replace(f"db.{project_ref}.supabase.co:5432", f"{pooler_prefix}-{pooler_region}.pooler.supabase.com:6543")
        DATABASE_URL = DATABASE_URL.replace("postgresql://postgres:", f"postgresql://postgres.{project_ref}:")


# ──────────────────────────────────────────────────────────────
# CONNECTION POOL  (min=1, max=5, reused across requests)
# ──────────────────────────────────────────────────────────────
_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=DATABASE_URL,
                cursor_factory=RealDictCursor,
                connect_timeout=10,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=5,
                keepalives_count=3,
            )
            print("[DB] Connection pool created.")
        except Exception as e:
            print(f"[DB ERROR] Could not create connection pool: {e}")
            raise
    return _pool


def get_conn():
    """Get a pooled connection. Caller must call release_conn() when done."""
    return _get_pool().getconn()


def release_conn(conn):
    """Return a connection to the pool."""
    try:
        _get_pool().putconn(conn)
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────

def _get_pk(table: str) -> str:
    pk_map = {
        "employees":       "employee_id",
        "projects":        "project_id",
        "tools":           "tool_id",
        "project_history": "history_id",
        "modules":         "module_id",
        "teams":           "team_id",
        "team_members":    "id",
        "lead_approvals":  "id",
        "comments":        "id",
        "notifications":   "id",
        "audit_logs":      "id",
        "tasks":           "id",
        "users":           "id",
        "chats":           "id",
        "files":           "id",
    }
    return pk_map.get(table, "id")


def _execute(query: str, params=None, fetch: str = "none"):
    """
    Execute a query using a pooled connection.
    fetch: "one" | "all" | "none"
    Returns fetched row(s) or None.
    Always commits on DML, always releases the connection.
    """
    conn = None
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(query, params)
            if fetch == "one":
                row = cur.fetchone()
                result = dict(row) if row else None
            elif fetch == "all":
                rows = cur.fetchall()
                result = [dict(r) for r in rows]
            else:
                result = None
            conn.commit()
            return result
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise e
    finally:
        if conn:
            release_conn(conn)


# ──────────────────────────────────────────────────────────────
# PUBLIC CRUD API
# ──────────────────────────────────────────────────────────────

def get_all(table: str) -> list:
    try:
        return _execute(f"SELECT * FROM public.{table};", fetch="all") or []
    except Exception as e:
        print(f"[DB ERROR] get_all {table}: {e}")
        return []


def get_by_id(table: str, id_val: str) -> dict:
    try:
        pk = _get_pk(table)
        return _execute(
            f"SELECT * FROM public.{table} WHERE {pk} = %s;",
            (id_val,), fetch="one"
        )
    except Exception as e:
        print(f"[DB ERROR] get_by_id {table}: {e}")
        return None


def insert(table: str, item: dict) -> dict:
    pk = _get_pk(table)
    if pk not in item or not item[pk]:
        prefix = (
            "EMP" if table == "employees" else
            "PRJ" if table == "projects" else
            "T"   if table == "tools"     else
            "H"   if table == "project_history" else ""
        )
        item[pk] = f"{prefix}{random.randint(100, 999)}" if prefix else str(uuid.uuid4())

    if "created_at" not in item and table not in ("tools", "project_history", "assignments"):
        item["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"

    try:
        columns = list(item.keys())
        values = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in item.values()]
        placeholders = ", ".join(["%s"] * len(columns))
        col_names = ", ".join(columns)

        result = _execute(
            f"INSERT INTO public.{table} ({col_names}) VALUES ({placeholders}) RETURNING *;",
            values, fetch="one"
        )
        saved = result if result else item

        # Fire-and-forget audit log (skip for audit_logs/notifications to prevent recursion)
        if table not in ("audit_logs", "notifications"):
            _log_direct(
                action=f"{table.upper()}_CREATED",
                details=f"Created new item in {table} with ID {item[pk]}"
            )
        return saved
    except Exception as e:
        print(f"[DB ERROR] insert {table}: {e}")
        return item


def update(table: str, id_val: str, updates: dict) -> dict:
    if not updates:
        return get_by_id(table, id_val)

    if "updated_at" not in updates and table in ("projects", "tasks", "employees"):
        updates["updated_at"] = datetime.datetime.utcnow().isoformat() + "Z"

    try:
        pk = _get_pk(table)
        set_clauses = []
        values = []
        for k, v in updates.items():
            set_clauses.append(f"{k} = %s")
            values.append(json.dumps(v) if isinstance(v, (dict, list)) else v)
        values.append(id_val)
        set_str = ", ".join(set_clauses)

        result = _execute(
            f"UPDATE public.{table} SET {set_str} WHERE {pk} = %s RETURNING *;",
            values, fetch="one"
        )
        if result and table not in ("audit_logs", "notifications"):
            _log_direct(
                action=f"{table.upper()}_UPDATED",
                details=f"Updated item {id_val} in {table}"
            )
        return result
    except Exception as e:
        print(f"[DB ERROR] update {table}: {e}")
        return None


def delete(table: str, id_val: str) -> bool:
    try:
        pk = _get_pk(table)
        result = _execute(
            f"DELETE FROM public.{table} WHERE {pk} = %s RETURNING {pk};",
            (id_val,), fetch="one"
        )
        success = result is not None
        if success and table not in ("audit_logs", "notifications"):
            _log_direct(
                action=f"{table.upper()}_DELETED",
                details=f"Deleted item {id_val} from {table}"
            )
        return success
    except Exception as e:
        print(f"[DB ERROR] delete {table}: {e}")
        return False


# ──────────────────────────────────────────────────────────────
# AUDIT  &  NOTIFICATIONS  (use _log_direct to avoid recursion)
# ──────────────────────────────────────────────────────────────

def _log_direct(action: str, details: str, user_email: str = "system@assigniq.com"):
    """Write audit log directly (no recursive insert call)."""
    try:
        log_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat() + "Z"
        _execute(
            "INSERT INTO public.audit_logs (id, action, details, user_email, created_at) "
            "VALUES (%s, %s, %s, %s, %s);",
            (log_id, action, details, user_email, now)
        )
    except Exception as e:
        print(f"[DB WARN] audit log failed: {e}")


def log_action(action: str, details: str, user_email: str = "system@assigniq.com"):
    _log_direct(action, details, user_email)


def add_notification(user_id: str, title: str, message: str, notif_type: str = "info"):
    try:
        notif_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat() + "Z"
        _execute(
            "INSERT INTO public.notifications (id, user_id, title, message, type, is_read, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s);",
            (notif_id, user_id, title, message, notif_type, False, now)
        )
    except Exception as e:
        print(f"[DB WARN] add_notification failed: {e}")


# ──────────────────────────────────────────────────────────────
# DATABASE SEED  (only runs once on startup if DB is empty)
# ──────────────────────────────────────────────────────────────

def seed_database():
    try:
        # Quick check — see if users table exists first using information_schema
        table_exists_row = _execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') as exists;",
            fetch="one"
        )
        table_exists = table_exists_row["exists"] if table_exists_row else False

        user_count = 0
        if table_exists:
            row = _execute("SELECT COUNT(*) as cnt FROM public.users;", fetch="one")
            user_count = row["cnt"] if row else 0

        if not table_exists or user_count == 0:
            print("[DB] Database is empty or users table missing. Bootstrapping schemas and seeds...")
            base_dir = os.path.dirname(os.path.abspath(__file__))
            sql_paths = [
                os.path.join(base_dir, "supabase_schema.sql"),
                "supabase_schema.sql",
                "../supabase_schema.sql",
            ]
            sql_content = None
            for path in sql_paths:
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        sql_content = f.read()
                    break

            if sql_content:
                # DDL needs its own connection to avoid autocommit issues
                conn = None
                try:
                    conn = get_conn()
                    conn.autocommit = True
                    with conn.cursor() as cur:
                        cur.execute(sql_content)
                    conn.autocommit = False
                    print("[DB] Database initialized with supabase_schema.sql.")
                    
                    # Run additional v2 migrations
                    try:
                        import migrate_v2
                        print("[DB] Running migrate_v2.py...")
                        migrate_v2.run()
                        print("[DB] migrate_v2.py completed.")
                    except Exception as migration_error:
                        print(f"[DB ERROR] migrate_v2 run failed: {migration_error}")
                except Exception as e:
                    print(f"[DB ERROR] seed DDL failed: {e}")
                finally:
                    if conn:
                        conn.autocommit = False
                        release_conn(conn)
            else:
                print("[DB ERROR] Could not find supabase_schema.sql for bootstrap.")
    except Exception as e:
        print(f"[DB ERROR] seed_database failed: {e}")

