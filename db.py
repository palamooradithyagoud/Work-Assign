import os
import json
import uuid
import datetime
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres.tdcdhgwgkkdklflxwuqt:ADITHYAGOUD%40789@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres")

def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def _get_pk(table: str) -> str:
    if table == "employees":
        return "employee_id"
    if table == "projects":
        return "project_id"
    if table == "tools":
        return "tool_id"
    if table == "project_history":
        return "history_id"
    return "id"

def get_all(table: str) -> list:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM public.{table};")
        rows = cur.fetchall()
        result = [dict(row) for row in rows]
        cur.close()
        conn.close()
        return result
    except Exception as e:
        print(f"[DB ERROR] get_all {table}: {e}")
        return []

def get_by_id(table: str, id_val: str) -> dict:
    try:
        conn = get_conn()
        cur = conn.cursor()
        pk = _get_pk(table)
        cur.execute(f"SELECT * FROM public.{table} WHERE {pk} = %s;", (id_val,))
        row = cur.fetchone()
        result = dict(row) if row else None
        cur.close()
        conn.close()
        return result
    except Exception as e:
        print(f"[DB ERROR] get_by_id {table}: {e}")
        return None

def insert(table: str, item: dict) -> dict:
    pk = _get_pk(table)
    if pk not in item or not item[pk]:
        prefix = "EMP" if table == "employees" else ("PRJ" if table == "projects" else ("T" if table == "tools" else ("H" if table == "project_history" else "")))
        if prefix:
            item[pk] = f"{prefix}{random.randint(100, 999)}"
        else:
            item[pk] = str(uuid.uuid4())
            
    if "created_at" not in item and table not in ("tools", "project_history", "assignments"):
        item["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        columns = list(item.keys())
        values = []
        for col in columns:
            val = item[col]
            if isinstance(val, (dict, list)):
                values.append(json.dumps(val))
            else:
                values.append(val)
                
        placeholders = ", ".join(["%s"] * len(columns))
        col_names = ", ".join(columns)
        
        query = f"INSERT INTO public.{table} ({col_names}) VALUES ({placeholders}) RETURNING *;"
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()
        result = dict(row) if row else item
        cur.close()
        conn.close()
        
        if table != "audit_logs" and table != "notifications":
            log_action(
                action=f"{table.upper()}_CREATED",
                details=f"Created new item in {table} with ID {item[pk]}",
                user_email="system@assigniq.com"
            )
        return result
    except Exception as e:
        print(f"[DB ERROR] insert {table}: {e}")
        return item

def update(table: str, id_val: str, updates: dict) -> dict:
    if not updates:
        return get_by_id(table, id_val)
        
    if "updated_at" not in updates and table in ("projects", "tasks", "employees"):
        updates["updated_at"] = datetime.datetime.utcnow().isoformat() + "Z"
        
    try:
        conn = get_conn()
        cur = conn.cursor()
        pk = _get_pk(table)
        
        set_clauses = []
        values = []
        for k, v in updates.items():
            set_clauses.append(f"{k} = %s")
            if isinstance(v, (dict, list)):
                values.append(json.dumps(v))
            else:
                values.append(v)
                
        values.append(id_val)
        set_str = ", ".join(set_clauses)
        
        query = f"UPDATE public.{table} SET {set_str} WHERE {pk} = %s RETURNING *;"
        cur.execute(query, values)
        row = cur.fetchone()
        conn.commit()
        result = dict(row) if row else None
        cur.close()
        conn.close()
        
        if result and table != "audit_logs" and table != "notifications":
            log_action(
                action=f"{table.upper()}_UPDATED",
                details=f"Updated item {id_val} in {table}",
                user_email="system@assigniq.com"
            )
        return result
    except Exception as e:
        print(f"[DB ERROR] update {table}: {e}")
        return None

def delete(table: str, id_val: str) -> bool:
    try:
        conn = get_conn()
        cur = conn.cursor()
        pk = _get_pk(table)
        cur.execute(f"DELETE FROM public.{table} WHERE {pk} = %s RETURNING {pk};", (id_val,))
        row = cur.fetchone()
        conn.commit()
        success = row is not None
        cur.close()
        conn.close()
        
        if success and table != "audit_logs" and table != "notifications":
            log_action(
                action=f"{table.upper()}_DELETED",
                details=f"Deleted item {id_val} from {table}",
                user_email="system@assigniq.com"
            )
        return success
    except Exception as e:
        print(f"[DB ERROR] delete {table}: {e}")
        return False

# Audit log helper
def log_action(action: str, details: str, user_email: str = "system@assigniq.com"):
    log_item = {
        "id": str(uuid.uuid4()),
        "action": action,
        "details": details,
        "user_email": user_email,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    insert("audit_logs", log_item)

# Notification helper
def add_notification(user_id: str, title: str, message: str, notif_type: str = "info"):
    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "is_read": False,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z"
    }
    insert("notifications", notif)

def seed_database():
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Check if users table exists and count users
        table_exists = True
        try:
            cur.execute("SELECT COUNT(*) FROM public.users;")
            user_count = cur.fetchone()[0]
        except Exception:
            # Transaction is aborted, roll back so we can execute DDL setup
            conn.rollback()
            table_exists = False
            user_count = 0
            
        if not table_exists or user_count == 0:
            print("[DB] Database is empty or uninitialized. Bootstrapping schemas and target seeds...")
            base_dir = os.path.dirname(os.path.abspath(__file__))
            sql_paths = [
                os.path.join(base_dir, "supabase_schema.sql"),
                "supabase_schema.sql",
                "../supabase_schema.sql"
            ]
            
            sql_content = None
            for path in sql_paths:
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        sql_content = f.read()
                    break
                    
            if sql_content:
                cur.execute(sql_content)
                conn.commit()
                print("[DB] Database successfully initialized with target schemas and seeds.")
            else:
                print("[DB ERROR] Could not find supabase_schema.sql for database bootstrap.")
                
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[DB ERROR] seed_database failed: {e}")
