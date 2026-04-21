import random
import string
import socket
from datetime import datetime, timezone

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

ACTIVE_SESSIONS = set()
DEMO_SESSION_ID = 'DEMO'
ACTIVE_SESSIONS.add(DEMO_SESSION_ID)

def _generate_session_id():
    chars = string.ascii_uppercase + string.digits
    while True:
        sid = ''.join(random.choices(chars, k=6))
        if sid not in ACTIVE_SESSIONS:
            ACTIVE_SESSIONS.add(sid)
            return sid

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

@api_view(['POST'])
def create_session(request):
    session_id = _generate_session_id()

    lan_ip = get_local_ip()
    host = f"{lan_ip}:8000"
    scheme = 'wss' if request.is_secure() else 'ws'
    http_scheme = 'https' if request.is_secure() else 'http'
    desktop_ws = f"{scheme}://{request.get_host()}/ws/session/{session_id}/"

    return Response({
        'session_id': session_id,
        'ws_url': desktop_ws,
        'pwa_url': f'{http_scheme}://{host}/join?session={session_id}',
    }, status=201)

@api_view(['GET'])
def session_status(request, session_id):
    if session_id not in ACTIVE_SESSIONS and session_id != DEMO_SESSION_ID:
        return Response({'error': 'Session not found.'}, status=404)
    return Response({'is_active': True})

@api_view(['POST'])
def end_session(request, session_id):
    if session_id in ACTIVE_SESSIONS and session_id != DEMO_SESSION_ID:
        ACTIVE_SESSIONS.remove(session_id)
    return Response({'session_id': session_id, 'status': 'ended'})

@api_view(['POST'])
def mobile_signal_fallback(request, session_id):
    return Response({'status': 'ignored'}, status=201)

@api_view(['GET'])
def live_state(request, session_id):
    return Response({'session_id': session_id, 'is_active': session_id in ACTIVE_SESSIONS})
