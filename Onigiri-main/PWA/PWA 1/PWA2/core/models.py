"""
FocusTrack core models.
"""

from django.db import models
import uuid


class FocusSession(models.Model):
    SENSITIVITY_CHOICES = [
        ('strict', 'Strict'),
        ('balanced', 'Balanced'),
        ('relaxed', 'Relaxed'),
    ]

    session_id = models.CharField(max_length=6, unique=True, db_index=True)
    topic = models.CharField(max_length=255)
    duration_minutes = models.PositiveIntegerField()
    sensitivity = models.CharField(max_length=10, choices=SENSITIVITY_CHOICES, default='balanced')

    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    desktop_connected = models.BooleanField(default=False)
    mobile_connected = models.BooleanField(default=False)
    desktop_connected_at = models.DateTimeField(null=True, blank=True)
    mobile_connected_at = models.DateTimeField(null=True, blank=True)

    focus_score = models.FloatField(null=True, blank=True)
    focused_minutes = models.FloatField(default=0.0)
    distracted_minutes = models.FloatField(default=0.0)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Session {self.session_id} — {self.topic}"


class MobileSignal(models.Model):
    SIGNAL_TYPES = [
        ('phone_picked_up', 'Phone Picked Up'),
        ('phone_put_down', 'Phone Put Down'),
        ('pwa_backgrounded', 'PWA Backgrounded'),
        ('pwa_foregrounded', 'PWA Foregrounded'),
        ('pwa_resumed', 'PWA Resumed'),
        ('screen_on', 'Screen On'),
        ('screen_off', 'Screen Off'),
        ('motion_detected', 'Motion Detected'),
        ('still', 'Still'),
        ('heartbeat', 'Heartbeat'),
        ('session_joined', 'Session Joined'),
        ('session_left', 'Session Left'),
    ]

    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='mobile_signals')
    signal_type = models.CharField(max_length=30, choices=SIGNAL_TYPES)
    timestamp = models.DateTimeField()
    magnitude = models.FloatField(null=True, blank=True)       # for motion events
    duration_ms = models.IntegerField(null=True, blank=True)   # for backgrounded events
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.signal_type} @ {self.timestamp}"


class DesktopSignal(models.Model):
    SIGNAL_TYPES = [
        ('tab_active', 'Tab Active'),
        ('tab_idle', 'Tab Idle'),
        ('keystroke_active', 'Keystroke Active'),
        ('keystroke_idle', 'Keystroke Idle'),
        ('window_changed', 'Window Changed'),
        ('intent_study', 'Intent Study'),
        ('intent_distraction', 'Intent Distraction'),
        ('presence_detected', 'Presence Detected'),
        ('presence_absent', 'Presence Absent'),
        ('heartbeat', 'Heartbeat'),
        ('session_start', 'Session Start'),
    ]

    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='desktop_signals')
    signal_type = models.CharField(max_length=30, choices=SIGNAL_TYPES)
    url = models.URLField(max_length=2048, blank=True, default='')
    page_title = models.CharField(max_length=512, blank=True, default='')
    window_title = models.CharField(max_length=512, blank=True, default='')
    topic_relevance_score = models.FloatField(default=0.5)
    timestamp = models.DateTimeField()
    raw_data = models.JSONField(default=dict)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.signal_type} @ {self.timestamp}"


class FocusScoreSnapshot(models.Model):
    VERDICT_CHOICES = [
        ('focused', 'Focused'),
        ('mild_distraction', 'Mild Distraction'),
        ('distracted', 'Distracted'),
        ('phone_use_detected', 'Phone Use Detected'),
        ('idle_break', 'Idle Break'),
        ('unknown', 'Unknown'),
    ]

    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='score_snapshots')
    score = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)
    contributing_signals = models.JSONField(default=dict)
    verdict = models.CharField(max_length=25, choices=VERDICT_CHOICES, default='unknown')

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Score {self.score:.1f} ({self.verdict}) @ {self.timestamp}"


class DistractionEvent(models.Model):
    TYPE_CHOICES = [
        ('off_topic_tab', 'Off-Topic Tab'),
        ('phone_use', 'Phone Use'),
        ('quick_phone_check', 'Quick Phone Check'),
        ('inactivity', 'Inactivity'),
        ('game_detected', 'Game Detected'),
        ('incognito_window', 'Incognito Window'),
    ]
    SEVERITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    session = models.ForeignKey(FocusSession, on_delete=models.CASCADE, related_name='distraction_events')
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    distraction_type = models.CharField(max_length=25, choices=TYPE_CHOICES)
    description = models.TextField(blank=True, default='')
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='medium')
    score_impact = models.FloatField(default=0.0)
    was_forgiven = models.BooleanField(default=False)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.distraction_type} ({self.severity}) @ {self.started_at}"
