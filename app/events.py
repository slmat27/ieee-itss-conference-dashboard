from __future__ import annotations

import asyncio
import contextlib
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from .storage import RunRecord

NotificationLevel = Literal["info", "success", "warning", "error"]


@dataclass(frozen=True, slots=True)
class AppNotification:
    id: str
    type: str
    level: NotificationLevel
    title: str
    message: str
    created_at: str
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "level": self.level,
            "title": self.title,
            "message": self.message,
            "created_at": self.created_at,
            "payload": self.payload,
        }


@dataclass(frozen=True, slots=True)
class _Subscriber:
    owner_key: str
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[AppNotification]


class EventSubscription:
    def __init__(
        self,
        *,
        bus: RunEventBus,
        subscriber_id: int,
        queue: asyncio.Queue[AppNotification],
    ) -> None:
        self._bus = bus
        self._subscriber_id = subscriber_id
        self._queue = queue

    async def next_event(self) -> AppNotification:
        return await self._queue.get()

    def close(self) -> None:
        self._bus.unsubscribe(self._subscriber_id)


class RunEventBus:
    """Owner-scoped, in-process run notifications for the POC template.

    CREATOR_AGENT_CONTRACT: Websocket events are lightweight invalidation
    messages. Keep durable run state in RunStore and reload details over REST.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._next_subscriber_id = 1
        self._subscribers: dict[int, _Subscriber] = {}

    def subscribe(self, owner_key: str) -> EventSubscription:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[AppNotification] = asyncio.Queue(maxsize=100)
        with self._lock:
            subscriber_id = self._next_subscriber_id
            self._next_subscriber_id += 1
            self._subscribers[subscriber_id] = _Subscriber(
                owner_key=owner_key,
                loop=loop,
                queue=queue,
            )
        return EventSubscription(
            bus=self,
            subscriber_id=subscriber_id,
            queue=queue,
        )

    def unsubscribe(self, subscriber_id: int) -> None:
        with self._lock:
            self._subscribers.pop(subscriber_id, None)

    def publish(self, owner_key: str, event: AppNotification) -> None:
        with self._lock:
            subscribers = [
                subscriber
                for subscriber in self._subscribers.values()
                if subscriber.owner_key == owner_key
            ]

        for subscriber in subscribers:
            subscriber.loop.call_soon_threadsafe(
                _put_notification,
                subscriber.queue,
                event,
            )


def run_event(record: RunRecord, event_name: str) -> AppNotification:
    event_type = f"run.{event_name}"
    return AppNotification(
        id=f"{event_type}-{record.run_id}-{record.updated_at}",
        type=event_type,
        level=_level_for_state(record.state),
        title=record.title,
        message=record.status_message or f"Run is {_state_label(record.state)}.",
        created_at=record.updated_at,
        payload={
            "run_id": record.run_id,
            "state": record.state,
            "status_message": record.status_message,
        },
    )


def run_deleted_event(record: RunRecord) -> AppNotification:
    created_at = _now()
    return AppNotification(
        id=f"run.deleted-{record.run_id}-{created_at}",
        type="run.deleted",
        level="info",
        title=record.title,
        message="Run was deleted.",
        created_at=created_at,
        payload={"run_id": record.run_id, "state": "deleted"},
    )


def heartbeat_event() -> AppNotification:
    created_at = _now()
    return AppNotification(
        id=f"connection.heartbeat-{created_at}",
        type="connection.heartbeat",
        level="info",
        title="Connection heartbeat",
        message="Notification stream is active.",
        created_at=created_at,
        payload={},
    )


def _put_notification(
    queue: asyncio.Queue[AppNotification],
    event: AppNotification,
) -> None:
    try:
        queue.put_nowait(event)
        return
    except asyncio.QueueFull:
        pass

    with contextlib.suppress(asyncio.QueueEmpty):
        queue.get_nowait()
    with contextlib.suppress(asyncio.QueueFull):
        queue.put_nowait(event)


def _level_for_state(state: str) -> NotificationLevel:
    if state == "completed":
        return "success"
    if state == "failed":
        return "error"
    return "info"


def _state_label(state: str) -> str:
    if state == "queued":
        return "queued"
    if state == "running":
        return "running"
    if state == "failed":
        return "failed"
    return "completed"


def _now() -> str:
    return datetime.now(UTC).isoformat()
