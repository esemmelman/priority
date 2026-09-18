import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpRight, GripVertical, Plus, Trash2, X } from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const db = url && key ? createClient(url, key) : null;

function SortableItem({ item, index, onDelete, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const save = async () => {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === item.title) { setDraft(item.title); return; }
    await onEdit(item.id, title);
  };
  return <div ref={setNodeRef} className={`item ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <span className="number">{String(index + 1).padStart(2, '0')}</span>
    {editing ? <input className="edit-input" autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(item.title); setEditing(false); } }} onBlur={save} aria-label="Edit item" />
      : <button className="item-title" onClick={() => setEditing(true)} title="Click to edit">{item.title}</button>}
    <button className="delete" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`} title="Delete"><Trash2 size={17}/></button>
    <button className="handle" {...attributes} {...listeners} aria-label={`Drag ${item.title} to reorder`} title="Drag to reorder"><GripVertical size={19}/></button>
  </div>;
}

function App() {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const refresh = async () => {
    if (!db) { setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'); setLoading(false); return; }
    const { data, error } = await db.from('priority_items_v1').select('id,title,position').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) setError(error.message); else { setItems(data || []); setError(''); }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);
  const add = async e => {
    e.preventDefault(); const title = input.trim(); if (!title || !db) return;
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
        <form className="add-form" onSubmit={add}><Plus size={20}/><input value={input} onChange={e => setInput(e.target.value)} placeholder="Add something to your list…" aria-label="New list item" maxLength={200}/><button type="submit" disabled={!input.trim() || saving}>Add item <ArrowUpRight size={16}/></button></form>
      </section></main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
