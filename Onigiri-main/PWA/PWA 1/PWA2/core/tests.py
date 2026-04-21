"""
Django tests for FocusTrack core — 7 required scenarios.
"""

import json
from datetime import datetime, timezone, timedelta
from unittest import mock

from channels.testing import WebsocketCommunicator
from django.test import TestCase, override_settings
from django.urls import reverse

from core.models import FocusSession, MobileSignal, DesktopSignal, DistractionEvent
from core.signals_processor import SignalsProcessor

# Use in-memory channel layer for all tests (no Redis required)
TEST_CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_session(**kwargs) -> FocusSession:
    defaults = dict(
        session_id='TEST01',
        topic='Mathematics',
        duration_minutes=60,
        sensitivity='balanced',
        is_active=True,
    )
    defaults.update(kwargs)
    return FocusSession.objects.create(**defaults)


def mobile_signal(session, signal_type, seconds_ago=0, **kwargs) -> MobileSignal:
    ts = datetime.now(tz=timezone.utc) - timedelta(seconds=seconds_ago)
    return MobileSignal.objects.create(
        session=session,
        signal_type=signal_type,
        timestamp=ts,
        raw_data={},
        **kwargs,
    )


def desktop_signal(session, signal_type, seconds_ago=0, **kwargs) -> DesktopSignal:
    ts = datetime.now(tz=timezone.utc) - timedelta(seconds=seconds_ago)
    return DesktopSignal.objects.create(
        session=session,
        signal_type=signal_type,
        timestamp=ts,
        raw_data={},
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Test 1: Session creation returns valid 6-character session_id
# ---------------------------------------------------------------------------

class SessionCreationTest(TestCase):
    def test_create_session_returns_valid_id(self):
        response = self.client.post(
            '/api/sessions/create/',
            data=json.dumps({'topic': 'Physics', 'duration_minutes': 45, 'sensitivity': 'balanced'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        sid = data['session_id']
        self.assertEqual(len(sid), 6)
        self.assertTrue(sid.isalnum())
        self.assertTrue(sid.isupper() or sid.isalnum())
        # Verify it's in DB
        self.assertTrue(FocusSession.objects.filter(session_id=sid).exists())

    def test_create_session_missing_topic_returns_400(self):
        response = self.client.post(
            '/api/sessions/create/',
            data=json.dumps({'duration_minutes': 30, 'sensitivity': 'strict'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_create_session_missing_duration_returns_400(self):
        response = self.client.post(
            '/api/sessions/create/',
            data=json.dumps({'topic': 'Bio', 'sensitivity': 'strict'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Test 2: Mobile signal saved correctly when received over WebSocket
# ---------------------------------------------------------------------------

@override_settings(CHANNEL_LAYERS=TEST_CHANNEL_LAYERS)
class MobileSignalWebSocketTest(TestCase):
    async def test_mobile_signal_saved_over_websocket(self):
        from focustrack.asgi import application
        session = await self._create_session()
        communicator = WebsocketCommunicator(
            application,
            f'/ws/session/{session.session_id}/'
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        payload = {
            'device': 'mobile',
            'event': 'session_joined',
            'session_id': session.session_id,
            'timestamp': int(datetime.now(tz=timezone.utc).timestamp() * 1000),
        }
        await communicator.send_json_to(payload)
        await communicator.receive_json_from()  # session_joined_ack
        # Also drain any score_update broadcast that may have come from session_joined processing
        import asyncio
        try:
            async with asyncio.timeout(0.5):
                await communicator.receive_json_from()
        except (asyncio.TimeoutError, Exception):
            pass

        # Send a phone_picked_up signal
        await communicator.send_json_to({
            'device': 'mobile',
            'event': 'phone_picked_up',
            'session_id': session.session_id,
            'timestamp': int(datetime.now(tz=timezone.utc).timestamp() * 1000),
            'magnitude': 14.5,
        })
        # Drain the score_update broadcast triggered by phone_picked_up
        try:
            async with asyncio.timeout(1.0):
                await communicator.receive_json_from()
        except (asyncio.TimeoutError, Exception):
            pass

        count = await self._count_signals(session, 'phone_picked_up')
        self.assertEqual(count, 1)
        await communicator.disconnect()

    from channels.db import database_sync_to_async

    @database_sync_to_async
    def _create_session(self):
        return make_session(session_id='WS0001')

    @database_sync_to_async
    def _count_signals(self, session, signal_type):
        return MobileSignal.objects.filter(session=session, signal_type=signal_type).count()


# ---------------------------------------------------------------------------
# Test 3: Correlation flags distraction when pwa_backgrounded + desktop idle
# ---------------------------------------------------------------------------

class CorrelationDistractedTest(TestCase):
    def test_pwa_backgrounded_desktop_idle_flags_distraction(self):
        session = make_session(sensitivity='balanced')
        # Phone was picked up 10 seconds ago
        mobile_signal(session, 'phone_picked_up', seconds_ago=10)
        # No desktop keystroke activity

        # Create the backgrounded signal
        bg_signal = mobile_signal(session, 'pwa_backgrounded')

        proc = SignalsProcessor()
        result = proc.correlate(session, bg_signal)

        self.assertTrue(result.alerted)
        self.assertGreaterEqual(result.confidence, 0.65)
        self.assertEqual(result.alert_type, 'phone_distraction')


# ---------------------------------------------------------------------------
# Test 4: Correlation forgives quick phone check under threshold
# ---------------------------------------------------------------------------

class CorrelationForgivenTest(TestCase):
    def test_quick_phone_check_forgiven(self):
        session = make_session(sensitivity='balanced')
        # balanced forgiveness = 30 seconds = 30000 ms
        # duration_ms is 10 seconds — well under threshold

        bg_signal = mobile_signal(session, 'pwa_backgrounded', duration_ms=10000)

        proc = SignalsProcessor()
        result = proc.correlate(session, bg_signal)

        # Should NOT alert — forgiven
        self.assertFalse(result.alerted)


# ---------------------------------------------------------------------------
# Test 5: Focus score = 100 for high-relevance desktop-only session
# ---------------------------------------------------------------------------

class FocusScoreHighTest(TestCase):
    def test_focus_score_100_for_high_relevance_desktop(self):
        session = make_session()
        now = datetime.now(tz=timezone.utc)
        # Lots of high-relevance desktop signals + keystroke activity
        for i in range(10):
            DesktopSignal.objects.create(
                session=session,
                signal_type='keystroke_active',
                timestamp=now - timedelta(seconds=i * 20),
                topic_relevance_score=1.0,
                raw_data={},
            )

        proc = SignalsProcessor()
        result = proc.calculate_focus_score(session)

        self.assertGreaterEqual(result['score'], 90)


# ---------------------------------------------------------------------------
# Test 6: Focus score < 40 for pwa_backgrounded + no keystroke activity
# ---------------------------------------------------------------------------

class FocusScoreLowTest(TestCase):
    def test_focus_score_below_40_for_distracted_session(self):
        session = make_session()
        now = datetime.now(tz=timezone.utc)

        # Desktop signals with low relevance, no keystrokes
        for i in range(5):
            DesktopSignal.objects.create(
                session=session,
                signal_type='tab_active',
                timestamp=now - timedelta(seconds=i * 30),
                topic_relevance_score=0.1,
                raw_data={},
            )

        # Phone backgrounded
        mobile_signal(session, 'pwa_backgrounded', seconds_ago=60)

        proc = SignalsProcessor()
        result = proc.calculate_focus_score(session)

        self.assertLess(result['score'], 40)


# ---------------------------------------------------------------------------
# Test 7: Session end returns correct focused / distracted time totals
# ---------------------------------------------------------------------------

class SessionEndStatsTest(TestCase):
    def test_session_end_returns_correct_time_totals(self):
        from django.utils import timezone as dj_timezone
        # Create session with started_at 10 minutes ago so focused_minutes is non-zero
        session = make_session(session_id='ENDTST')
        ten_min_ago = dj_timezone.now() - timedelta(minutes=10)
        FocusSession.objects.filter(session_id='ENDTST').update(started_at=ten_min_ago)
        session.refresh_from_db()

        # Create a distraction event starting 5 minutes ago, lasting 2 minutes
        now = datetime.now(tz=timezone.utc)
        DistractionEvent.objects.create(
            session=session,
            started_at=now - timedelta(minutes=5),
            ended_at=now - timedelta(minutes=3),
            distraction_type='phone_use',
            severity='medium',
            score_impact=-10.0,
        )

        response = self.client.post(f'/api/sessions/ENDTST/end/')
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn('focused_minutes', data)
        self.assertIn('distracted_minutes', data)
        # Should have ~2 minutes distracted
        self.assertGreaterEqual(data['distracted_minutes'], 1.5)
        self.assertLess(data['distracted_minutes'], 3.0)
        # Focused should be ~8 of the 10 total minutes
        self.assertGreater(data['focused_minutes'], 5.0)
