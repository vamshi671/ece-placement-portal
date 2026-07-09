import os
import sys
import traceback
import pandas as pd

# Allow importing from backend/app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import Student

EXCEL_FILE = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "students.xlsx",
)

if not os.path.exists(EXCEL_FILE):
    raise FileNotFoundError(f"Excel file not found:\n{EXCEL_FILE}")


def clean_string(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    if value in ("", "-", "NA", "N/A", "None", "nan"):
        return None

    return value


def to_float(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    if value in ("", "-", "NA", "N/A", "None", "nan"):
        return None

    try:
        return float(value)
    except Exception:
        return None


def to_int(value):
    if pd.isna(value):
        return 0

    value = str(value).strip()

    if value in ("", "-", "NA", "N/A", "None", "nan"):
        return 0

    try:
        return int(float(value))
    except Exception:
        return 0


def clean_mobile(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    if value in ("", "-", "NA", "N/A", "None", "nan"):
        return None

    value = value.replace(".0", "")

    return value


print("=" * 60)
print("Reading Excel...")
print("=" * 60)

df = pd.read_excel(EXCEL_FILE)

# Remove spaces around headers
df.columns = [str(c).strip() for c in df.columns]

db = SessionLocal()

inserted = 0
updated = 0
failed = 0

for index, row in df.iterrows():

    try:

        usn = clean_string(row.get("USN"))

        if usn is None:
            continue

        usn = usn.upper()

        student = db.query(Student).filter(Student.usn == usn).first()

        if student is None:
            student = Student(usn=usn)
            db.add(student)
            inserted += 1
        else:
            updated += 1

        student.name = clean_string(row.get("NAME"))
        student.program = clean_string(row.get("PROGRAM")) or "ECE"

        student.mobile = clean_mobile(row.get("MOBILE"))

        student.personal_email = clean_string(
            row.get("PERSONAL EMAIL-ID")
        )

        student.college_email = clean_string(
            row.get("COLLEGE EMAIL-ID")
        )

        student.tenth_pct = to_float(
            row.get("10TH PERCENTAGE")
        )

        student.twelfth_pct = to_float(
            row.get("12TH PERCENTAGE")
        )

        student.sem1 = to_float(
            row.get("1st SEM (SGPA)")
        )

        student.sem2 = to_float(
            row.get("2ND SEM (SGPA)")
        )

        student.sem3 = to_float(
            row.get("3RD SEM(SGPA)")
        )

        student.sem4 = to_float(
            row.get("4TH SEM( SGPA)")
        )

        student.sem5 = to_float(
            row.get("5TH SEM(SGPA)")
        )

        student.sem6 = to_float(
            row.get("6TH SEM(SGPA)")
        )

        student.sem7 = None
        student.sem8 = None

        student.cgpa = to_float(
            row.get("CUMMULATIVE CGPA")
        )

        backlog = clean_string(
            row.get("Current Backlog Subjects(YES/NO)")
        )

        student.backlog_current = backlog.upper() if backlog else "NO"

        student.active_backlogs = to_int(
            row.get("Number of Active Backlogs")
        )

        # Placement fields
        student.is_placed = False
        student.placement_status = False
        student.company_name = None
        student.placed_company = None

    except Exception as e:

        failed += 1

        print(f"\n❌ Error in Excel Row {index + 2}")
        print(e)
        traceback.print_exc()

db.commit()
db.close()

print("\n" + "=" * 60)
print("IMPORT COMPLETED")
print("=" * 60)
print(f"Inserted : {inserted}")
print(f"Updated  : {updated}")
print(f"Failed   : {failed}")
print("=" * 60)