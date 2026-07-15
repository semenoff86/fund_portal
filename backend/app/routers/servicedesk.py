"""Service desk request endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ServiceRequest, User
from app.schemas import ServiceRequestCreate, ServiceRequestResponse

router = APIRouter(prefix="/api/requests", tags=["servicedesk"])


@router.post("", response_model=ServiceRequestResponse, status_code=201)
def create_request(
    payload: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    request = ServiceRequest(
        user_id=current_user.id,
        request_type=payload.request_type,
        description=payload.description,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/my", response_model=list[ServiceRequestResponse])
def get_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requests = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.user_id == current_user.id)
        .order_by(ServiceRequest.created_at.desc())
        .all()
    )
    return requests
