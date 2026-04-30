"""
SmartFlow MVP Server Package

This package contains the core backend logic for the SmartFlow water 
dispensing system. It is built using FastAPI and SQLAlchemy, providing 
a robust, asynchronous API for managing multi-tenant filtration plants, 
virtual wallet transactions, and IoT device coordination via AWS IoT Core.

Package Structure:
- auth: Security, JWT, and RBAC logic.
- models / schemas: Database entities and API validation models.
- routes_*: Role-specific endpoint definitions.
- seed: Database initialization and demo data orchestration.
- services (*_service, wallet, mqtt, runtime): Core business logic and integrations.
"""
