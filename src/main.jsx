import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Keyboard, Mic, Plus, Trash2, X } from 'lucide-react';
import { mergeTranscript } from './transcript.js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;
const isAndroid = /Android/i.test(navigator.userAgent);
const androidVoiceAvailable = isAndroid && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

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
  const [typingMode, setTypingMode] = useState(false);
  const inputRef = useRef(null);
  const speechRef = useRef(null);
  const itemsRef = useRef(items);
  const savingRef = useRef(false);
  itemsRef.current = items;
  useEffect(() => {
    if (!isAndroid || !inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
  }, [input]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const saveItem = async title => {
    title = title.trim();
    if (!title || !db || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      const current = itemsRef.current;
      const { data, error } = await db.from('priority_items_v1').insert({ title, position: current.length ? Math.max(...current.map(x => x.position)) + 1 : 0 }).select('id,title,position').single();
      if (error) setError(error.message);
      else { setItems(prev => [...prev, data]); setInput(''); setTypingMode(false); }
    } catch (error) { setError(error.message || 'Could not add the item.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
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
    inputRef.current?.blur();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError('Voice input is not supported by this browser. You can still type an item.'); return; }
    const recognition = new Recognition();
    const session = { recognition, active: true, base: input.trim(), committed: '', lastSpeech: Date.now(), timer: null, restartTimer: null };
    speechRef.current = session;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const autoAddVoice = () => {
      if (!session.active) return;
      const dictated = mergeTranscript(session.committed, session.segmentText || '');
      const title = [session.base, dictated].filter(Boolean).join(' ').trim();
      stopVoice();
      if (dictated) void saveItem(title);
    };
    const armSilenceTimer = () => {
      session.lastSpeech = Date.now();
      clearTimeout(session.timer);
      session.timer = setTimeout(autoAddVoice, 3000);
    };
    recognition.onstart = () => { setListening(true); if (!session.started) { session.started = true; armSilenceTimer(); } };
    recognition.onspeechstart = armSilenceTimer;
    recognition.onspeechend = armSilenceTimer;
    recognition.onresult = event => {
      if (!session.active) return;
      let segment = '';
      for (const result of event.results) {
        segment = mergeTranscript(segment, result[0].transcript);
      }
      session.segmentText = segment;
      const dictated = mergeTranscript(session.committed, segment);
      setInput([session.base, dictated].filter(Boolean).join(' '));
      armSilenceTimer();
    };
    recognition.onerror = event => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') setError(`Voice input stopped: ${event.error}. You can still type an item.`);
      stopVoice();
    };
    recognition.onend = () => {
      if (!session.active) return;
      session.committed = mergeTranscript(session.committed, session.segmentText || '');
      session.segmentText = '';
      if (Date.now() - session.lastSpeech >= 3000) { autoAddVoice(); return; }
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
    e.preventDefault();
    stopVoice();
    await saveItem(input);
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
  const EntryField = isAndroid ? 'textarea' : 'input';
  return <div className="shell">
    <main className="content">
      <section className="list-panel">
        {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        {loading ? <div className="empty">Loading your list…</div> : items.length === 0 ? <div className="empty"><div className="empty-icon">✳</div><strong>A fresh start.</strong><span>Add your first item below.</span></div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={items.map(x => x.id)} strategy={verticalListSortingStrategy}><div className="items">{items.map((item, i) => <SortableItem key={item.id} item={item} index={i} onDelete={remove} onEdit={edit}/>)}</div></SortableContext></DndContext>}
        <form className={`add-form ${listening ? 'listening' : ''}`} onSubmit={add}><button className="add-trigger" type="submit" disabled={!input.trim() || saving} aria-label="Add item" title="Add item"><Plus size={22}/></button><EntryField ref={inputRef} rows={isAndroid ? 1 : undefined} value={input} readOnly={androidVoiceAvailable && !typingMode} inputMode={androidVoiceAvailable && !typingMode ? 'none' : 'text'} onPointerDown={e => { if (androidVoiceAvailable && !typingMode) { e.preventDefault(); startVoice(); } }} onChange={e => { if (listening) stopVoice(); setInput(e.target.value); }} placeholder={listening ? 'Listening…' : 'Add something to your list…'} aria-label="New list item" maxLength={200}/>{androidVoiceAvailable && <button className="entry-mode" type="button" onClick={() => { stopVoice(); setTypingMode(value => { if (value) inputRef.current?.blur(); else setTimeout(() => inputRef.current?.focus(), 0); return !value; }); }} aria-label={typingMode ? 'Switch to voice input' : 'Switch to typing'} title={typingMode ? 'Switch to voice input' : 'Switch to typing'}>{typingMode ? <Mic size={18}/> : <Keyboard size={18}/>}</button>}</form>
      </section></main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
