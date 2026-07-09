import hmac
import io
import re

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

import os

from .auth import ADMIN_ACCESS_CODE, TOKEN_SECRET, create_token, require_admin, require_user
from .database import Base, SessionLocal, engine, get_db
from .models import ScheduleEntry, Student
from .schemas import AuthResponse, ImportResponse, LoginRequest, ScheduleCreate, ScheduleOut, ScheduleUpdate, StatsResponse, StudentCreate, StudentOut, StudentUpdate
from .services import (
    apply_schedule_entry,
    apply_student,
    export_csv,
    export_xlsx,
    find_student_by_usn,
    get_stats,
    import_students_from_workbook,
    list_schedule_entries,
    list_students,
    normalize_usn,
    seed_from_legacy_html,
)

STUDENT_FIELDS = [
    "name", "usn", "program", "mobile", "personal_email", "college_email",
    "tenth_pct", "twelfth_pct", "sem1", "sem2", "sem3", "sem4", "sem5", "sem6", "sem7", "sem8",
    "cgpa", "placement_status", "company_name", "backlog_current", "active_backlogs",
]


def ensure_student_schema():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("students")} if inspector.has_table("students") else set()
    statements = []
    if "sem7" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN sem7 FLOAT"))
    if "sem8" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN sem8 FLOAT"))
    if "is_placed" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN is_placed BOOLEAN DEFAULT FALSE"))
    if "placed_company" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN placed_company VARCHAR(255)"))
    if "placement_status" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN placement_status BOOLEAN DEFAULT FALSE"))
    if "company_name" not in columns:
        statements.append(text("ALTER TABLE students ADD COLUMN company_name VARCHAR(255)"))

    if not statements:
        with engine.begin() as connection:
            connection.execute(text("UPDATE students SET placement_status = COALESCE(placement_status, is_placed, 0)"))
            connection.execute(text("UPDATE students SET company_name = COALESCE(company_name, placed_company)"))
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(statement)
        connection.execute(text("UPDATE students SET placement_status = COALESCE(placement_status, is_placed, 0)"))
        connection.execute(text("UPDATE students SET company_name = COALESCE(company_name, placed_company)"))


def ensure_schedule_schema():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("schedule_entries")} if inspector.has_table("schedule_entries") else set()
    statements = []
    if "title" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN title VARCHAR(255)"))
    if "start_at" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN start_at TIMESTAMP"))
    if "end_at" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN end_at TIMESTAMP"))
    if "event_type" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN event_type VARCHAR(64) DEFAULT 'Placement Drive'"))
    if "color" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN color VARCHAR(32) DEFAULT '#3bd688'"))
    if "location" not in columns:
        statements.append(text("ALTER TABLE schedule_entries ADD COLUMN location VARCHAR(255)"))

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(statement)
        if inspector.has_table("schedule_entries"):
            connection.execute(text("UPDATE schedule_entries SET title = COALESCE(title, company_name, 'Placement Drive')"))
            connection.execute(text("UPDATE schedule_entries SET location = COALESCE(location, venue)"))
            connection.execute(text("UPDATE schedule_entries SET event_type = COALESCE(event_type, 'Placement Drive')"))
            connection.execute(text("UPDATE schedule_entries SET color = COALESCE(color, '#3bd688')"))
            connection.execute(text("UPDATE schedule_entries SET start_at = COALESCE(start_at, drive_date || ' 09:00:00')"))
            connection.execute(text("UPDATE schedule_entries SET end_at = COALESCE(end_at, drive_date || ' 10:00:00')"))


app = FastAPI(title="ECE Placement Portal API")

_allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    is_production = os.getenv("RENDER") or os.getenv("ENVIRONMENT", "").lower() == "production"
    if is_production:
        if TOKEN_SECRET in {"change-me-in-production", "replace-with-a-long-random-secret"}:
            raise RuntimeError(
                "Refusing to start: TOKEN_SECRET is still set to its default/placeholder value. "
                "Set a long random secret via the TOKEN_SECRET environment variable."
            )
        if ADMIN_ACCESS_CODE in {"change-this-admin-code", "ece-admin"}:
            raise RuntimeError(
                "Refusing to start: ADMIN_ACCESS_CODE is still set to its default/placeholder value. "
                "Set a strong access code via the ADMIN_ACCESS_CODE environment variable."
            )
    Base.metadata.create_all(bind=engine)
    ensure_student_schema()
    ensure_schedule_schema()
    with SessionLocal() as db:
        seed_from_legacy_html(db)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/portal/stats", response_model=StatsResponse)
def portal_stats(db: Session = Depends(get_db)):
    return get_stats(db)


@app.get("/schedule", response_model=list[ScheduleOut])
def get_schedule(
    search: str = "",
    company: str = "",
    event_type: str = "",
    _: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    return list_schedule_entries(db, search=search, company=company, event_type=event_type)


@app.post("/auth/student", response_model=AuthResponse)
def student_login(payload: LoginRequest, db: Session = Depends(get_db)):
    usn = normalize_usn(payload.usn or "")
    student = find_student_by_usn(db, usn)
    submitted_mobile = re.sub(r"\D", "", payload.mobile or "")
    stored_mobile = re.sub(r"\D", "", student.mobile or "") if student else ""
    # Constant-time-ish check that also fails closed when either side is empty,
    # so a blank mobile on file can never be bypassed with a blank submission.
    valid = bool(student) and bool(stored_mobile) and bool(submitted_mobile) and hmac.compare_digest(stored_mobile, submitted_mobile)
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid USN or mobile number.")
    token = create_token({"role": "student", "usn": student.usn})
    return AuthResponse(token=token, role="student", student=student)


@app.post("/auth/admin", response_model=AuthResponse)
def admin_login(payload: LoginRequest):
    if (payload.code or "").strip() != ADMIN_ACCESS_CODE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect access code.")
    token = create_token({"role": "admin"})
    return AuthResponse(token=token, role="admin")


@app.get("/students", response_model=list[StudentOut])
def get_students(
    q: str = "",
    backlog_filter: str = "all",
    placement_filter: str = "all",
    sort_key: str = "name",
    sort_dir: str = "asc",
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return list_students(
        db,
        query=q,
        backlog_filter=backlog_filter,
        placement_filter=placement_filter,
        sort_key=sort_key,
        sort_dir=sort_dir,
    )


@app.get("/students/stats", response_model=StatsResponse)
def student_stats(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return get_stats(db)


@app.get("/students/{usn}", response_model=StudentOut)
def get_student(usn: str, user=Depends(require_user), db: Session = Depends(get_db)):
    student = find_student_by_usn(db, usn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    if user.get("role") == "student" and user.get("usn") != student.usn:
        raise HTTPException(status_code=403, detail="Access denied.")
    return student


@app.post("/students", response_model=StudentOut, status_code=201)
def create_student(payload: StudentCreate, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    if find_student_by_usn(db, payload.usn):
        raise HTTPException(status_code=409, detail="USN already exists.")
    student = apply_student(Student(), payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@app.put("/students/{usn}", response_model=StudentOut)
def update_student(
    usn: str,
    payload: StudentUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = find_student_by_usn(db, usn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    updates = {field: getattr(student, field) for field in STUDENT_FIELDS} | payload.model_dump(exclude_unset=True)
    next_usn = normalize_usn(updates.get("usn") or student.usn)
    if next_usn != student.usn and find_student_by_usn(db, next_usn):
        raise HTTPException(status_code=409, detail="USN already exists.")
    apply_student(student, updates)
    db.commit()
    db.refresh(student)
    return student


@app.post("/schedule", response_model=ScheduleOut, status_code=201)
def create_schedule_entry(payload: ScheduleCreate, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    entry = apply_schedule_entry(ScheduleEntry(), payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.put("/schedule/{entry_id}", response_model=ScheduleOut)
def update_schedule_entry(
    entry_id: int,
    payload: ScheduleUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Schedule entry not found.")
    apply_schedule_entry(entry, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/schedule/{entry_id}", status_code=204)
def delete_schedule_entry(entry_id: int, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Schedule entry not found.")
    db.delete(entry)
    db.commit()
    return Response(status_code=204)


@app.delete("/students/{usn}", status_code=204)
def delete_student(usn: str, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    student = find_student_by_usn(db, usn)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    db.delete(student)
    db.commit()
    return Response(status_code=204)


@app.post("/students/import", response_model=ImportResponse)
def import_students(
    file: UploadFile = File(...),
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith((".xlsx", ".xlsm", ".xltx", ".xltm")):
        raise HTTPException(status_code=400, detail="Upload an Excel file.")
    return import_students_from_workbook(db, file.file.read())


@app.get("/students/export/csv")
def download_csv(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    students = db.execute(select(Student).order_by(Student.name.asc())).scalars().all()
    csv_content = export_csv(students)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ece-placement-students.csv"},
    )


@app.get("/students/export/xlsx")
def download_xlsx(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    students = db.execute(select(Student).order_by(Student.name.asc())).scalars().all()
    data = export_xlsx(students)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ece-placement-students.xlsx"},
    )
