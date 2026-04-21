import json
import logging
from datetime import datetime, timezone
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

class FocusSessionConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f'session_{self.session_id}'
        self.device = None

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info(f'WS connected to {self.session_id}')

    async def disconnect(self, close_code):
        if self.device:
            await self.channel_layer.group_send(self.group_name, {
                'type': 'device_disconnected',
                'device': self.device,
                'session_id': self.session_id,
            })
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info(f'WS disconnected from {self.session_id} (device={self.device})')

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        device = data.get('device')
        event = data.get('event')
        session_id = data.get('session_id')

        if not all([device, event, session_id]):
            return
        if session_id != self.session_id:
            return

        self.device = device

        if device == 'mobile':
            # Broadcast mobile connection
            if event == 'session_joined':
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'mobile_connected_notification',
                    'session_id': self.session_id,
                    'mobile_connected_at': datetime.now(timezone.utc).isoformat(),
                })
                await self.send(text_data=json.dumps({
                    'type': 'session_joined_ack',
                    'session_id': self.session_id,
                    'topic': 'Focus Session',
                    'duration_minutes': 30,
                }))
            else:
                # Relay raw mobile signals to desktop (if it wants to audit trail)
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'raw_mobile_signal',
                    'signal_type': event,
                    'session_id': self.session_id,
                })
                
        elif device == 'desktop':
            # Route desktop score broadcasts back to phone
            if event == 'base_score_update':
                await self.channel_layer.group_send(self.group_name, {
                    'type': 'score_update',
                    'score': data.get('score', 100),
                    'verdict': 'unknown',
                    'session_id': self.session_id,
                })

    async def mobile_connected_notification(self, event):
        await self.send(text_data=json.dumps(event))

    async def distraction_alert(self, event):
        await self.send(text_data=json.dumps(event))

    async def score_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def desktop_state_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def device_disconnected(self, event):
        await self.send(text_data=json.dumps(event))

    async def session_ended(self, event):
        await self.send(text_data=json.dumps(event))

    async def raw_mobile_signal(self, event):
        await self.send(text_data=json.dumps(event))
