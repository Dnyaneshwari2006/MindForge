"""
Dashboard URL configuration.
"""

from django.urls import path
from dashboard import views

urlpatterns = [
    path('', views.session_list, name='dashboard_session_list'),
    path('session/<str:session_id>/', views.session_detail, name='dashboard_session_detail'),
]
