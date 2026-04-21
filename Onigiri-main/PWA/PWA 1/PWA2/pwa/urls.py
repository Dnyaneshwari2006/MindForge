"""
PWA URL configuration.
"""

from django.urls import path
from pwa import views

urlpatterns = [
    path('', views.start, name='pwa_start'),       # root → desktop start page
    path('start', views.start, name='pwa_start_explicit'),
    path('join', views.index, name='pwa_index'),
    path('manifest.json', views.manifest, name='pwa_manifest'),
    path('sw.js', views.service_worker, name='pwa_sw'),
]

