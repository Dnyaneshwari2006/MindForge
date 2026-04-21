/**
 * useVisibilityTracker — Page Visibility API hook
 * 
 * Tracks when the user leaves/returns to the MindForge tab.
 * Only active when `enabled` is true (i.e., a session is running).
 * 
 * Sends tab_away / tab_return events over WebSocket so the server
 * can log them in the session timeline and affect scoring.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export default function useVisibilityTracker(enabled = false, wsSend = null) {
  const [isAway, setIsAway] = useState(false);
  const [awayDuration, setAwayDuration] = useState(0);   // total seconds away this session
  const [awayCount, setAwayCount] = useState(0);          // number of times they left
  const [lastLeftAt, setLastLeftAt] = useState(null);     // Date — when they last left
  const [lastReturnedAt, setLastReturnedAt] = useState(null); // Date — when they last came back
  const [currentAwayTime, setCurrentAwayTime] = useState(0);  // seconds of current away stint

  const tickRef = useRef(null);
  const leftAtRef = useRef(null);

  // Reset state when tracking is disabled (session ends)
  useEffect(() => {
    if (!enabled) {
      setIsAway(false);
      setAwayDuration(0);
      setAwayCount(0);
      setLastLeftAt(null);
      setLastReturnedAt(null);
      setCurrentAwayTime(0);
      leftAtRef.current = null;
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
  }, [enabled]);

  // Tick counter — updates currentAwayTime every second while away
  useEffect(() => {
    if (isAway && enabled) {
      tickRef.current = setInterval(() => {
        if (leftAtRef.current) {
          const elapsed = Math.floor((Date.now() - leftAtRef.current.getTime()) / 1000);
          setCurrentAwayTime(elapsed);
        }
      }, 1000);
    } else {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setCurrentAwayTime(0);
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isAway, enabled]);

  // Core visibility handler
  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;

    if (document.hidden) {
      // User left the tab
      const now = new Date();
      leftAtRef.current = now;
      setIsAway(true);
      setLastLeftAt(now);
      setAwayCount(c => c + 1);

      // Notify server
      if (wsSend) {
        wsSend({ type: 'tab_away', timestamp: now.toISOString() });
      }
    } else {
      // User returned to the tab
      const now = new Date();
      const stintSeconds = leftAtRef.current
        ? Math.floor((now.getTime() - leftAtRef.current.getTime()) / 1000)
        : 0;

      setIsAway(false);
      setLastReturnedAt(now);
      setAwayDuration(d => d + stintSeconds);
      setCurrentAwayTime(0);
      leftAtRef.current = null;

      // Notify server
      if (wsSend) {
        wsSend({
          type: 'tab_return',
          timestamp: now.toISOString(),
          awaySeconds: stintSeconds,
        });
      }
    }
  }, [enabled, wsSend]);

  // Attach / detach the visibility listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, handleVisibilityChange]);

  return {
    isAway,
    awayDuration,
    awayCount,
    lastLeftAt,
    lastReturnedAt,
    currentAwayTime,
  };
}
