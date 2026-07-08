from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    usn: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    program: Mapped[str] = mapped_column(String(32), nullable=False, default="ECE")
    mobile: Mapped[str | None] = mapped_column(String(32), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    college_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tenth_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    twelfth_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem1: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem2: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem3: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem4: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem5: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem6: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem7: Mapped[float | None] = mapped_column(Float, nullable=True)
    sem8: Mapped[float | None] = mapped_column(Float, nullable=True)
    cgpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_placed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    placed_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    placement_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    backlog_current: Mapped[str] = mapped_column(String(8), nullable=False, default="NO")
    active_backlogs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    drive_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, default="Placement Drive")
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="#3bd688")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    venue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
