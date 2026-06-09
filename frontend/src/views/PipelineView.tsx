import { useEffect, useState } from 'react';
import { getApplications, updateApplication, requestFollowUp, createApplication } from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import type { Application } from '@/types';

interface PipelineViewProps {
  applications: Application[];
  setApplications: (apps: Application[]) => void;
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

const COLUMNS: Application['status'][] = ['APPLIED', 'NO_RESPONSE', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER'];

const COLUMN_COLORS: Record<string, string> = {
  APPLIED: '#71717A',
  NO_RESPONSE: '#71717A',
  PHONE_SCREEN: '#71717A',
  INTERVIEW: '#71717A',
  OFFER: '#71717A',
};

export default function PipelineView({ applications, setApplications, addMessage }: PipelineViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ company: '', role: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getApplications().then(({ data }) => setApplications(data)).catch(console.error);
  }, [setApplications]);

  async function handleDrop(status: Application['status']) {
    if (!dragId || dragId === status) return;
    const app = applications.find((a) => a._id === dragId);
    if (!app || app.status === status) {
      setDragId(null);
      setDragOver(null);
      return;
    }
    try {
      const updated = applications.map((a) => (a._id === dragId ? { ...a, status } : a));
      setApplications(updated);
      await updateApplication(dragId, { status });
    } catch {
      getApplications().then(({ data }) => setApplications(data));
    }
    setDragId(null);
    setDragOver(null);
  }

  async function handleMarkRejected(appId: string) {
    try {
      await updateApplication(appId, { status: 'REJECTED' });
      setApplications(applications.map((a) => (a._id === appId ? { ...a, status: 'REJECTED' } : a)));
    } catch {
      addMessage('agent', 'Failed to update application status.');
    }
  }

  async function handleFollowUp(appId: string) {
    addMessage('agent', 'Drafting follow-up email...');
    try {
      const { data } = await requestFollowUp(appId);
      addMessage('agent', `${data.reply}\n\nSubject: ${data.subject}\n\n${data.body}`);
    } catch {
      addMessage('agent', 'Failed to draft follow-up. Please try again.');
    }
  }

  async function handleAddApplication() {
    if (!addForm.company || !addForm.role) return;
    setAdding(true);
    try {
      const { data } = await createApplication(addForm);
      setApplications([data, ...applications]);
      setAddForm({ company: '', role: '' });
      setShowAdd(false);
    } catch {
      addMessage('agent', 'Failed to add application.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#FAFAFA' }}>
            My Pipeline
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>
            {applications.length} total applications
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          style={{ background: '#00e5ff', color: '#09090B' }}
        >
          + Add Application
        </button>
      </div>

      {showAdd && (
        <div
          className="mb-4 p-4 rounded-xl flex gap-3 items-end"
          style={{
            background: 'rgba(24,24,27,0.80)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div className="flex-1">
            <label
              className="text-[11px] uppercase tracking-wide font-medium block mb-1.5"
              style={{ color: '#52525B' }}
            >
              Company
            </label>
            <input
              value={addForm.company}
              onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
              placeholder="Stripe"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: '#27272A',
                color: '#FAFAFA',
                outline: 'none',
                boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,229,255,0.35), 0 2px 8px 0 rgba(0,0,0,0.20)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.20)';
              }}
            />
          </div>
          <div className="flex-1">
            <label
              className="text-[11px] uppercase tracking-wide font-medium block mb-1.5"
              style={{ color: '#52525B' }}
            >
              Role
            </label>
            <input
              value={addForm.role}
              onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              placeholder="Senior Software Engineer"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: '#27272A',
                color: '#FAFAFA',
                outline: 'none',
                boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,229,255,0.35), 0 2px 8px 0 rgba(0,0,0,0.20)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px 0 rgba(0,0,0,0.20)';
              }}
            />
          </div>
          <button
            onClick={handleAddApplication}
            disabled={adding || !addForm.company || !addForm.role}
            className="px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-40"
            style={{ background: '#00e5ff', color: '#09090B' }}
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="px-3 py-2 text-xs rounded-md transition-colors"
            style={{ background: '#27272A', color: '#71717A', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#71717A'; }}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto flex-1 pb-4">
        {COLUMNS.map((status) => {
          const colApps = applications.filter((a) => a.status === status);
          const isOver = dragOver === status;
          return (
            <div
              key={status}
              className="shrink-0 w-72 flex flex-col rounded-xl transition-all duration-100"
              style={{
                background: isOver ? 'rgba(0,30,40,0.70)' : 'rgba(24,24,27,0.65)',
                backdropFilter: 'blur(12px)',
                boxShadow: isOver
                  ? 'inset 0 0 0 1px #00e5ff, 0 2px 8px 0 rgba(0,0,0,0.20)'
                  : '0 2px 8px 0 rgba(0,0,0,0.20)',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(status)}
            >
              <div
                className="flex items-center px-3 py-3 gap-1.5"
                style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.04)' }}
              >
                <span
                  className="text-[11px] font-medium uppercase tracking-wide"
                  style={{ color: COLUMN_COLORS[status] ?? '#71717A' }}
                >
                  {formatStatus(status)}
                </span>
                <span
                  className="text-[10px] tabular-nums font-semibold"
                  style={{ color: '#FAFAFA' }}
                >
                  {colApps.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2 space-y-1.5">
                {colApps.map((app) => (
                  <AppCard
                    key={app._id}
                    app={app}
                    onDragStart={() => setDragId(app._id)}
                    onMarkRejected={() => handleMarkRejected(app._id)}
                    onFollowUp={() => handleFollowUp(app._id)}
                  />
                ))}
                {colApps.length === 0 && (
                  <div
                    className="flex items-center justify-center py-8 text-xs rounded-md"
                    style={{ color: '#3F3F46' }}
                  >
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Rejected */}
        <div
          className="shrink-0 w-56 flex flex-col rounded-xl"
          style={{
            background: 'rgba(24,24,27,0.65)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-3"
            style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.04)' }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-red-400">
              Rejected
            </span>
            <span
              className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md"
              style={{ background: '#27272A', color: '#52525B', boxShadow: '0 0 0 1px rgba(63,63,70,0.5)' }}
            >
              {applications.filter((a) => a.status === 'REJECTED').length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2 space-y-1.5">
            {applications
              .filter((a) => a.status === 'REJECTED')
              .map((app) => (
                <div
                  key={app._id}
                  className="p-2.5 rounded-md"
                  style={{
                    background: 'rgba(69,10,10,0.2)',
                    boxShadow: '0 0 0 1px rgba(127,29,29,0.25)',
                    opacity: 0.6,
                  }}
                >
                  <p className="text-xs font-medium truncate" style={{ color: '#FAFAFA' }}>
                    {app.company}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: '#71717A' }}>
                    {app.role}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: '#52525B' }}>
                    {app.daysSinceApply}d ago
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({
  app,
  onDragStart,
  onMarkRejected,
  onFollowUp,
}: {
  app: Application;
  onDragStart: () => void;
  onMarkRejected: () => void;
  onFollowUp: () => void;
}) {
  const isStale = app.daysSinceApply > 7;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="p-2.5 rounded-lg cursor-grab active:cursor-grabbing select-none"
      style={{
        background: 'rgba(9,9,11,0.70)',
        boxShadow: '0 1px 4px 0 rgba(0,0,0,0.16)',
      }}
    >
      <p className="text-xs font-semibold truncate" style={{ color: '#FAFAFA' }}>
        {app.company}
      </p>
      <p className="text-[11px] truncate mt-0.5" style={{ color: '#71717A' }}>
        {app.role}
      </p>
      <p
        className="text-[10px] mt-1.5"
        style={{ color: isStale ? '#F59E0B' : '#52525B' }}
      >
        {app.daysSinceApply}d
      </p>
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFollowUp();
          }}
          className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{ background: '#27272A', color: '#71717A', boxShadow: '0 1px 4px 0 rgba(0,0,0,0.20)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#71717A'; }}
        >
          Follow Up
        </button>
        {app.status !== 'REJECTED' && app.status !== 'OFFER' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRejected();
            }}
            className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: 'rgba(69,10,10,0.4)',
              color: '#F87171',
              boxShadow: '0 0 0 1px rgba(127,29,29,0.35)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(69,10,10,0.7)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(69,10,10,0.4)';
            }}
          >
            Rejected
          </button>
        )}
      </div>
    </div>
  );
}
