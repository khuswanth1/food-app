from sqlalchemy.orm import Session

from app.models import AuditLog, Notification
from app.services.realtime import hub


def notify(db: Session, user_id: int, title: str, body: str, kind: str = "info", link: str | None = None) -> None:
    """Persist an in-app notification and push it live. Caller commits."""
    n = Notification(user_id=user_id, title=title, body=body, kind=kind, link=link)
    db.add(n)
    db.flush()
    hub.publish(f"user:{user_id}", {
        "type": "notification",
        "data": {"id": n.id, "title": title, "body": body, "kind": kind, "link": link, "is_read": False},
    })


def audit(db: Session, actor_id: int | None, action: str, entity: str,
          entity_id: int | None = None, details: dict | None = None) -> None:
    """Record an audit log row. Caller commits."""
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity, entity_id=entity_id, details=details))
