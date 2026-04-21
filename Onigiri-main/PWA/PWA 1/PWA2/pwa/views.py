"""
PWA views — serve the single-file PWA and its manifest/service worker.
"""

from django.shortcuts import render
from django.views.decorators.cache import never_cache


@never_cache
def index(request):
    """Main PWA entry point — served at /join"""
    return render(request, 'pwa/index.html')


@never_cache
def start(request):
    """Desktop session-start page with QR code generator — served at /start"""
    return render(request, 'pwa/start.html')


def manifest(request):
    return render(request, 'pwa/manifest.json', content_type='application/manifest+json')


def service_worker(request):
    return render(request, 'pwa/sw.js', content_type='application/javascript')


