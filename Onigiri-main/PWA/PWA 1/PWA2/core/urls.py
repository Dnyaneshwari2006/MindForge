"""
URL configuration for core REST API.
"""

from django.urls import path
from core import views

urlpatterns = [
    path('sessions/create/', views.create_session, name='create_session'),
    path('sessions/<str:session_id>/status/', views.session_status, name='session_status'),
    path('sessions/<str:session_id>/end/', views.end_session, name='end_session'),
    path('sessions/<str:session_id>/mobile-signal/', views.mobile_signal_fallback, name='mobile_signal_fallback'),
    path('sessions/<str:session_id>/live-state/', views.live_state, name='live_state'),
]
