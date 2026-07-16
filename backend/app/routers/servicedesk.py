"""Service desk request endpoints — ticketing (create + status tracking)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import RequestStatus, ServiceRequest, User
from app.schemas import (
    ServiceRequestCreate,
    ServiceRequestResponse,
    ServiceRequestStatusUpdate,
)

router = APIRouter(prefix="/api/requests", tags=["servicedesk"])


@router.post("", response_model=ServiceRequestResponse, status_code=201)
def create_request(
    payload: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an IT / Admin / HR service ticket."""
    request = ServiceRequest(
        user_id=current_user.id,
        request_type=payload.request_type,
        description=payload.description,
        status=RequestStatus.PENDING,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("", response_model=list[ServiceRequestResponse])
def list_my_requests(
    status_filter: RequestStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the current user's tickets (optional status filter)."""
    query = db.query(ServiceRequest).filter(ServiceRequest.user_id == current_user.id)
    if status_filter is not None:
        query = query.filter(ServiceRequest.status == status_filter)
    return query.order_by(ServiceRequest.created_at.desc()).all()


@router.get("/my", response_model=list[ServiceRequestResponse])
def get_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alias for GET /api/requests (kept for backward compatibility)."""
    return list_my_requests(status_filter=None, db=db, current_user=current_user)


@router.get("/{request_id}", response_model=ServiceRequestResponse)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import UserRole

    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")
    if req.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")
    return req


@router.patch("/{request_id}/status", response_model=ServiceRequestResponse)
def update_request_status(
    request_id: int,
    payload: ServiceRequestStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: update ticket status (PENDING → IN_PROGRESS → COMPLETED / REJECTED)."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")
    req.status = payload.status
    db.commit()
    db.refresh(req)
    return req
