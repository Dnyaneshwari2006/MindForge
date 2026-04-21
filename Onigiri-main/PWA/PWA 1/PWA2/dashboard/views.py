"""
Admin dashboard views — staff only.
"""

from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import render, get_object_or_404

from core.models import FocusSession


@staff_member_required
def session_list(request):
    active_sessions = FocusSession.objects.filter(is_active=True).order_by('-started_at')
    recent_sessions = FocusSession.objects.filter(is_active=False).order_by('-ended_at')[:10]
    return render(request, 'dashboard/session_list.html', {
        'active_sessions': active_sessions,
        'recent_sessions': recent_sessions,
    })


@staff_member_required
def session_detail(request, session_id):
    session = get_object_or_404(FocusSession, session_id=session_id)
    return render(request, 'dashboard/session_detail.html', {'session': session})
