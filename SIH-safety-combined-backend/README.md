# SIH Safety - Combined Backend

This backend combines:

- MongoDB (`authDemo`) for users, registration, login and profiles.
- PostgreSQL (`sih_safety`) for safety incidents.
- One Express server on port 8080.
- JWT authentication shared by authentication and protected incident routes.

## Structure

```text
SIH-safety-combined-backend/
├── server.js
├── package.json
├── .env.example
├── config/
│   └── database.js
├── controllers/
│   ├── authControllers.js
│   ├── incidentController.js
│   └── incidentContoller.js
├── middleware/
│   ├── authMiddleware.js
│   └── errorMiddleware.js
├── models/
│   ├── user.js
│   └── incident.js
├── routes/
│   ├── authRoutes.js
│   ├── userRouter.js
│   └── incidentRoutes.js
├── services/
│   └── incidentService.js
├── validators/
│   └── incidentValidators.js
├── utils/
│   └── tokenUtils.js
├── scripts/
│   └── migrate-user-id-to-text.sql
└── tests/
    └── incident.test.js
```

## Setup

1. Copy `.env.example` to `.env`.
2. Set the PostgreSQL password.
3. Make sure MongoDB is running.
4. Make sure PostgreSQL is running and `sih_safety` exists.
5. If the existing incidents table has `user_id INTEGER`, run `scripts/migrate-user-id-to-text.sql`.
6. Run:

```bash
npm install
npm start
```

## Main endpoints

Authentication:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users/profile`
- `PUT /api/users/profile`

Incidents:
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `GET /api/incidents/nearby`
- `POST /api/incidents`
- `PUT /api/incidents/:id` (JWT)
- `PATCH /api/incidents/:id/status` (JWT)
- `DELETE /api/incidents/:id` (JWT)

Protected test:
- `GET /api/protected`

## Important

MongoDB and PostgreSQL remain separate databases. Express is the single API server connecting to both.
