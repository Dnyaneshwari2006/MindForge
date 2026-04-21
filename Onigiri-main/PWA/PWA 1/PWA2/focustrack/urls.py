"""
Root URL configuration for focustrack project.
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('dashboard/', include('dashboard.urls')),
    path('', include('pwa.urls')),
]
