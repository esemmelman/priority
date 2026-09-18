import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, X } from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;

function SortableItem({ item, index, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: editing });
  const save = async () => {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === item.title) { setDraft(item.title); return; }
    await onEdit(item.id, title);
  };
  return <div ref={setNodeRef} className={`item ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} aria-label={`Drag ${item.title} to reorder`}>
    <span className="number">{String(index + 1).padStart(2, '0')}</span>
    {editing ? <input className="edit-input" autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(item.title); setEditing(false); } }} onBlur={save} aria-label="Edit item" />
      : <button className="item-title" onKeyDown={e => e.stopPropagation()} onClick={() => setEditing(true)} title="Click to edit">{item.title}</button>}
    <button className="delete" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`} title="Delete"><Trash2 size={17}/></button>
  </div>;
}

function App() {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const speechRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const stopVoice = () => {
    const session = speechRef.current;
    if (!session) return;
    session.active = false;
    clearTimeout(session.timer);
    clearTimeout(session.restartTimer);
    try { session.recognition.stop(); } catch { /* Recognition may have ended already. */ }
    speechRef.current = null;
    setListening(false);
  };
  const startVoice = () => {
    if (!/Android/i.test(navigator.userAgent) || speechRef.current) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError('Voice input is not supported by this browser. You can still type an item.'); return; }
    const recognition = new Recognition();
    const session = { recognition, active: true, base: input.trim(), committed: '', lastSpeech: Date.now(), timer: null, restartTimer: null };
    speechRef.current = session;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const armSilenceTimer = () => {
      session.lastSpeech = Date.now();
      clearTimeout(session.timer);
      session.timer = setTimeout(stopVoice, 3000);
    };
    recognition.onstart = () => { setListening(true); if (!session.started) { session.started = true; armSilenceTimer(); } };
    recognition.onspeechstart = armSilenceTimer;
    recognition.onspeechend = armSilenceTimer;
    recognition.onresult = event => {
      if (!session.active) return;
      let final = '', interim = '';
      for (const result of event.results) {
        if (result.isFinal) final += result[0].transcript + ' ';
        else interim += result[0].transcript + ' ';
      }
      session.segmentFinal = final.trim();
      setInput([session.base, session.committed, final.trim(), interim.trim()].filter(Boolean).join(' '));
      armSilenceTimer();
    };
    recognition.onerror = event => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') setError(`Voice input stopped: ${event.error}. You can still type an item.`);
      stopVoice();
    };
    recognition.onend = () => {
      if (!session.active) return;
      session.committed = [session.committed, session.segmentFinal].filter(Boolean).join(' ');
      session.segmentFinal = '';
      if (Date.now() - session.lastSpeech >= 3000) { stopVoice(); return; }
      session.restartTimer = setTimeout(() => {
        if (!session.active) return;
        try { recognition.start(); } catch { stopVoice(); }
      }, 100);
    };
    try { recognition.start(); } catch { speechRef.current = null; setError('Could not start voice input. You can still type an item.'); }
  };
  useEffect(() => () => { if (speechRef.current) { clearTimeout(speechRef.current.timer); clearTimeout(speechRef.current.restartTimer); speechRef.current.recognition.abort(); } }, []);
  const refresh = async () => {
    if (!db) { setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'); setLoading(false); return; }
    const { data, error } = await db.from('priority_items_v1').select('id,title,position').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) setError(error.message); else { setItems(data || []); setError(''); }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);
  const add = async e => {
    e.preventDefault(); const title = input.trim(); if (!title || !db) return;
    stopVoice();
    setSaving(true); setError('');
    const { data, error } = await db.from('priority_items_v1').insert({ title, position: items.length ? Math.max(...items.map(x => x.position)) + 1 : 0 }).select('id,title,position').single();
    if (error) setError(error.message); else { setItems(prev => [...prev, data]); setInput(''); }
    setSaving(false);
  };
  const edit = async (id, title) => {
    const previous = items; setItems(items.map(x => x.id === id ? { ...x, title } : x));
    const { error } = await db.from('priority_items_v1').update({ title }).eq('id', id);
    if (error) { setItems(previous); setError(error.message); }
  };
  const remove = async id => {
    const previous = items; setItems(items.filter(x => x.id !== id));
    const { error } = await db.from('priority_items_v1').delete().eq('id', id);
    if (error) { setItems(previous); setError(error.message); }
  };
  const dragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(x => x.id === active.id);
    const newIndex = items.findIndex(x => x.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((x, i) => ({ ...x, position: i }));
    setItems(reordered); setError('');
    const { error } = await db.from('priority_items_v1').upsert(reordered.map(({ id, title, position }) => ({ id, title, position })));
    if (error) { setItems(items); setError(error.message); }
  };
  return <div className="shell">
    <main className="content">
      <section className="list-panel">
        {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        {loading ? <div className="empty">Loading your list…</div> : items.length === 0 ? <div className="empty"><div className="empty-icon">✳</div><strong>A fresh start.</strong><span>Add your first item below.</span></div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={items.map(x => x.id)} strategy={verticalListSortingStrategy}><div className="items">{items.map((item, i) => <SortableItem key={item.id} item={item} index={i} onDelete={remove} onEdit={edit}/>)}</div></SortableContext></DndContext>}
        <form className={`add-form ${listening ? 'listening' : ''}`} onSubmit={add}><button className="add-trigger" type="submit" disabled={!input.trim() || saving} aria-label="Add item" title="Add item"><Plus size={22}/></button><input value={input} onClick={startVoice} onChange={e => { if (listening) stopVoice(); setInput(e.target.value); }} placeholder={listening ? 'Listening…' : 'Add something to your list…'} aria-label="New list item" maxLength={200}/></form>
      </section></main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
