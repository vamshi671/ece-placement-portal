# ECE Placement Portal

Production-ready conversion of the original single-file ECE Placement Portal into:

- `frontend/`: React + Vite app that preserves the existing UI styling and layout
- `backend/`: FastAPI + SQLAlchemy API with SQLite development storage and PostgreSQL-compatible models

## Backend

1. Create a virtual environment and install dependencies:
   `pip install -r backend/requirements.txt`
2. Copy `backend/.env.example` values into your environment.
3. Start the API:
   `uvicorn backend.app.main:app --reload`

## Frontend

1. Install dependencies:
   `npm install`
2. Start Vite:
   `npm run dev`

Set `VITE_API_BASE_URL` if your API is not running on `http://127.0.0.1:8000`.

## Notes

- The backend seeds the database from the existing `ece-placement-portal.html` student dataset on first startup.
- Admin authentication uses the backend `ADMIN_ACCESS_CODE` environment variable and is never rendered in the UI.
- CGPA is recalculated server-side on create, update, and Excel import.
