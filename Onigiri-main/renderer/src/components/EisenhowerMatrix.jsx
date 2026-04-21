import { useState, useEffect, useRef } from 'react';
import { matrixApi, calendarApi } from '../api';

const CARD = { background: '#111', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' };

const QUADRANTS = [
  { id: 'do_first', label: 'Do First', desc: 'Urgent & Important', icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' },
  { id: 'schedule', label: 'Schedule', desc: 'Important, Not Urgent', icon: '🔵', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.25)' },
  { id: 'delegate', label: 'Delegate', desc: 'Urgent, Not Important', icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' },
  { id: 'eliminate', label: 'Eliminate', desc: 'Not Urgent, Not Important', icon: '⚫', color: '#6b7280', bg: 'rgba(107,114,128,0.08)', borderColor: 'rgba(107,114,128,0.25)' },
];

/* ─── Animations ─── */
const MATRIX_CSS = `
@keyframes matrixFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes sparkle { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
.matrix-task { transition: all 0.2s ease; }
.matrix-task:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.matrix-quadrant { transition: background 0.2s ease, border-color 0.2s ease; }
.matrix-quadrant.drag-over { border-color: rgba(99,102,241,0.6) !important; background: rgba(99,102,241,0.06) !important; }
`;

export default function EisenhowerMatrix() {
  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calAuth, setCalAuth] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [dragOverQuadrant, setDragOverQuadrant] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    loadTasks();
    checkCal();
  }, []);

  async function loadTasks() {
    try {
      const data = await matrixApi.getTasks();
      setTasks(data || []);
    } catch (err) {
      console.error('[Matrix] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkCal() {
    try {
      const { authenticated } = await calendarApi.getStatus();
      setCalAuth(authenticated);
    } catch {}
  }

  // ─── Add multiple tasks (split by newlines or commas) ───
  async function addTasks() {
    if (!newTaskText.trim()) return;
    
    // Split by newlines, filter empty
    const titles = newTaskText
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (titles.length === 0) return;

    const addedTasks = [];
    for (const title of titles) {
      try {
        const res = await matrixApi.createTask(title, 'inbox');
        if (res.ok && res.task) {
          addedTasks.push(res.task);
        }
      } catch (err) {
        console.error('[Matrix] Add task error:', err);
      }
    }

    if (addedTasks.length > 0) {
      setTasks(prev => [...addedTasks, ...prev]);
      setNewTaskText('');
    }
  }

  function handleKeyDown(e) {
    // Shift+Enter = newline, Enter = submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTasks();
    }
  }

  // ─── Auto-classify all inbox tasks ───
  async function handleAutoClassify() {
    const inbox = tasks.filter(t => t.quadrant === 'inbox' && !t.completed);
    if (inbox.length === 0) return;
    setClassifying(true);
    try {
      const res = await matrixApi.autoClassify(inbox.map(t => ({ id: t.id, title: t.title })));
      if (res.ok && res.classifications) {
        // Update local state with new quadrants
        setTasks(prev => prev.map(t => {
          const cl = res.classifications.find(c => c.id === t.id);
          return cl ? { ...t, quadrant: cl.quadrant, _reason: cl.reason } : t;
        }));
      }
    } catch (err) {
      console.error('[Matrix] Classify error:', err);
    } finally {
      setClassifying(false);
    }
  }

  // ─── Drag & Drop ───
  function handleDragStart(e, task) {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, quadrantId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverQuadrant(quadrantId);
  }

  function handleDragLeave() {
    setDragOverQuadrant(null);
  }

  async function handleDrop(e, quadrantId) {
    e.preventDefault();
    setDragOverQuadrant(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, quadrant: quadrantId } : t));

    try {
      await matrixApi.updateTask(taskId, { quadrant: quadrantId });
    } catch (err) {
      loadTasks(); // revert on error
    }
  }

  // ─── Complete / Delete ───
  async function toggleComplete(task) {
    const newCompleted = !task.completed;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: newCompleted } : t));
    try {
      if (newCompleted) {
        await matrixApi.completeTask(task.id);
      } else {
        await matrixApi.updateTask(task.id, { completed: false });
      }
    } catch { loadTasks(); }
  }

  async function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
    try { await matrixApi.deleteTask(id); } catch {}
  }

  // ─── Date change ───
  async function handleDateChange(taskId, dateStr) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: dateStr } : t));
    try {
      await matrixApi.updateTask(taskId, { due_date: dateStr });
    } catch { loadTasks(); }
  }

  // ─── Calendar ───
  async function handleCalendarConnect() {
    setSyncing(true);
    try {
      if (!calAuth) {
        const { url } = await calendarApi.getAuthUrl();
        if (url) window.open(url, '_blank');
        // Poll for auth status
        const poll = setInterval(async () => {
          try {
            const { authenticated } = await calendarApi.getStatus();
            if (authenticated) {
              setCalAuth(true);
              clearInterval(poll);
            }
          } catch {}
        }, 3000);
        setTimeout(() => clearInterval(poll), 120000);
      } else {
        const res = await calendarApi.sync();
        if (res.ok) {
          await loadTasks();
        }
      }
    } catch (err) {
      console.error('[Calendar]', err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleExportCalendar() {
    setSyncing(true);
    try {
      const res = await calendarApi.export();
      if (res.ok) {
        await loadTasks();
      }
    } catch (err) {
      console.error('[Calendar export]', err);
    } finally {
      setSyncing(false);
    }
  }

  // ─── Derived data ───
  const inboxTasks = tasks.filter(t => t.quadrant === 'inbox' && !t.completed);
  const completedTasks = tasks.filter(t => t.completed);
  const totalActive = tasks.filter(t => !t.completed).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #2d2d2d', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          Loading tasks...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 48px', width: '100%', boxSizing: 'border-box', overflowY: 'auto', height: '100vh', animation: 'matrixFadeIn 0.3s ease' }}>
      <style>{MATRIX_CSS}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            Eisenhower Matrix
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            {totalActive} active task{totalActive !== 1 ? 's' : ''} · Drop tasks into quadrants or let AI classify them
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          {calAuth && (
            <button onClick={handleExportCalendar} disabled={syncing}
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px 16px', color: '#22c55e', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📤 {syncing ? 'Exporting...' : 'Export to Calendar'}
            </button>
          )}
          <button onClick={handleCalendarConnect} disabled={syncing}
            style={{ background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px', padding: '10px 16px', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {calAuth ? '🔄 Sync Calendar' : '📅 Connect Google Calendar'}
          </button>
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* ─── INBOX SIDEBAR ─── */}
        <div style={{ ...CARD, width: '300px', flexShrink: 0, padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)' }}
          onDrop={(e) => handleDrop(e, 'inbox')} onDragOver={(e) => handleDragOver(e, 'inbox')} onDragLeave={handleDragLeave}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: 0 }}>📥 Inbox</h2>
              {inboxTasks.length > 0 && (
                <span style={{ background: '#6366f1', color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                  {inboxTasks.length}
                </span>
              )}
            </div>
          </div>

          {/* Multi-task input */}
          <div style={{ marginBottom: '12px' }}>
            <textarea
              ref={inputRef}
              value={newTaskText}
              onChange={e => setNewTaskText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"Add tasks (one per line)...\ne.g.\nStudy DBMS Chapter 5\nGym workout\nReply to emails"}
              rows={3}
              style={{
                width: '100%', background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '10px',
                padding: '12px', color: '#fff', fontSize: '13px', outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', minHeight: '72px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={addTasks} disabled={!newTaskText.trim()}
                style={{
                  flex: 1, background: newTaskText.trim() ? '#fff' : '#1a1a1a',
                  color: newTaskText.trim() ? '#000' : '#4b5563',
                  border: '1px solid #2d2d2d', borderRadius: '8px', padding: '10px', fontSize: '13px',
                  fontWeight: 600, cursor: newTaskText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s'
                }}>
                + Add {newTaskText.trim() ? `(${newTaskText.split('\n').filter(l => l.trim()).length})` : ''}
              </button>
            </div>
          </div>

          {/* Auto-classify button */}
          {inboxTasks.length > 0 && (
            <button onClick={handleAutoClassify} disabled={classifying}
              style={{
                width: '100%', background: classifying ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px',
                fontWeight: 700, cursor: classifying ? 'not-allowed' : 'pointer', marginBottom: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                animation: classifying ? 'sparkle 1s infinite' : 'none',
                boxShadow: classifying ? 'none' : '0 4px 15px rgba(99,102,241,0.3)'
              }}>
              {classifying ? (
                <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> Classifying with AI...</>
              ) : (
                <>✨ Auto-Classify All ({inboxTasks.length})</>
              )}
            </button>
          )}

          {/* Inbox task list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inboxTasks.map((t, i) => (
              <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onDelete={() => deleteTask(t.id)}
                onComplete={() => toggleComplete(t)} onDateChange={handleDateChange} style={{ animationDelay: `${i * 50}ms` }} />
            ))}
            {inboxTasks.length === 0 && (
              <div style={{ color: '#374151', fontSize: '13px', textAlign: 'center', marginTop: '32px', lineHeight: 1.6 }}>
                No unsorted tasks.<br />Add tasks above and hit<br /><strong style={{ color: '#6366f1' }}>Auto-Classify</strong> to sort them.
              </div>
            )}
          </div>

          {/* Completed toggle */}
          {completedTasks.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid #2d2d2d', paddingTop: '12px' }}>
              <button onClick={() => setShowCompleted(!showCompleted)}
                style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: 0 }}>
                <span style={{ transform: showCompleted ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                Completed ({completedTasks.length})
              </button>
              {showCompleted && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                  {completedTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: '#0a0a0a' }}>
                      <input type="checkbox" checked onChange={() => toggleComplete(t)}
                        style={{ accentColor: '#22c55e', cursor: 'pointer' }} />
                      <span style={{ color: '#4b5563', fontSize: '13px', textDecoration: 'line-through', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </span>
                      <button onClick={() => deleteTask(t.id)}
                        style={{ background: 'transparent', border: 'none', color: '#374151', cursor: 'pointer', fontSize: '14px', padding: '0 2px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── MATRIX 2×2 GRID ─── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {QUADRANTS.map(q => {
            const qTasks = tasks.filter(t => t.quadrant === q.id && !t.completed);
            const isDragOver = dragOverQuadrant === q.id;

            return (
              <div key={q.id}
                className={`matrix-quadrant ${isDragOver ? 'drag-over' : ''}`}
                style={{
                  ...CARD, padding: '18px', minHeight: '280px', display: 'flex', flexDirection: 'column',
                  background: isDragOver ? 'rgba(99,102,241,0.06)' : q.bg,
                  borderColor: isDragOver ? 'rgba(99,102,241,0.6)' : q.borderColor,
                  border: `1px solid ${isDragOver ? 'rgba(99,102,241,0.6)' : q.borderColor}`,
                  borderRadius: '14px',
                }}
                onDrop={(e) => handleDrop(e, q.id)}
                onDragOver={(e) => handleDragOver(e, q.id)}
                onDragLeave={handleDragLeave}
              >
                {/* Quadrant header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{q.icon}</span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>{q.label}</h3>
                  </div>
                  {qTasks.length > 0 && (
                    <span style={{ background: q.color + '20', color: q.color, borderRadius: '8px', padding: '2px 8px', fontSize: '12px', fontWeight: 700 }}>
                      {qTasks.length}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#4b5563', margin: '0 0 12px 0' }}>{q.desc}</p>

                {/* Tasks in quadrant */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                  {qTasks.map((t, i) => (
                    <TaskCard key={t.id} task={t} onDragStart={handleDragStart} onDelete={() => deleteTask(t.id)}
                      onComplete={() => toggleComplete(t)} onDateChange={handleDateChange} color={q.color} style={{ animationDelay: `${i * 40}ms` }} />
                  ))}
                  {qTasks.length === 0 && (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#2d2d2d', fontSize: '13px', fontStyle: 'italic',
                      border: '2px dashed #1f1f1f', borderRadius: '10px', margin: '4px 0', minHeight: '80px'
                    }}>
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Task Card Component ─── */
function TaskCard({ task, onDragStart, onDelete, onComplete, onDateChange, color, style = {} }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const accentColor = color || '#6b7280';
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const isOverdue = dueDate && dueDate < today && !task.completed;
  const dueDateStr = dueDate ? dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  return (
    <div
      className="matrix-task"
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      style={{
        background: '#151515', border: `1px solid ${accentColor}30`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: '8px', padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: '10px',
        cursor: 'grab', animation: 'slideIn 0.25s ease forwards',
        opacity: 0, ...style
      }}
    >
      {/* Checkbox */}
      <input type="checkbox" checked={task.completed} onChange={onComplete}
        style={{ accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0, width: '15px', height: '15px' }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {task.google_event_id && <span title="Synced with Google Calendar" style={{ fontSize: '12px' }}>📅</span>}
          <span style={{
            color: task.completed ? '#4b5563' : '#e5e7eb', fontSize: '13px', fontWeight: 500,
            textDecoration: task.completed ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {task.title}
          </span>
        </div>
        {/* Due date & AI reason */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
          {/* Date picker toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: '0',
              fontSize: '11px', color: isOverdue ? '#ef4444' : dueDateStr ? '#6b7280' : '#4b5563',
              fontWeight: isOverdue ? 600 : 400, display: 'flex', alignItems: 'center', gap: '3px'
            }}
            title={dueDateStr ? `Due: ${dueDateStr} (click to change)` : 'Set due date'}
          >
            {isOverdue ? '⚠' : '📆'} {dueDateStr || 'Set date'}
          </button>

          {task._reason && (
            <span style={{ fontSize: '11px', color: '#6366f1', fontStyle: 'italic' }}>
              — {task._reason}
            </span>
          )}
        </div>

        {/* Inline date picker */}
        {showDatePicker && (
          <div style={{ marginTop: '6px' }} onClick={(e) => e.stopPropagation()}>
            <input
              type="date"
              defaultValue={task.due_date ? task.due_date.slice(0, 10) : ''}
              onChange={(e) => {
                onDateChange(task.id, e.target.value || null);
                setShowDatePicker(false);
              }}
              style={{
                background: '#1a1a1a', border: '1px solid #2d2d2d', borderRadius: '6px',
                padding: '4px 8px', color: '#fff', fontSize: '12px', outline: 'none',
                colorScheme: 'dark', cursor: 'pointer'
              }}
            />
            {task.due_date && (
              <button
                onClick={() => { onDateChange(task.id, null); setShowDatePicker(false); }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', marginLeft: '6px' }}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{ background: 'transparent', border: 'none', color: '#374151', cursor: 'pointer', fontSize: '16px', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
        ×
      </button>
    </div>
  );
}
