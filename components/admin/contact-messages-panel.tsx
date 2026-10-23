'use client';

import { useEffect, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { Loader2, Mail, Send, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type MessageRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'closed';
  admin_notes?: string | null;
  replied_at?: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ['new', 'read', 'replied', 'closed'];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-amber-100 text-amber-800',
  read: 'bg-blue-100 text-blue-800',
  replied: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-muted text-muted-foreground',
};

export default function ContactMessagesPanel() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  useAdminFocus(!loading && messages.length > 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/contact-messages');
      if (res.ok) {
        const body = await res.json();
        setMessages(body.messages || []);
      } else {
        toast.error('Failed to load contact messages');
      }
    } catch {
      toast.error('Failed to load contact messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const newCount = messages.filter((m) => m.status === 'new').length;
  const repliedCount = messages.filter((m) => m.status === 'replied').length;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Messages</p>
          <p className="mt-2 text-2xl font-semibold">{messages.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">New</p>
          <p className="mt-2 text-2xl font-semibold">{newCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Replied</p>
          <p className="mt-2 text-2xl font-semibold">{repliedCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Mail className="h-10 w-10" />
          <p>No messages yet. Submissions from the Contact Us page will show up here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {messages.map((m) => (
            <div key={m.id} data-focus-id={m.id}>
              <MessageCard m={m} onUpdated={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageCard({ m, onUpdated }: { m: MessageRow; onUpdated: () => void }) {
  const [status, setStatus] = useState(m.status);
  const [notes, setNotes] = useState(m.admin_notes || '');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showReply, setShowReply] = useState(false);

  const dirty = status !== m.status || notes !== (m.admin_notes || '');

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/contact-messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: notes }),
      });
      if (res.ok) {
        toast.success('Message updated');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) {
      toast.error('Write a reply message first');
      return;
    }
    setReplying(true);
    try {
      const res = await fetch(`/api/admin/contact-messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_message: reply.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Reply sent to customer');
        setReply('');
        setShowReply(false);
        onUpdated();
      } else {
        toast.error(body.error || 'Failed to send reply');
      }
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {m.subject}{' '}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[m.status] || 'bg-muted'}`}>
              {m.status}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.name} ({m.email})
            {m.phone && (
              <>
                {' '}
                &middot; <Phone className="mb-0.5 inline h-3 w-3" /> {m.phone}
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Received {new Date(m.created_at).toLocaleString('en-IN')}
            {m.replied_at && <> &middot; Replied {new Date(m.replied_at).toLocaleString('en-IN')}</>}
          </p>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm">
        <span className="font-medium">Message: </span>
        {m.message}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MessageRow['status'])}
            className="rounded border px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Internal note</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowReply((s) => !s)}>
          <Mail className="mr-2 h-3.5 w-3.5" />
          Reply by email
        </Button>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </div>

      {showReply && (
        <div className="mt-3 grid gap-2 rounded-md border border-dashed p-3">
          <label className="text-xs font-medium text-muted-foreground">
            Reply to {m.email}
          </label>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply..."
            rows={4}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={sendReply} disabled={replying}>
              {replying ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
              Send reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
