from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


SEM_FIELDS = ("sem1", "sem2", "sem3", "sem4", "sem5", "sem6", "sem7", "sem8")


class StudentBase(BaseModel):
    name: str
    usn: str
    program: str = "ECE"
    mobile: str | None = None
    personal_email: str | None = None
    college_email: str | None = None
    tenth_pct: float | None = None
    twelfth_pct: float | None = None
    sem1: float | None = Field(default=None, ge=0, le=10)
    sem2: float | None = Field(default=None, ge=0, le=10)
    sem3: float | None = Field(default=None, ge=0, le=10)
    sem4: float | None = Field(default=None, ge=0, le=10)
    sem5: float | None = Field(default=None, ge=0, le=10)
    sem6: float | None = Field(default=None, ge=0, le=10)
    sem7: float | None = Field(default=None, ge=0, le=10)
    sem8: float | None = Field(default=None, ge=0, le=10)
    placement_status: bool = False
    company_name: str | None = None
    backlog_current: str = "NO"
    active_backlogs: int = 0

    @model_validator(mode="after")
    def validate_placement(self):
        if self.placement_status and not (self.company_name or "").strip():
            raise ValueError("Company name is required when placement status is set to placed.")
        if not self.placement_status:
            self.company_name = None
        return self


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    name: str | None = None
    usn: str | None = None
    program: str | None = None
    mobile: str | None = None
    personal_email: str | None = None
    college_email: str | None = None
    tenth_pct: float | None = None
    twelfth_pct: float | None = None
    sem1: float | None = Field(default=None, ge=0, le=10)
    sem2: float | None = Field(default=None, ge=0, le=10)
    sem3: float | None = Field(default=None, ge=0, le=10)
    sem4: float | None = Field(default=None, ge=0, le=10)
    sem5: float | None = Field(default=None, ge=0, le=10)
    sem6: float | None = Field(default=None, ge=0, le=10)
    sem7: float | None = Field(default=None, ge=0, le=10)
    sem8: float | None = Field(default=None, ge=0, le=10)
    placement_status: bool | None = None
    company_name: str | None = None
    backlog_current: str | None = None
    active_backlogs: int | None = None

    @model_validator(mode="after")
    def validate_placement(self):
        if self.placement_status is False:
            self.company_name = None
        if self.placement_status is True and not (self.company_name or "").strip():
            raise ValueError("Company name is required when placement status is set to placed.")
        return self


class StudentOut(StudentBase):
    id: int
    cgpa: float | None = None

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    usn: str | None = None
    mobile: str | None = None
    code: str | None = None


class AuthResponse(BaseModel):
    token: str
    role: str
    student: StudentOut | None = None


class StatsResponse(BaseModel):
    total: int
    average_cgpa: float
    active_backlogs: int
    top_cgpa: float
    zero_backlog: int
    placed_students: int
    not_placed_students: int


class ImportResponse(BaseModel):
    created: int
    updated: int
    ignored: int


class ScheduleBase(BaseModel):
    title: str
    company_name: str | None = None
    description: str | None = None
    location: str | None = None
    event_type: str = "Placement Drive"
    color: str = "#3bd688"
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def validate_window(self):
        if self.end_at < self.start_at:
            raise ValueError("Event end time must be after the start time.")
        return self


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    title: str | None = None
    company_name: str | None = None
    description: str | None = None
    location: str | None = None
    event_type: str | None = None
    color: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self):
        if self.start_at and self.end_at and self.end_at < self.start_at:
            raise ValueError("Event end time must be after the start time.")
        return self


class ScheduleOut(ScheduleBase):
    id: int
    drive_date: date

    model_config = ConfigDict(from_attributes=True)
