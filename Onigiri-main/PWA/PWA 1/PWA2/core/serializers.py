"""
REST API serializers for FocusTrack core models.
"""

from rest_framework import serializers
from core.models import FocusSession, MobileSignal, DesktopSignal, FocusScoreSnapshot, DistractionEvent


class FocusSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusSession
        fields = [
            'session_id', 'topic', 'duration_minutes', 'sensitivity',
            'started_at', 'ended_at', 'is_active',
            'desktop_connected', 'mobile_connected',
            'desktop_connected_at', 'mobile_connected_at',
            'focus_score', 'focused_minutes', 'distracted_minutes',
        ]
        read_only_fields = fields


class MobileSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MobileSignal
        fields = ['signal_type', 'timestamp', 'magnitude', 'duration_ms', 'raw_data']


class DesktopSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DesktopSignal
        fields = ['signal_type', 'url', 'page_title', 'window_title',
                  'topic_relevance_score', 'timestamp', 'raw_data']


class FocusScoreSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = FocusScoreSnapshot
        fields = ['score', 'timestamp', 'contributing_signals', 'verdict']


class DistractionEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DistractionEvent
        fields = [
            'started_at', 'ended_at', 'distraction_type', 'description',
            'severity', 'score_impact', 'was_forgiven',
        ]
