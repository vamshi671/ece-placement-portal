import io

from openpyxl import Workbook

from app.database import Base, SessionLocal, engine
from app.models import Student
from app.services import import_students_from_workbook


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_import_keeps_explicit_cgpa_from_excel():
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"
    ws.append(["name", "usn", "program", "CGPA Details", "sem1", "sem2"])
    ws.append(["Test Student", "1RF23EC001", "ECE", 8.75, 8.5, 8.9])

    buffer = io.BytesIO()
    wb.save(buffer)

    db = SessionLocal()
    try:
        response = import_students_from_workbook(db, buffer.getvalue())
        student = db.query(Student).filter(Student.usn == "1RF23EC001").one()
    finally:
        db.close()

    assert response.created == 1
    assert student.cgpa == 8.75
