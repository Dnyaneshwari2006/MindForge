"""
Signals Processor — pure Python, no Django views.
Imported and used by the WebSocket consumer.
"""

from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional


# ---------------------------------------------------------------------------
# Sensitivity configuration
# ---------------------------------------------------------------------------

SENSITIVITY_CONFIG = {
    'strict': {
        'grace_period_sec': 30,
        'phone_forgiveness_sec': 15,
        'inactivity_flag_sec': 120,
        'correlation_window_sec': 60,
        'alert_confidence_threshold': 0.65,
    },
    'balanced': {
        'grace_period_sec': 120,
        'phone_forgiveness_sec': 30,
        'inactivity_flag_sec': 300,
        'correlation_window_sec': 120,
        'alert_confidence_threshold': 0.65,
    },
    'relaxed': {
        'grace_period_sec': 300,
        'phone_forgiveness_sec': 60,
        'inactivity_flag_sec': 600,
        'correlation_window_sec': 180,
        'alert_confidence_threshold': 0.70,
    },
}


@dataclass
class AlertResult:
    alerted: bool
    confidence: float
    alert_type: Optional[str]
    message: Optional[str]
    distraction_type: Optional[str] = None
    severity: Optional[str] = None


class SignalsProcessor:
    """
    Stateless processor. Each method receives a FocusSession instance and
    queries the DB for recent signals. All DB calls must be performed via
    synchronous ORM (this class is called inside database_sync_to_async wrappers
    in the consumer).
    """

    # -----------------------------------------------------------------------
    # Correlation
    # -----------------------------------------------------------------------

    def correlate(self, session, new_signal) -> AlertResult:
        """
        Given a new MobileSignal, determine whether a distraction should be flagged.
        """
        config = SENSITIVITY_CONFIG.get(session.sensitivity, SENSITIVITY_CONFIG['balanced'])
        now = self._now()

        event = new_signal.signal_type

        if event in ('pwa_backgrounded', 'pwa_resumed'):
            return self._correlate_pwa_backgrounded(session, new_signal, config, now)

        if event == 'phone_picked_up':
            return self._correlate_phone_picked_up(session, new_signal, config, now)

        # For other events, no alert
        return AlertResult(alerted=False, confidence=0.0, alert_type=None, message=None)

    def _correlate_pwa_backgrounded(self, session, new_signal, config, now) -> AlertResult:
        from core.models import MobileSignal, DesktopSignal  # local import avoids circular

        confidence = 0.50  # base confidence just from pwa going background

        # Check if desktop has had ANY keystroke activity in the last 60 seconds
        cutoff_60 = now - timedelta(seconds=60)
        recent_keystrokes = DesktopSignal.objects.filter(
            session=session,
            signal_type='keystroke_active',
            timestamp__gte=cutoff_60,
        ).exists()

        if not recent_keystrokes:
            confidence += 0.25  # desktop is idle

        # Check for recent phone_picked_up signal
        cutoff_15 = now - timedelta(seconds=15)
        cutoff_30 = now - timedelta(seconds=30)

        recently_picked_up_15 = MobileSignal.objects.filter(
            session=session,
            signal_type='phone_picked_up',
            timestamp__gte=cutoff_15,
        ).exists()

        recently_picked_up_30 = MobileSignal.objects.filter(
            session=session,
            signal_type='phone_picked_up',
            timestamp__gte=cutoff_30,
        ).exists() if not recently_picked_up_15 else False

        if recently_picked_up_15:
            confidence += 0.15
        elif recently_picked_up_30:
            confidence += 0.08

        threshold = config['alert_confidence_threshold']

        # Forgiveness: if duration_ms is set and is under forgiveness threshold → forgive
        forgiveness_ms = config['phone_forgiveness_sec'] * 1000
        duration_ms = new_signal.duration_ms or 0
        if 0 < duration_ms < forgiveness_ms:
            return AlertResult(
                alerted=False,
                confidence=confidence,
                alert_type='phone_distraction',
                message=f'Quick check ({duration_ms}ms) — forgiven under threshold.',
            )

        if confidence >= threshold:
            return AlertResult(
                alerted=True,
                confidence=confidence,
                alert_type='phone_distraction',
                message='Phone distraction detected — PWA went to background while desktop is idle.',
                distraction_type='phone_use',
                severity='high' if confidence >= 0.85 else 'medium',
            )

        return AlertResult(
            alerted=False,
            confidence=confidence,
            alert_type=None,
            message=None,
        )

    def _correlate_phone_picked_up(self, session, new_signal, config, now) -> AlertResult:
        """
        Phone picked up alone is not definitive — just low-confidence indicator.
        Higher level decisions made when pwa_backgrounded follows.
        """
        return AlertResult(alerted=False, confidence=0.20, alert_type=None, message=None)

    # -----------------------------------------------------------------------
    # Focus Score Calculator
    # -----------------------------------------------------------------------

    def calculate_focus_score(self, session) -> dict:
        """
        Compute focus score 0–100 using signals from the last 5 minutes.
        Returns a dict with score, verdict, and component weights breakdown.
        """
        from core.models import MobileSignal, DesktopSignal

        now = self._now()
        window_start = now - timedelta(minutes=5)

        desktop_signals = list(DesktopSignal.objects.filter(
            session=session,
            timestamp__gte=window_start,
        ))

        mobile_signals = list(MobileSignal.objects.filter(
            session=session,
            timestamp__gte=window_start,
        ))

        # --- Component 1: Tab relevance (40% weight) ---
        relevance_scores = [s.topic_relevance_score for s in desktop_signals if s.topic_relevance_score is not None]
        tab_relevance = (sum(relevance_scores) / len(relevance_scores)) if relevance_scores else 0.5

        # --- Component 2: Keystroke activity (20% weight) ---
        keystroke_signals = [s for s in desktop_signals if s.signal_type in ('keystroke_active',)]
        total_desktop = len(desktop_signals) or 1
        keystroke_activity = min(1.0, len(keystroke_signals) / total_desktop)

        # --- Component 3: Phone state (25% weight) ---
        backgrounded_events = [s for s in mobile_signals if s.signal_type in ('pwa_backgrounded', 'pwa_resumed')]
        phone_state = 0.2 if backgrounded_events else 1.0

        # --- Component 4: Presence detection (15% weight) ---
        presence_signals = [s for s in desktop_signals if s.signal_type == 'presence_detected']
        absent_signals = [s for s in desktop_signals if s.signal_type == 'presence_absent']
        if presence_signals or absent_signals:
            presence = len(presence_signals) / (len(presence_signals) + len(absent_signals))
        else:
            presence = 0.8  # assume present if no data

        # --- Weighted sum ---
        raw_score = (
            tab_relevance * 0.40 +
            keystroke_activity * 0.20 +
            phone_state * 0.25 +
            presence * 0.15
        ) * 100

        score = max(0.0, min(100.0, raw_score))

        # Verdict
        if score >= 75:
            verdict = 'focused'
        elif score >= 55:
            verdict = 'mild_distraction'
        elif phone_state < 0.5:
            verdict = 'phone_use_detected'
        elif score >= 30:
            verdict = 'distracted'
        else:
            verdict = 'idle_break'

        return {
            'score': round(score, 2),
            'verdict': verdict,
            'components': {
                'tab_relevance': round(tab_relevance, 3),
                'keystroke_activity': round(keystroke_activity, 3),
                'phone_state': round(phone_state, 3),
                'presence': round(presence, 3),
            }
        }

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _now() -> datetime:
        return datetime.now(tz=timezone.utc)
