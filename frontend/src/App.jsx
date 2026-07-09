import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const EMPTY_FORM = {
  name: "",
  usn: "",
  program: "ECE",
  mobile: "",
  personal_email: "",
  college_email: "",
  tenth_pct: "",
  twelfth_pct: "",
  sem1: "",
  sem2: "",
  sem3: "",
  sem4: "",
  sem5: "",
  sem6: "",
  sem7: "",
  sem8: "",
  placement_status: false,
  company_name: "",
  active_backlogs: 0,
};
const EMPTY_EVENT_FORM = {
  title: "",
  company_name: "",
  description: "",
  start_at: "",
  end_at: "",
};
const SEMESTER_FIELDS = [
  "sem1",
  "sem2",
  "sem3",
  "sem4",
  "sem5",
  "sem6",
  "sem7",
  "sem8",
];
const STUDENT_SORT_OPTIONS = [
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "cgpa-desc", label: "CGPA: High to Low" },
  { value: "cgpa-asc", label: "CGPA: Low to High" },
  { value: "tenth_pct-desc", label: "10th %: High to Low" },
  { value: "tenth_pct-asc", label: "10th %: Low to High" },
  { value: "twelfth_pct-desc", label: "12th %: High to Low" },
  { value: "twelfth_pct-asc", label: "12th %: Low to High" },
  { value: "placement_status-desc", label: "Placement: Placed First" },
  { value: "placement_status-asc", label: "Placement: Not Placed First" },
];

function buildHeaders(token, extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function formatValue(value) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${formatDate(date)} • ${formatTime(date)}`;
}

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  return addDays(next, -day);
}

function startOfMonthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function sameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function eventDurationMinutes(event) {
  return Math.max(
    30,
    Math.round((new Date(event.end_at) - new Date(event.start_at)) / 60_000),
  );
}

function buildMonthDays(date) {
  const start = startOfMonthGrid(date);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function sortEvents(events) {
  return [...events].sort(
    (left, right) => new Date(left.start_at) - new Date(right.start_at),
  );
}

function normalizePayload(form) {
  const payload = { ...form };
  const numberFields = ["tenth_pct", "twelfth_pct", ...SEMESTER_FIELDS];
  payload.usn = payload.usn.trim().toUpperCase();
  payload.name = payload.name.trim();
  payload.program = (payload.program || "ECE").trim() || "ECE";
  payload.mobile = payload.mobile.trim() || null;
  payload.personal_email = payload.personal_email.trim() || null;
  payload.college_email = payload.college_email.trim() || null;
  payload.company_name = payload.placement_status
    ? payload.company_name.trim() || null
    : null;
  numberFields.forEach((field) => {
    payload[field] = payload[field] === "" ? null : Number(payload[field]);
  });
  payload.active_backlogs = Number(payload.active_backlogs || 0);
  return payload;
}

function normalizeEventPayload(form) {
  return {
    title: form.title.trim(),
    company_name: form.company_name.trim() || null,
    description: form.description.trim() || null,
    start_at: new Date(form.start_at).toISOString(),
    end_at: new Date(form.end_at).toISOString(),
  };
}

function validateEventForm(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = "Event title is required.";
  if (!form.start_at) errors.start_at = "Start date and time are required.";
  if (!form.end_at) errors.end_at = "End date and time are required.";
  const start = form.start_at ? new Date(form.start_at) : null;
  const end = form.end_at ? new Date(form.end_at) : null;
  if (start && Number.isNaN(start.getTime()))
    errors.start_at = "Enter a valid start date and time.";
  if (end && Number.isNaN(end.getTime()))
    errors.end_at = "Enter a valid end date and time.";
  if (
    start &&
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end <= start
  ) {
    errors.end_at = "End time must be after the start time.";
  }
  return errors;
}

function scopeSvg(sems) {
  const w = 560;
  const h = 180;
  const pad = 24;
  const vals = sems.map((value) => (value == null ? null : value));
  const known = vals.filter((value) => value != null);
  const minV = known.length ? Math.min(...known, 7.5) : 6;
  const maxV = known.length ? Math.max(...known, 9.5) : 10;
  const xStep = (w - pad * 2) / (sems.length - 1);
  const toY = (value) =>
    h - pad - ((value - minV) / (maxV - minV || 1)) * (h - pad * 2);
  let path = "";
  let dots = "";
  vals.forEach((value, index) => {
    if (value == null) return;
    const x = pad + index * xStep;
    const y = toY(value);
    path += `${path ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#3bd688"/><text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" font-size="10" fill="#c9793f" text-anchor="middle" font-family="IBM Plex Mono, monospace">${value}</text>`;
  });
  let grid = "";
  for (let index = 0; index <= 4; index += 1) {
    const y = pad + (index * (h - pad * 2)) / 4;
    grid += `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#1f4a3a" stroke-width="1"/>`;
  }
  const labels = SEMESTER_FIELDS.map((_, index) => `SEM ${index + 1}`);
  let labelText = "";
  sems.forEach((_, index) => {
    const x = pad + index * xStep;
    labelText += `<text x="${x.toFixed(1)}" y="${h - 6}" font-size="9" fill="#7d9186" text-anchor="middle" font-family="IBM Plex Mono, monospace">${labels[index]}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${grid}<path d="${path}" fill="none" stroke="#3bd688" stroke-width="2"/>${dots}${labelText}</svg>`;
}

function StudentModal({ mode, form, setForm, onClose, onSubmit, submitting }) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="section-head modal-head">
          <div>
            <div className="eyebrow">
              {mode === "create" ? "Create Student" : "Edit Student"}
            </div>
            <h2>
              {mode === "create"
                ? "Add student record"
                : "Update student record"}
            </h2>
          </div>
        </div>
        <div className="modal-grid">
          {[
            ["name", "Name", "text"],
            ["usn", "USN", "text"],
            ["program", "Program", "text"],
            ["mobile", "Mobile", "text"],
            ["personal_email", "Personal Email", "email"],
            ["college_email", "College Email", "email"],
            ["tenth_pct", "10th %", "number"],
            ["twelfth_pct", "12th %", "number"],
            ...SEMESTER_FIELDS.map((field, index) => [
              field,
              `Sem ${index + 1}`,
              "number",
            ]),
            ["active_backlogs", "Active Backlogs", "number"],
          ].map(([field, label, type]) => (
            <div className="field" key={field}>
              <label htmlFor={field}>{label}</label>
              <input
                id={field}
                type={type}
                step={type === "number" ? "0.01" : undefined}
                className={field === "usn" ? "mono" : ""}
                value={form[field]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="placement_status">Placement Status</label>
            <select
              id="placement_status"
              value={form.placement_status ? "placed" : "not-placed"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  placement_status: event.target.value === "placed",
                  company_name:
                    event.target.value === "placed" ? current.company_name : "",
                }))
              }
            >
              <option value="not-placed">Not Placed</option>
              <option value="placed">Placed</option>
            </select>
          </div>
          {form.placement_status ? (
            <div className="field">
              <label htmlFor="company_name">Company Name</label>
              <input
                id="company_name"
                type="text"
                value={form.company_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    company_name: event.target.value,
                  }))
                }
              />
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn modal-submit"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  copy,
  confirmLabel,
  onCancel,
  onConfirm,
  submitting,
  danger = false,
}) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card compact-modal">
        <div className="section-head modal-head">
          <div>
            <div className="eyebrow">Confirm Action</div>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="modal-copy mono">{copy}</p>
        <div className="modal-actions">
          <button type="button" className="btn ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? "danger-btn" : "modal-submit"}`}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventModal({
  form,
  errors,
  setForm,
  editing,
  onClose,
  onSubmit,
  submitting,
}) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="section-head modal-head">
          <div>
            <div className="eyebrow">
              {editing ? "Edit Event" : "Create Event"}
            </div>
            <h2>{editing ? "Update calendar event" : "Add calendar event"}</h2>
          </div>
        </div>
        <div className="modal-grid">
          <div className="field">
            <label htmlFor="event_title">Title</label>
            <input
              id="event_title"
              type="text"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
            {errors.title ? (
              <div className="field-error">{errors.title}</div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="event_company">Company Name</label>
            <input
              id="event_company"
              type="text"
              value={form.company_name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  company_name: event.target.value,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="event_start">Start</label>
            <input
              id="event_start"
              type="datetime-local"
              value={form.start_at}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  start_at: event.target.value,
                }))
              }
            />
            {errors.start_at ? (
              <div className="field-error">{errors.start_at}</div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="event_end">End</label>
            <input
              id="event_end"
              type="datetime-local"
              value={form.end_at}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  end_at: event.target.value,
                }))
              }
            />
            {errors.end_at ? (
              <div className="field-error">{errors.end_at}</div>
            ) : null}
          </div>
          <div className="field field-span-2">
            <label htmlFor="event_description">Description</label>
            <textarea
              id="event_description"
              rows="4"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn modal-submit"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventDetailsModal({ event, isAdmin, onClose, onEdit, onDelete }) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card compact-wide-modal">
        <div className="section-head modal-head">
          <div>
            <div className="eyebrow">Calendar Event</div>
            <h2>{event.title}</h2>
          </div>
          <span className="event-chip detail-chip">
            {event.company_name || "ECE Portal"}
          </span>
        </div>
        <div className="event-details">
          <div className="kv">
            <span>When</span>
            <span>
              {formatDateTimeLabel(event.start_at)} to{" "}
              {formatTime(new Date(event.end_at))}
            </span>
          </div>
          <div className="kv">
            <span>Company</span>
            <span>{formatValue(event.company_name)}</span>
          </div>
          <div className="kv">
            <span>Description</span>
            <span>{formatValue(event.description)}</span>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost-btn" onClick={onClose}>
            Close
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="btn ghost-btn"
              onClick={() => onEdit(event)}
            >
              Edit
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className="btn danger-btn"
              onClick={() => onDelete(event)}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DateEventsModal({
  date,
  events,
  isAdmin,
  onClose,
  onCreate,
  onOpenEvent,
}) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card compact-wide-modal">
        <div className="section-head modal-head">
          <div>
            <div className="eyebrow">
              {isAdmin ? "Manage Day" : "Scheduled Events"}
            </div>
            <h2>{formatDate(date)}</h2>
          </div>
        </div>
        <div className="date-events-list">
          {events.length ? (
            events.map((event) => (
              <button
                key={event.id}
                type="button"
                className="date-event-row"
                onClick={() => onOpenEvent(event)}
              >
                <span className="date-event-title">{event.title}</span>
                <span className="date-event-meta mono">
                  {formatTime(new Date(event.start_at))} -{" "}
                  {formatTime(new Date(event.end_at))}
                </span>
                {event.company_name ? (
                  <span className="date-event-meta mono">
                    {event.company_name}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="empty-state compact-empty">
              <h3>No events scheduled</h3>
              {isAdmin
                ? "Create a new event for this date."
                : "Nothing is scheduled for this day."}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost-btn" onClick={onClose}>
            Close
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="btn modal-submit"
              onClick={onCreate}
            >
              Add Event
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <div className="toast-title">
            {toast.kind === "success" ? "Success" : "Notice"}
          </div>
          <div className="toast-copy">{toast.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ActionDropdownPortal({
  anchorEl,
  student,
  onClose,
  onEdit,
  onDelete,
  onView,
}) {
  const dropdownRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!anchorEl || !student) return undefined;
    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const menuEl = dropdownRef.current;
      const menuWidth = menuEl?.offsetWidth ?? 180;
      const menuHeight = menuEl?.offsetHeight ?? 144;
      const viewportPadding = 10;
      const gap = 8;
      const spaceAbove = anchorRect.top - viewportPadding - gap;
      const spaceBelow =
        window.innerHeight - anchorRect.bottom - viewportPadding - gap;
      const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(
        openUpward ? spaceAbove : spaceBelow,
        120,
      );
      const resolvedHeight = Math.min(menuHeight, availableHeight);
      let top = openUpward
        ? anchorRect.top - resolvedHeight - gap
        : anchorRect.bottom + gap;
      let left = anchorRect.right - menuWidth;
      top = Math.max(
        viewportPadding,
        Math.min(top, window.innerHeight - resolvedHeight - viewportPadding),
      );
      left = Math.max(
        viewportPadding,
        Math.min(left, window.innerWidth - menuWidth - viewportPadding),
      );
      setPosition({
        left,
        maxHeight: availableHeight,
        top,
        transformOrigin: openUpward ? "bottom right" : "top right",
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorEl, student]);

  useEffect(() => {
    if (!anchorEl || !student) return undefined;
    const handlePointerDown = (event) => {
      const target = event.target;
      if (dropdownRef.current?.contains(target) || anchorEl.contains(target))
        return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl, student, onClose]);

  if (!anchorEl || !student) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className="action-dropdown action-dropdown-portal"
      role="menu"
      style={{
        left: position?.left ?? -9999,
        maxHeight: position?.maxHeight,
        top: position?.top ?? -9999,
        transformOrigin: position?.transformOrigin,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        className="action-item"
        onClick={() => {
          onEdit(student);
          onClose();
        }}
      >
        Edit Student
      </button>
      <button
        type="button"
        className="action-item"
        onClick={() => {
          onDelete(student);
          onClose();
        }}
      >
        Delete Student
      </button>
      <button
        type="button"
        className="action-item"
        onClick={() => {
          onView(student);
          onClose();
        }}
      >
        View Profile
      </button>
    </div>,
    document.body,
  );
}

function Sidebar({ auth, page, onNavigate }) {
  const navItems =
    auth?.role === "admin"
      ? [
          { key: "directory", label: "Directory" },
          ...(page === "profile" ? [{ key: "profile", label: "Profile" }] : []),
          { key: "calendar", label: "Calendar" },
        ]
      : [
          { key: "profile", label: "Profile" },
          { key: "calendar", label: "Calendar" },
        ];
  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="brand-eyebrow">Portal Pages</div>
        <div className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-link ${page === item.key ? "active" : ""}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CalendarPage({
  events,
  isAdmin,
  view,
  setView,
  selectedDate,
  setSelectedDate,
  search,
  setSearch,
  companyFilter,
  setCompanyFilter,
  onOpenEvent,
  onCreateEvent,
  onSelectDate,
  onMoveEvent,
  onResizeEvent,
}) {
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const companies = useMemo(
    () =>
      Array.from(
        new Set(events.map((event) => event.company_name).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [events],
  );
  const filteredEvents = useMemo(() => {
    return sortEvents(
      events.filter((event) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          [event.title, event.company_name, event.description]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(query));
        const matchesCompany =
          !companyFilter || event.company_name === companyFilter;
        return matchesSearch && matchesCompany;
      }),
    );
  }, [events, search, companyFilter]);
  const upcomingEvents = useMemo(
    () =>
      filteredEvents
        .filter((event) => new Date(event.end_at) >= new Date())
        .slice(0, 6),
    [filteredEvents],
  );
  const monthDays = useMemo(() => buildMonthDays(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(startOfWeek(selectedDate), index),
      ),
    [selectedDate],
  );
  const dayEvents = useMemo(
    () =>
      filteredEvents.filter((event) =>
        sameDay(new Date(event.start_at), selectedDate),
      ),
    [filteredEvents, selectedDate],
  );

  useEffect(() => {
    if (!resizeState) return undefined;
    const handlePointerMove = (event) => {
      const deltaPixels = resizeState.startY - event.clientY;
      const step = Math.round(-deltaPixels / 24) * 30;
      const nextEnd = new Date(resizeState.baseEnd);
      nextEnd.setMinutes(nextEnd.getMinutes() + step);
      const minimumEnd = new Date(resizeState.baseStart);
      minimumEnd.setMinutes(minimumEnd.getMinutes() + 30);
      if (nextEnd < minimumEnd) {
        setResizeState((current) => ({
          ...current,
          previewEnd: minimumEnd.toISOString(),
        }));
        return;
      }
      setResizeState((current) => ({
        ...current,
        previewEnd: nextEnd.toISOString(),
      }));
    };
    const handlePointerUp = () => {
      if (
        resizeState.previewEnd &&
        resizeState.previewEnd !== resizeState.initialEnd
      ) {
        onResizeEvent(resizeState.eventId, resizeState.previewEnd);
      }
      setResizeState(null);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onResizeEvent, resizeState]);

  function eventsForDay(day) {
    return filteredEvents.filter((event) =>
      sameDay(new Date(event.start_at), day),
    );
  }

  function navigate(amount) {
    if (view === "month") {
      setSelectedDate(
        new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth() + amount,
          1,
        ),
      );
      return;
    }
    if (view === "week") {
      setSelectedDate(addDays(selectedDate, amount * 7));
      return;
    }
    setSelectedDate(addDays(selectedDate, amount));
  }

  function dropEventOnDay(day) {
    if (!isAdmin || !draggedEventId) return;
    onMoveEvent(draggedEventId, day);
    setDraggedEventId(null);
  }

  function renderEventChip(event, compact = false) {
    const isResizing = resizeState?.eventId === event.id;
    const previewEnd = isResizing ? resizeState.previewEnd : event.end_at;
    return (
      <button
        key={event.id}
        type="button"
        className={`event-chip ${compact ? "compact" : ""}`}
        draggable={isAdmin}
        onDragStart={() => setDraggedEventId(event.id)}
        onDragEnd={() => setDraggedEventId(null)}
        onClick={(eventObject) => {
          eventObject.stopPropagation();
          onOpenEvent(event);
        }}
      >
        <span>{event.title}</span>
        <small>
          {formatTime(new Date(event.start_at))}
          {compact ? "" : ` - ${formatTime(new Date(previewEnd))}`}
        </small>
        {isAdmin && !compact ? (
          <span
            className="resize-handle"
            onPointerDown={(pointerEvent) => {
              pointerEvent.stopPropagation();
              setResizeState({
                eventId: event.id,
                startY: pointerEvent.clientY,
                baseStart: event.start_at,
                baseEnd: event.end_at,
                initialEnd: event.end_at,
                previewEnd: event.end_at,
              });
            }}
          />
        ) : null}
      </button>
    );
  }

  return (
    <div className="calendar-layout">
      <div className="calendar-stage">
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => navigate(-1)}
            >
              Prev
            </button>

            <div className="calendar-title display">
              {view === "month"
                ? new Intl.DateTimeFormat("en-IN", {
                    month: "long",
                    year: "numeric",
                  }).format(selectedDate)
                : formatDate(selectedDate)}
            </div>

            <button
              type="button"
              className="toolbar-btn"
              onClick={() => navigate(1)}
            >
              Next
            </button>
          </div>

          <div className="calendar-controls">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </button>

            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="month">Month View</option>
              <option value="week">Week View</option>
              <option value="day">Day View</option>
            </select>

            {isAdmin && (
              <button
                type="button"
                className="toolbar-btn"
                onClick={onCreateEvent}
              >
                Add Event
              </button>
            )}
          </div>
        </div>

        <div className="calendar-filters">
          <input
            type="text"
            placeholder="Search title, company, or description…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </div>

        {view === "month" ? (
          <div className="calendar-grid month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}
            {monthDays.map((day) => {
              const items = eventsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`calendar-cell ${day.getMonth() !== selectedDate.getMonth() ? "muted" : ""} ${sameDay(day, new Date()) ? "today" : ""}`}
                  onClick={() => {
                    setSelectedDate(day);
                    onSelectDate(day);
                  }}
                  onDragOver={(event) => {
                    if (isAdmin) event.preventDefault();
                  }}
                  onDrop={() => dropEventOnDay(day)}
                >
                  <div className="calendar-date">{day.getDate()}</div>
                  {/* <div className="calendar-dot-row">{items.slice(0, 4).map((event) => <span key={event.id} className="calendar-dot" />)}</div> : null*/}
                  <div className="calendar-events">
                    {items
                      .slice(0, 2)
                      .map((event) => renderEventChip(event, true))}

                    {items.length > 2 ? (
                      <div className="calendar-more mono">
                        +{items.length - 2} more
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {view === "week" ? (
          <div className="week-grid">
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className={`week-column ${sameDay(day, new Date()) ? "today" : ""}`}
                onDragOver={(event) => {
                  if (isAdmin) event.preventDefault();
                }}
                onDrop={() => dropEventOnDay(day)}
              >
                <button
                  type="button"
                  className="week-heading"
                  onClick={() => {
                    setSelectedDate(day);
                    onSelectDate(day);
                  }}
                >
                  <span>
                    {new Intl.DateTimeFormat("en-IN", {
                      weekday: "short",
                    }).format(day)}
                  </span>
                  <b>{day.getDate()}</b>
                </button>
                <div className="week-events">
                  {eventsForDay(day).length ? (
                    eventsForDay(day).map((event) => renderEventChip(event))
                  ) : (
                    <div className="week-empty mono">No events</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {view === "day" ? (
          <div className="day-view">
            <div className="day-header">
              <div>
                <div className="eyebrow">Selected Day</div>
                <h2>{formatDate(selectedDate)}</h2>
              </div>
            </div>
            <div
              className="day-events"
              onClick={() => onSelectDate(selectedDate)}
              onDragOver={(event) => {
                if (isAdmin) event.preventDefault();
              }}
              onDrop={() => dropEventOnDay(selectedDate)}
            >
              {dayEvents.length ? (
                dayEvents.map((event) => renderEventChip(event))
              ) : (
                <div className="empty-state">
                  <h3>No events scheduled</h3>Try another date or filter.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="calendar-sidepanel">
        <div className="card upcoming-card">
          <h3>Upcoming Events</h3>
          <div className="upcoming-list">
            {upcomingEvents.length ? (
              upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="upcoming-item"
                  onClick={() => onOpenEvent(event)}
                >
                  <span className="upcoming-title">{event.title}</span>
                  <span className="upcoming-meta mono">
                    {formatDateTimeLabel(event.start_at)}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-inline mono">No upcoming events</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState("student");
  const [loginError, setLoginError] = useState("");
  const [studentUsn, setStudentUsn] = useState("");
  const [studentMobile, setStudentMobile] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [auth, setAuth] = useState(null);
  const [page, setPage] = useState("directory");
  const [stats, setStats] = useState({
    total: 0,
    average_cgpa: 0,
    active_backlogs: 0,
    top_cgpa: 0,
    zero_backlog: 0,
    placed_students: 0,
    not_placed_students: 0,
  });
  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [backlogFilter, setBacklogFilter] = useState("all");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [sortState, setSortState] = useState({ key: "name", dir: "asc" });
  const [viewStudent, setViewStudent] = useState(null);
  const [openActionStudent, setOpenActionStudent] = useState(null);
  const [modalState, setModalState] = useState({ type: null, student: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [eventModal, setEventModal] = useState({ open: false, entry: null });
  const [eventForm, setEventForm] = useState(EMPTY_EVENT_FORM);
  const [eventFormErrors, setEventFormErrors] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState(null);
  const [calendarView, setCalendarView] = useState("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [eventSearch, setEventSearch] = useState("");
  const [eventCompanyFilter, setEventCompanyFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const [toasts, setToasts] = useState([]);
  const fileInputRef = useRef(null);
  const actionButtonRefs = useRef(new Map());

  function pushToast(kind, message) {
    const id = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/portal/stats`)
      .then((response) => response.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (auth?.role === "admin") {
      loadAdminData();
    }
  }, [auth, search, backlogFilter, placementFilter, sortState]);

  useEffect(() => {
    if (auth) loadEventData(auth.token);
  }, [auth]);

  useEffect(() => {
    if (!openActionStudent) return;
    if (
      viewStudent ||
      !students.some((student) => student.usn === openActionStudent.usn)
    ) {
      setOpenActionStudent(null);
    }
  }, [openActionStudent, students, viewStudent]);

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    if (!response.ok) {
      let message = "Something went wrong.";
      try {
        const payload = await response.json();
        if (Array.isArray(payload.detail)) {
          message = payload.detail
            .map((item) => item.msg || item.message || "Invalid input")
            .join(" ");
        } else {
          message = payload.detail || message;
        }
      } catch {
        message = response.statusText || message;
      }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return response.blob();
  }

  async function loadAdminData() {
    try {
      const query = new URLSearchParams({
        q: search,
        backlog_filter: backlogFilter,
        placement_filter: placementFilter,
        sort_key: sortState.key,
        sort_dir: sortState.dir,
      });
      const [statsData, studentsData] = await Promise.all([
        request("/students/stats", { headers: buildHeaders(auth.token) }),
        request(`/students?${query.toString()}`, {
          headers: buildHeaders(auth.token),
        }),
      ]);
      setStats(statsData);
      setStudents(studentsData);
    } catch (error) {
      setBanner(error.message);
    }
  }

  async function loadEventData(token) {
    try {
      const data = await request("/schedule", { headers: buildHeaders(token) });
      setEvents(data);
    } catch (error) {
      setBanner(error.message);
    }
  }

  async function handleLogin() {
    setLoginError("");
    setBusy(true);
    try {
      if (role === "admin") {
        const result = await request("/auth/admin", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ code: adminCode }),
        });
        setAuth(result);
        setPage("directory");
        setViewStudent(null);
      } else {
        const result = await request("/auth/student", {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ usn: studentUsn, mobile: studentMobile }),
        });
        setAuth(result);
        setViewStudent(result.student);
        setPage("profile");
      }
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setAuth(null);
    setStudentUsn("");
    setAdminCode("");
    setViewStudent(null);
    setStudents([]);
    setEvents([]);
    setPage("directory");
    setOpenActionStudent(null);
    setSelectedEvent(null);
    setSelectedDateEvents(null);
    setModalState({ type: null, student: null });
    setEventModal({ open: false, entry: null });
    setBanner("");
  }

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setModalState({ type: "create", student: null });
  }

  function openEditModal(student) {
    const next = { ...EMPTY_FORM };
    Object.keys(next).forEach((key) => {
      const value = student[key];
      next[key] =
        key === "placement_status"
          ? Boolean(value)
          : value === null || value === undefined
            ? ""
            : value;
    });
    setForm(next);
    setModalState({ type: "edit", student });
  }

  function openEventModal(entry = null, seedDate = null) {
    if (!entry) {
      const startDate = seedDate ? new Date(seedDate) : new Date();
      startDate.setHours(9, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
      setEventForm({
        ...EMPTY_EVENT_FORM,
        start_at: toInputDateTime(startDate.toISOString()),
        end_at: toInputDateTime(endDate.toISOString()),
      });
    } else {
      setEventForm({
        title: entry.title || "",
        company_name: entry.company_name || "",
        description: entry.description || "",
        start_at: toInputDateTime(entry.start_at),
        end_at: toInputDateTime(entry.end_at),
      });
    }
    setEventFormErrors({});
    setEventModal({ open: true, entry });
    setSelectedEvent(null);
    setSelectedDateEvents(null);
  }

  function openDateEvents(day) {
    const eventsOnDay = sortEvents(
      events.filter((event) => sameDay(new Date(event.start_at), day)),
    );
    setCalendarDate(day);
    setSelectedDateEvents({ date: day, events: eventsOnDay });
    setSelectedEvent(null);
  }

  async function saveStudent() {
    setBusy(true);
    setBanner("");
    try {
      const payload = normalizePayload(form);
      const method = modalState.type === "create" ? "POST" : "PUT";
      const endpoint =
        modalState.type === "create"
          ? "/students"
          : `/students/${modalState.student.usn}`;
      const saved = await request(endpoint, {
        method,
        headers: buildHeaders(auth.token),
        body: JSON.stringify(payload),
      });
      setModalState({ type: null, student: null });
      setViewStudent((current) =>
        current && current.usn === modalState.student?.usn ? saved : current,
      );
      await loadAdminData();
    } catch (error) {
      setBanner(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteStudent() {
    setBusy(true);
    setBanner("");
    try {
      await request(`/students/${modalState.student.usn}`, {
        method: "DELETE",
        headers: buildHeaders(auth.token),
      });
      if (viewStudent?.usn === modalState.student.usn) setViewStudent(null);
      setModalState({ type: null, student: null });
      await loadAdminData();
    } catch (error) {
      setBanner(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function viewProfile(student) {
    try {
      setOpenActionStudent(null);
      const fresh = await request(`/students/${student.usn}`, {
        headers: buildHeaders(auth.token),
      });
      setViewStudent(fresh);
      setPage("profile");
    } catch (error) {
      setBanner(error.message);
    }
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setBanner("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/students/import`, {
        method: "POST",
        headers: auth?.token
          ? { Authorization: `Bearer ${auth.token}` }
          : undefined,
        body,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || "Import failed.");
      }
      const result = await response.json();
      setBanner(
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.ignored} ignored.`,
      );
      pushToast("success", "Student import completed successfully.");
      await loadAdminData();
    } catch (error) {
      setBanner(error.message);
      pushToast("error", error.message);
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function handleExport(type) {
    try {
      const blob = await request(`/students/export/${type}`, {
        headers: buildHeaders(auth.token),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ece-placement-students.${type === "csv" ? "csv" : "xlsx"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBanner(error.message);
    }
  }

  async function saveEvent() {
    if (busy) return;
    const nextErrors = validateEventForm(eventForm);
    setEventFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      pushToast("error", "Please correct the event form before saving.");
      return;
    }
    setBusy(true);
    setBanner("");
    try {
      const payload = normalizeEventPayload(eventForm);
      const method = eventModal.entry ? "PUT" : "POST";
      const endpoint = eventModal.entry
        ? `/schedule/${eventModal.entry.id}`
        : "/schedule";
      const saved = await request(endpoint, {
        method,
        headers: buildHeaders(auth.token),
        body: JSON.stringify(payload),
      });
      await loadEventData(auth.token);
      const savedDate = new Date(saved.start_at);
      setCalendarDate(savedDate);
      setEventModal({ open: false, entry: null });
      setEventForm(EMPTY_EVENT_FORM);
      setSelectedDateEvents(null);
      pushToast(
        "success",
        eventModal.entry
          ? "Event updated successfully."
          : "Event created successfully.",
      );
    } catch (error) {
      setBanner(error.message);
      pushToast("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(entry) {
    setBusy(true);
    setBanner("");
    try {
      await request(`/schedule/${entry.id}`, {
        method: "DELETE",
        headers: buildHeaders(auth.token),
      });
      setSelectedEvent(null);
      await loadEventData(auth.token);
      setSelectedDateEvents(null);
      pushToast("success", "Event deleted successfully.");
    } catch (error) {
      setBanner(error.message);
      pushToast("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function moveEvent(eventId, targetDay) {
    const event = events.find((item) => item.id === eventId);
    if (!event) return;
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    const duration = end - start;
    const movedStart = new Date(targetDay);
    movedStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
    const movedEnd = new Date(movedStart.getTime() + duration);
    try {
      await request(`/schedule/${eventId}`, {
        method: "PUT",
        headers: buildHeaders(auth.token),
        body: JSON.stringify({
          start_at: movedStart.toISOString(),
          end_at: movedEnd.toISOString(),
        }),
      });
      await loadEventData(auth.token);
      pushToast("success", "Event rescheduled.");
    } catch (error) {
      setBanner(error.message);
      pushToast("error", error.message);
    }
  }

  async function resizeEvent(eventId, nextEnd) {
    try {
      await request(`/schedule/${eventId}`, {
        method: "PUT",
        headers: buildHeaders(auth.token),
        body: JSON.stringify({ end_at: nextEnd }),
      });
      await loadEventData(auth.token);
      pushToast("success", "Event duration updated.");
    } catch (error) {
      setBanner(error.message);
      pushToast("error", error.message);
    }
  }

  function handleSortChange(value) {
    const [key, dir] = value.split("-");
    setSortState({ key, dir });
  }

  const loginStats = useMemo(
    () => ({
      total: stats.total || "-",
      average: stats.average_cgpa ? stats.average_cgpa.toFixed(2) : "-",
      placed: stats.placed_students || 0,
    }),
    [stats],
  );
  const profile =
    auth?.role === "student" ? viewStudent || auth?.student : viewStudent;
  const openActionAnchor = openActionStudent
    ? (actionButtonRefs.current.get(openActionStudent.usn) ?? null)
    : null;
  const sortValue = `${sortState.key}-${sortState.dir}`;

  return (
    <div className="screen">
      {!auth ? (
        <div id="loginScreen">
          <div className="login-art">
            <svg
              viewBox="0 0 500 600"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3bd688" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#3bd688" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="#1f4a3a" strokeWidth="2" fill="none">
                <path d="M0 80 H120 V180 H260" />
                <path d="M0 240 H90 V320 H200 V400" />
                <path d="M500 60 H380 V160 H300" />
                <path d="M500 260 H420 V360 H320 V440" />
                <path d="M0 480 H140 V560" />
                <path d="M500 500 H360 V580" />
              </g>
              <g stroke="#3bd688" strokeWidth="2.5" fill="none" opacity="0.8">
                <path d="M120 180 H260 V240" />
                <path d="M300 160 H220 V240" />
              </g>
              <g fill="#3bd688">
                <circle cx="120" cy="180" r="4" />
                <circle cx="260" cy="240" r="4" />
                <circle cx="300" cy="160" r="4" />
                <circle cx="90" cy="320" r="4" />
              </g>
              <circle cx="260" cy="240" r="90" fill="url(#tg)" />
            </svg>
            <div className="brand-eyebrow">RVITM · ECE Dept</div>
            <h1 className="login-title display">Placement Cell Portal</h1>
            <p className="login-sub">
              Academic eligibility records, placement status tracking, and
              schedule intelligence for the ECE graduating batch.
            </p>
            <div className="login-stats">
              <div>
                <b className="mono">{loginStats.total}</b>
                <span>Students tracked</span>
              </div>
              <div>
                <b className="mono">{loginStats.average}</b>
                <span>Avg. CGPA</span>
              </div>
              <div>
                <b className="mono">{loginStats.placed}</b>
                <span>Placed students</span>
              </div>
            </div>
          </div>

          <div className="login-form-wrap">
            <div className="login-card">
              <div className="brand-eyebrow" style={{ marginBottom: 22 }}>
                Sign in
              </div>
              <div className="role-toggle">
                <button
                  type="button"
                  className={role === "student" ? "active" : ""}
                  onClick={() => setRole("student")}
                >
                  Student
                </button>
                <button
                  type="button"
                  className={role === "admin" ? "active" : ""}
                  onClick={() => setRole("admin")}
                >
                  Placement Cell
                </button>
              </div>

              {role === "student" ? (
                <div className="field">
                  <label htmlFor="stuUsn">USN</label>
                  <input
                    id="stuUsn"
                    type="text"
                    className="mono"
                    placeholder="1RF23EC0XX"
                    autoComplete="off"
                    value={studentUsn}
                    onChange={(event) => setStudentUsn(event.target.value)}
                  />
                </div>
              ) : null}
              {role === "student" ? (
                <div className="field">
                  <label htmlFor="stuMobile">Registered mobile number</label>
                  <input
                    id="stuMobile"
                    type="tel"
                    placeholder="10-digit mobile number"
                    autoComplete="off"
                    value={studentMobile}
                    onChange={(event) => setStudentMobile(event.target.value)}
                  />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="adminCode">Access code</label>
                  <input
                    id="adminCode"
                    type="password"
                    placeholder="Enter access code"
                    autoComplete="off"
                    value={adminCode}
                    onChange={(event) => setAdminCode(event.target.value)}
                  />
                </div>
              )}

              <button className="btn" onClick={handleLogin} disabled={busy}>
                {busy ? "Signing in..." : "Enter portal"}
              </button>
              <div className="login-error">{loginError}</div>
            </div>
          </div>
        </div>
      ) : (
        <div id="appScreen" className="active">
          <div className="topbar">
            <div className="topbar-brand">
              <span className="chip-dot"></span>
              <div>
                <b className="display">ECE Placement Portal</b>
                <br />
                <span>RVITM · 2023 Batch</span>
              </div>
            </div>
            <div className="topbar-right">
              <span className="role-pill mono">
                {auth.role === "admin" ? "PLACEMENT CELL" : "STUDENT"}
              </span>
              <button className="logout-btn" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>

          <div className="app-shell">
            <Sidebar
              auth={auth}
              page={page}
              onNavigate={(nextPage) => {
                setPage(nextPage);
                if (nextPage === "directory") setViewStudent(null);
              }}
            />

            <main className="main content-main">
              {banner ? <div className="banner mono">{banner}</div> : null}

              {auth.role === "admin" && page === "directory" && !viewStudent ? (
                <div id="adminDash">
                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="label">Total students</div>
                      <div className="value">{stats.total}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Average CGPA</div>
                      <div className="value">
                        {Number(stats.average_cgpa || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Active backlogs</div>
                      <div className="value">{stats.active_backlogs}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Top CGPA</div>
                      <div className="value">
                        {Number(stats.top_cgpa || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Placed students</div>
                      <div className="value">{stats.placed_students}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Not placed</div>
                      <div className="value">{stats.not_placed_students}</div>
                    </div>
                  </div>

                  <div className="section-head">
                    <div>
                      <div className="eyebrow">Directory</div>
                      <h2>Student records</h2>
                    </div>
                  </div>
                  <div className="toolbar toolbar-rich">
                    <input
                      type="text"
                      placeholder="Search by name, USN, or company…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <select
                      value={backlogFilter}
                      onChange={(event) => setBacklogFilter(event.target.value)}
                    >
                      <option value="all">All backlogs</option>
                      <option value="ok">No backlog</option>
                      <option value="warn">Active backlog</option>
                    </select>
                    <select
                      value={placementFilter}
                      onChange={(event) =>
                        setPlacementFilter(event.target.value)
                      }
                    >
                      <option value="all">All Students</option>
                      <option value="placed">Placed Students</option>
                      <option value="not-placed">Not Placed Students</option>
                    </select>
                    <select
                      value={sortValue}
                      onChange={(event) => handleSortChange(event.target.value)}
                    >
                      {STUDENT_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={openCreateModal}
                    >
                      Add Student
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      onClick={() => handleExport("csv")}
                    >
                      Export CSV
                    </button>
                  </div>

                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            ["name", "Name"],
                            ["usn", "USN"],
                            ["cgpa", "CGPA"],
                            ["tenth_pct", "10th %"],
                            ["twelfth_pct", "12th %"],
                            ["placement_status", "Placement Status"],
                            ["active_backlogs", "Backlog"],
                            ["mobile", "Mobile"],
                            ["personal_email", "Personal Email"],
                            ["college_email", "College Email"],
                          ].map(([key, label]) => (
                            <th
                              key={key}
                              onClick={() =>
                                setSortState((current) => ({
                                  key,
                                  dir:
                                    current.key === key && current.dir === "asc"
                                      ? "desc"
                                      : "asc",
                                }))
                              }
                            >
                              {label}
                            </th>
                          ))}
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.length ? (
                          students.map((student) => (
                            <tr
                              key={student.usn}
                              onClick={() => viewProfile(student)}
                            >
                              <td>{student.name}</td>
                              <td className="mono">{student.usn}</td>
                              <td className="cgpa-tag">
                                {formatValue(student.cgpa)}
                              </td>
                              <td className="mono">
                                {formatValue(student.tenth_pct)}
                              </td>
                              <td className="mono">
                                {formatValue(student.twelfth_pct)}
                              </td>
                              <td>
                                <div className="placement-cell">
                                  <span
                                    className={`badge ${student.placement_status ? "ok" : "neutral"}`}
                                  >
                                    {student.placement_status
                                      ? "Placed"
                                      : "Not Placed"}
                                  </span>
                                  {student.placement_status &&
                                  student.company_name ? (
                                    <span className="placement-company mono">
                                      {student.company_name}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                {student.active_backlogs > 0 ? (
                                  <span className="badge warn">
                                    {student.active_backlogs} active
                                  </span>
                                ) : (
                                  <span className="badge ok">Clear</span>
                                )}
                              </td>
                              <td className="mono">
                                {formatValue(student.mobile)}
                              </td>
                              <td className="mono">
                                {formatValue(student.personal_email)}
                              </td>
                              <td className="mono">
                                {formatValue(student.college_email)}
                              </td>
                              <td onClick={(event) => event.stopPropagation()}>
                                <div className="action-menu">
                                  <button
                                    type="button"
                                    className="action-trigger"
                                    aria-expanded={
                                      openActionStudent?.usn === student.usn
                                    }
                                    ref={(node) => {
                                      if (node)
                                        actionButtonRefs.current.set(
                                          student.usn,
                                          node,
                                        );
                                      else
                                        actionButtonRefs.current.delete(
                                          student.usn,
                                        );
                                    }}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenActionStudent((current) =>
                                        current?.usn === student.usn
                                          ? null
                                          : student,
                                      );
                                    }}
                                  >
                                    Actions ▼
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="11">
                              <div className="empty-state">
                                <h3>No matching records</h3>
                                Try a different search or filter.
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {profile && page === "profile" ? (
                <div id="profileView" className="active">
                  {auth.role === "admin" ? (
                    <button
                      className="back-link"
                      onClick={() => {
                        setViewStudent(null);
                        setPage("directory");
                      }}
                    >
                      &larr; Back to directory
                    </button>
                  ) : null}
                  <div className="profile-header">
                    <div>
                      <h1>{profile.name}</h1>
                      <span className="usn">
                        {profile.usn} · {profile.program}
                      </span>
                    </div>
                    <div className="profile-badges">
                      <span
                        className={`badge ${profile.placement_status ? "ok" : "neutral"}`}
                      >
                        {profile.placement_status ? "Placed" : "Not Placed"}
                      </span>
                      {profile.active_backlogs > 0 ? (
                        <span className="badge warn">
                          {profile.active_backlogs} active backlog(s)
                        </span>
                      ) : (
                        <span className="badge ok">No active backlog</span>
                      )}
                    </div>
                  </div>
                  <div className="profile-grid">
                    <div className="card">
                      <h3>SGPA trend</h3>
                      <div
                        className="scope-wrap"
                        dangerouslySetInnerHTML={{
                          __html: scopeSvg(
                            SEMESTER_FIELDS.map((field) => profile[field]),
                          ),
                        }}
                      />
                    </div>
                    <div className="card">
                      <h3>Academic summary</h3>
                      <div className="kv">
                        <span>Cumulative CGPA</span>
                        <span>{formatValue(profile.cgpa)}</span>
                      </div>
                      <div className="kv">
                        <span>10th percentage</span>
                        <span>{formatValue(profile.tenth_pct)}</span>
                      </div>
                      <div className="kv">
                        <span>12th percentage</span>
                        <span>{formatValue(profile.twelfth_pct)}</span>
                      </div>
                      <div className="kv">
                        <span>Placement status</span>
                        <span>
                          {profile.placement_status ? "Placed" : "Not placed"}
                        </span>
                      </div>
                      <div className="kv">
                        <span>Company</span>
                        <span>{formatValue(profile.company_name)}</span>
                      </div>
                      <div className="kv">
                        <span>Active backlogs</span>
                        <span>{profile.active_backlogs}</span>
                      </div>
                    </div>
                    <div className="card">
                      <h3>Contact</h3>
                      <div className="kv">
                        <span>Mobile</span>
                        <span>{formatValue(profile.mobile)}</span>
                      </div>
                      <div className="kv">
                        <span>Personal email</span>
                        <span>{formatValue(profile.personal_email)}</span>
                      </div>
                      <div className="kv">
                        <span>College email</span>
                        <span>{formatValue(profile.college_email)}</span>
                      </div>
                    </div>
                    <div className="card">
                      <h3>Semester-wise SGPA</h3>
                      {SEMESTER_FIELDS.map((field, index) => (
                        <div className="kv" key={field}>
                          <span>Sem {index + 1}</span>
                          <span>{formatValue(profile[field])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {page === "calendar" ? (
                <div className="calendar-page">
                  <div className="section-head">
                    <div>
                      <div className="eyebrow">Calendar</div>
                      <h2>Placement calendar</h2>
                    </div>
                  </div>
                  <CalendarPage
                    events={events}
                    isAdmin={auth.role === "admin"}
                    view={calendarView}
                    setView={setCalendarView}
                    selectedDate={calendarDate}
                    setSelectedDate={setCalendarDate}
                    search={eventSearch}
                    setSearch={setEventSearch}
                    companyFilter={eventCompanyFilter}
                    setCompanyFilter={setEventCompanyFilter}
                    onOpenEvent={setSelectedEvent}
                    onCreateEvent={() => openEventModal(null, calendarDate)}
                    onSelectDate={openDateEvents}
                    onMoveEvent={moveEvent}
                    onResizeEvent={resizeEvent}
                  />
                </div>
              ) : null}
            </main>
          </div>

          <footer className="foot">
            RVITM ECE Placement Cell · internal eligibility and event records
          </footer>
        </div>
      )}

      {modalState.type === "create" || modalState.type === "edit" ? (
        <StudentModal
          mode={modalState.type}
          form={form}
          setForm={setForm}
          onClose={() => setModalState({ type: null, student: null })}
          onSubmit={saveStudent}
          submitting={busy}
        />
      ) : null}
      {modalState.type === "delete" ? (
        <ConfirmModal
          title="Remove this student record?"
          copy={`${modalState.student?.name} • ${modalState.student?.usn}`}
          confirmLabel="Delete Student"
          danger
          onCancel={() => setModalState({ type: null, student: null })}
          onConfirm={confirmDeleteStudent}
          submitting={busy}
        />
      ) : null}
      {eventModal.open ? (
        <EventModal
          form={eventForm}
          errors={eventFormErrors}
          setForm={setEventForm}
          editing={Boolean(eventModal.entry)}
          onClose={() => setEventModal({ open: false, entry: null })}
          onSubmit={saveEvent}
          submitting={busy}
        />
      ) : null}
      {selectedEvent ? (
        <EventDetailsModal
          event={selectedEvent}
          isAdmin={auth?.role === "admin"}
          onClose={() => setSelectedEvent(null)}
          onEdit={(event) => openEventModal(event)}
          onDelete={(event) => {
            setSelectedEvent(null);
            setModalState({ type: "delete-event", student: event });
          }}
        />
      ) : null}
      {selectedDateEvents ? (
        <DateEventsModal
          date={selectedDateEvents.date}
          events={selectedDateEvents.events}
          isAdmin={auth?.role === "admin"}
          onClose={() => setSelectedDateEvents(null)}
          onCreate={() => openEventModal(null, selectedDateEvents.date)}
          onOpenEvent={(event) => {
            setSelectedDateEvents(null);
            if (auth?.role === "admin") {
              openEventModal(event);
            } else {
              setSelectedEvent(event);
            }
          }}
        />
      ) : null}
      {modalState.type === "delete-event" ? (
        <ConfirmModal
          title="Remove this calendar event?"
          copy={`${modalState.student?.title} • ${formatDateTimeLabel(modalState.student?.start_at)}`}
          confirmLabel="Delete Event"
          danger
          onCancel={() => setModalState({ type: null, student: null })}
          onConfirm={async () => {
            await deleteEvent(modalState.student);
            setModalState({ type: null, student: null });
          }}
          submitting={busy}
        />
      ) : null}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ActionDropdownPortal
        anchorEl={openActionAnchor}
        student={openActionStudent}
        onClose={() => setOpenActionStudent(null)}
        onDelete={(student) => setModalState({ type: "delete", student })}
        onEdit={openEditModal}
        onView={viewProfile}
      />
    </div>
  );
}
