"""
ASGI config for focustrack project.
Uses Django Channels ProtocolTypeRouter to handle both HTTP and WebSocket.
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'focustrack.settings')

# Initialize Django ASGI app early so AppRegistry is populated
django_asgi_app = get_asgi_application()

from focustrack.routing import websocket_urlpatterns  # noqa: E402 — must come after app init

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
